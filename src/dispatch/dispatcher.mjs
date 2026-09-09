import { execSync } from 'node:child_process';
import { resolveModel } from '../config/loader.mjs';
import { logDecision } from '../logging/audit.mjs';

/** @type {Set<string>} */
const trackedRuns = new Set();

/**
 * Dispatch a task to a builder agent via OpenClaw sessions_spawn.
 *
 * @param {object} taskDef - Task definition.
 * @param {string} taskDef.title - Short task title.
 * @param {string} taskDef.description - Full task prompt for the subagent.
 * @param {string} taskDef.targetAgent - Agent id (e.g. 'builder-1').
 * @param {string} [taskDef.branch] - Git branch name to work on.
 * @param {string[]} [taskDef.files] - Files this task is expected to touch.
 * @param {object} config - Loaded pipeline config.
 * @returns {Promise<{runId: string|null, sessionKey: string|null, status: string}>}
 */
export async function dispatchTask(taskDef, config) {
  const { model, fallbacks } = resolveModel(config, taskDef.targetAgent);
  const workspace = config.agents[taskDef.targetAgent]?.workspace || '.';
  const wsPath = workspace.replace(/^~/, process.env.HOME || '/home/ccadmin');

  // Build the spawn command via openclaw CLI
  // In practice, the Coding Manager calls sessions_spawn directly.
  // This module prepares the parameters and tracks the run.
  const spawnParams = {
    task: taskDef.description,
    label: `${taskDef.targetAgent}: ${taskDef.title}`,
    visible: true,
    runtime: 'subagent',
    mode: 'run',
    cwd: wsPath,
    model,
  };

  const result = {
    runId: null,
    sessionKey: null,
    status: 'prepared',
    params: spawnParams,
    fallbacks,
  };

  await logDecision({
    runId: 'pending',
    agent: taskDef.targetAgent,
    action: 'dispatch',
    verdict: 'prepared',
    timestamp: new Date().toISOString(),
    metadata: {
      title: taskDef.title,
      branch: taskDef.branch || null,
      files: taskDef.files || [],
      model,
    },
  });

  return result;
}

/**
 * Register a run ID for kill switch tracking.
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
