import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_STATE_FILE = join(REPO_ROOT, 'pipeline-logs', 'merge-state.json');

/**
 * Read merge state from disk.
 * @param {string} stateFile
 * @returns {{ count: number, pausedForHuman: boolean, lastMergeAt: string|null }}
 */
function readState(stateFile) {
  if (!existsSync(stateFile)) {
    return { count: 0, pausedForHuman: false, lastMergeAt: null };
  }
  try {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return { count: 0, pausedForHuman: false, lastMergeAt: null };
  }
}

/**
 * Write merge state to disk.
 * @param {string} stateFile
 * @param {object} state
 */
function writeState(stateFile, state) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Check if auto-merge is allowed under the cap.
 *
 * Returns a structured result distinguishing:
 * - allowed: under cap, proceed with merge
 * - paused: at or over cap, waiting for human approval
 * - reset: human approved, reset counter and proceed
 *
 * @param {string} [stateFile] - Path to merge state file.
 * @param {number} [cap=3] - Maximum consecutive auto-merges before pause.
 * @returns {{ allowed: boolean, count: number, remaining: number, pausedForHuman: boolean, reason: string }}
 */
export function checkMergeCap(stateFile, cap = 3) {
  const resolved = stateFile || DEFAULT_STATE_FILE;
  const state = readState(resolved);

  if (state.pausedForHuman) {
    return {
      allowed: false,
      count: state.count,
      remaining: 0,
      pausedForHuman: true,
      reason: `Paused for human approval after ${state.count} consecutive auto-merges. Call resetMergeCounter() after human approves.`,
    };
  }

  const remaining = Math.max(0, cap - state.count);

  if (state.count >= cap) {
    // Transition to paused state
    state.pausedForHuman = true;
    writeState(resolved, state);
    return {
      allowed: false,
      count: state.count,
      remaining: 0,
      pausedForHuman: true,
      reason: `Merge cap (${cap}) reached. Paused for human approval.`,
    };
  }

  return {
    allowed: true,
    count: state.count,
    remaining,
    pausedForHuman: false,
    reason: `${remaining} auto-merge(s) remaining before pause.`,
  };
}

/**
 * Record a successful auto-merge.
 * @param {string} [stateFile]
 * @returns {{ count: number, remaining: number }}
 */
export function recordMerge(stateFile) {
  const resolved = stateFile || DEFAULT_STATE_FILE;
  const state = readState(resolved);
  state.count += 1;
  state.lastMergeAt = new Date().toISOString();
  writeState(resolved, state);

  const cap = 3; // default cap
  return {
    count: state.count,
    remaining: Math.max(0, cap - state.count),
  };
}

/**
 * Reset the merge counter after human approval.
 * @param {string} [stateFile]
 */
export function resetMergeCounter(stateFile) {
  const resolved = stateFile || DEFAULT_STATE_FILE;
  writeState(resolved, { count: 0, pausedForHuman: false, lastMergeAt: null });
}
