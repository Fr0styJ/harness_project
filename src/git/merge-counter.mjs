import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_STATE_FILE = join(REPO_ROOT, 'pipeline-logs', 'merge-state.json');

/**
 * Read merge state from disk with integrity check.
 * @param {string} stateFile
 * @returns {{ count: number, pausedForHuman: boolean, lastMergeAt: string|null, _seq: number }}
 */
function readState(stateFile) {
  if (!existsSync(stateFile)) {
    return { count: 0, pausedForHuman: false, lastMergeAt: null, _seq: 0 };
  }
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    // Ensure monotonic sequence number exists
    if (typeof state._seq !== 'number') state._seq = 0;
    return state;
  } catch {
    return { count: 0, pausedForHuman: false, lastMergeAt: null, _seq: 0 };
  }
}

/**
 * Write merge state atomically using temp file + rename.
 * Prevents corruption from concurrent writes or crashes mid-write.
 * @param {string} stateFile
 * @param {object} state
 */
function writeState(stateFile, state) {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  // Increment sequence number for monotonic guard
  state._seq = (state._seq || 0) + 1;
  state._updatedAt = new Date().toISOString();
  
  // Atomic write: temp file then rename
  const tmpFile = stateFile + '.' + randomUUID().slice(0, 8) + '.tmp';
  writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmpFile, stateFile);
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
 * Record a successful auto-merge with monotonic guard.
 * Rejects writes with stale sequence numbers to prevent lost updates.
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
  writeState(resolved, { count: 0, pausedForHuman: false, lastMergeAt: null, _seq: 0 });
}
