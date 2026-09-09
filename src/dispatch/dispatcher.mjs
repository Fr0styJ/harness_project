import { logDecision } from '../logging/audit.mjs';

/** @type {Set<string>} */
const trackedRuns = new Set();

/**
 * Dispatch a task to a builder agent.
 *
 * This module prepares spawn parameters and tracks run IDs.
 * The actual sessions_spawn call is made by the Coding Manager,
 * since subagents cannot call sessions_spawn themselves.
 *
 * @param {object} taskDef - Task definition.
 * @param {string} taskDef.title - Short task title.
 * @param {string} taskDef.description - Full task prompt for the subagent.
 * @param {string} taskDef.targetAgent - Agent id (e.g. 'builder-1').
 * @param {string} [taskDef.branch] - Git branch name to work on.
 * @param {string[]} [taskDef.files] - Files this task is expected to touch.
 * @param {object} config - Loaded pipeline config.
 * @returns {Promise<{params: object, fallbacks: string[], status: string}>}
 */
export async function dispatchTask(taskDef, config) {
  const agent = config.agents[taskDef.targetAgent];
  if (!agent) {
    throw new Error(`Unknown agent: ${taskDef.targetAgent}`);
  }

  const model = agent.model;
  const fallbacks = agent.fallbacks || [];
  const workspace = agent.workspace || '.';
  const wsPath = workspace.replace(/^~/, process.env.HOME || '/home/ccadmin');

  // Build the spawn parameters that the Coding Manager will pass to sessions_spawn
  const spawnParams = {
    task: taskDef.description,
    label: `${taskDef.targetAgent}: ${taskDef.title}`,
    visible: true,
    runtime: 'subagent',
    mode: 'run',
    cwd: wsPath,
    model,
  };

  await logDecision({
    runId: 'pending',
    agent: taskDef.targetAgent,
    action: 'dispatch-prepared',
    verdict: 'prepared',
    timestamp: new Date().toISOString(),
    metadata: {
      title: taskDef.title,
      branch: taskDef.branch || null,
      files: taskDef.files || [],
      model,
    },
  });

  return {
    params: spawnParams,
    fallbacks,
    status: 'ready-to-spawn',
  };
}

/**
 * Register a run ID for kill switch tracking after Coding Manager spawns.
 * @param {string} runId
 */
export function trackRun(runId) {
  trackedRuns.add(runId);
}

/**
 * Remove a run ID from tracking (completed or cancelled).
 * @param {string} runId
 */
export function untrackRun(runId) {
  trackedRuns.delete(runId);
}

/**
 * Get all currently tracked run IDs.
 * @returns {string[]}
 */
export function getTrackedRuns() {
  return Array.from(trackedRuns);
}
