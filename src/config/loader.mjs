import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load and validate pipeline.json5 configuration.
 * Uses a proper JSON5-aware approach: strips comments only outside of strings.
 *
 * @param {string} [configPath] - Absolute or relative path to pipeline.json5.
 *   Defaults to ~/.openclaw/workspaces/pipeline-config/pipeline.json5
 * @returns {{ pipeline: object, agents: object, routing: object, compaction: object, repositories: object }}
 */
export async function loadConfig(configPath) {
  const resolved = configPath
    ? resolve(configPath)
    : resolve(process.env.HOME || '/home/ccadmin', '.openclaw/workspaces/pipeline-config/pipeline.json5');

  if (!existsSync(resolved)) {
    throw new Error(`Config not found: ${resolved}`);
  }

  const raw = readFileSync(resolved, 'utf-8');
  let config;
  try {
    config = parseJson5(raw);
  } catch (err) {
    throw new Error(`Failed to parse config at ${resolved}: ${err.message}`);
  }

  // Validate required top-level keys
  const required = ['pipeline', 'agents', 'routing', 'compaction'];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required config section: ${key}`);
    }
  }

  // Validate each agent has a model and workspace
  for (const [agentId, agentDef] of Object.entries(config.agents)) {
    if (!agentDef.model) {
      throw new Error(`Agent ${agentId} missing 'model' field`);
    }
    if (agentDef.workspace) {
      const wsPath = agentDef.workspace.replace(/^~/, process.env.HOME || '/home/ccadmin');
      if (!existsSync(wsPath)) {
        throw new Error(`Agent ${agentId} workspace does not exist: ${wsPath}`);
      }
    }
  }

  return config;
}

/**
 * Parse JSON5 with proper string-aware comment stripping.
 * Handles // and /* comments only when outside quoted strings.
 * Also handles trailing commas.
 *
 * @param {string} raw - Raw JSON5 text
 * @returns {object} Parsed object
 */
function parseJson5(raw) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (escaped) {
      result += ch;
      escaped = false;
      i++;
      continue;
    }

    if (inString) {
      result += ch;
      if (ch === '\\') {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    // Not in string
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && next === '/') {
      // Skip to end of line
      while (i < raw.length && raw[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i += 2; // skip */
      continue;
    }

    result += ch;
    i++;
  }

  // Remove trailing commas before } or ]
  result = result.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(result);
}

/**
 * Resolve the model string for a given agent role from loaded config.
 *
 * @param {object} config - Loaded pipeline config.
 * @param {string} agentId - Agent identifier (e.g. 'builder-1').
 * @returns {{ model: string, fallbacks: string[] }}
 */
export function resolveModel(config, agentId) {
  const agent = config.agents[agentId];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  return {
    model: agent.model,
    fallbacks: agent.fallbacks || [],
  };
}
