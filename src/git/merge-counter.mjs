import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_CAP = 3;

/**
 * Read the current merge count state from a file.
 * Returns 0 if the file doesn't exist or is invalid.
 */
function readState(stateFile) {
  if (!existsSync(stateFile)) {
    return { consecutiveMerges: 0, lastMerge: null };
  }
  try {
    const raw = readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      consecutiveMerges: Number(parsed.consecutiveMerges) || 0,
      lastMerge: parsed.lastMerge ?? null,
    };
  } catch {
    return { consecutiveMerges: 0, lastMerge: null };
  }
}

/**
 * Write merge count state to a file.
 */
function writeState(stateFile, state) {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/**
 * Track consecutive auto-merges and pause after reaching the cap.
 * Call this before performing an auto-merge to check if it's allowed.
 *
 * @param {string} stateFile - Path to the JSON state file tracking merge counts.
 * @param {number} [cap=3] - Maximum consecutive auto-merges before requiring human approval.
 * @returns {Promise<{allowed: boolean, count: number, remaining: number}>}
 */
export async function checkMergeCap(stateFile, cap = DEFAULT_CAP) {
  if (!stateFile || typeof stateFile !== 'string') {
    throw new Error('stateFile path is required');
  }

  const effectiveCap = Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAP;
  const state = readState(stateFile);

  if (state.consecutiveMerges >= effectiveCap) {
    // Cap reached — pause and require human approval
    return {
      allowed: false,
      count: state.consecutiveMerges,
      remaining: 0,
    };
  }

  // Increment the counter for this merge
  const newCount = state.consecutiveMerges + 1;
  writeState(stateFile, {
    consecutiveMerges: newCount,
    lastMerge: new Date().toISOString(),
  });

  return {
    allowed: newCount < effectiveCap,
    count: newCount,
    remaining: Math.max(0, effectiveCap - newCount),
  };
}

/**
 * Reset the consecutive merge counter (e.g., after human approval or manual merge).
 *
 * @param {string} stateFile - Path to the JSON state file.
 * @returns {Promise<void>}
 */
export async function resetMergeCounter(stateFile) {
  writeState(stateFile, { consecutiveMerges: 0, lastMerge: null });
}
