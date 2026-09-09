import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Cancel all tracked pipeline runs via OpenClaw CLI.
 * Fully async — no event loop blocking, no shell interpolation.
 *
 * @param {string[]} trackedIds - Array of run IDs to cancel.
 * @returns {Promise<{cancelled: number, failed: number, errors: string[]}>}
 */
export async function cancelAllRuns(trackedIds) {
  if (!trackedIds || trackedIds.length === 0) {
    return { cancelled: 0, failed: 0, errors: [] };
  }

  let cancelled = 0;
  let failed = 0;
  const errors = [];

  for (const id of trackedIds) {
    // Validate ID format — UUIDs only, reject anything with shell metacharacters
    if (!/^[a-zA-Z0-9\-]+$/.test(id)) {
      failed++;
      errors.push(`Rejected invalid run ID: ${id}`);
      continue;
    }

    try {
      await execFileAsync('openclaw', ['sessions', 'cancel', id], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      cancelled++;
    } catch (err) {
      failed++;
      errors.push(`Failed to cancel ${id}: ${err.message}`);
    }
  }

  return { cancelled, failed, errors };
}
