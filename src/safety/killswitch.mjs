import { execSync } from 'node:child_process';

/**
 * Cancel all tracked pipeline run IDs immediately.
 * Shells out to `openclaw sessions cancel` for each tracked ID.
 *
 * @param {string[]} trackedIds - Array of session/run IDs to cancel.
 * @returns {Promise<{cancelled: string[], failed: Array<{id: string, error: string}>}>}
 */
export async function cancelAllRuns(trackedIds) {
  if (!Array.isArray(trackedIds) || trackedIds.length === 0) {
    return { cancelled: [], failed: [] };
  }

  const cancelled = [];
  const failed = [];

  for (const id of trackedIds) {
    if (!id || typeof id !== 'string') continue;

    try {
      execSync(`openclaw sessions cancel ${id} 2>&1`, {
        encoding: 'utf-8',
        timeout: 15000,
      });
      cancelled.push(id);
    } catch (err) {
      failed.push({
        id,
        error: err.message?.trim() ?? 'Unknown cancellation error',
      });
    }
  }

  // Log the emergency stop
  const timestamp = new Date().toISOString();
  console.error(
    `[KILLSWITCH] ${timestamp} — Emergency stop triggered. ` +
    `Cancelled: ${cancelled.length}, Failed: ${failed.length}`
  );

  return { cancelled, failed };
}
