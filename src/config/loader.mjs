import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Strip JSON5 comments and trailing commas so JSON.parse can handle it.
 * Minimal transform — no full JSON5 parser needed for our config shape.
 */
function stripJson5(raw) {
  return raw
    // Remove single-line comments (// ...)
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments (/* ... */)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1');
}

/**
 * Load and validate pipeline.json5 configuration.
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
    config = JSON.parse(stripJson5(raw));
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
