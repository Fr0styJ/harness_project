import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve pipeline-logs relative to repo root (two levels up from src/logging/)
const REPO_ROOT = join(__dirname, '..', '..');
const LOG_DIR = join(REPO_ROOT, 'pipeline-logs');

/**
 * Ensure the log directory exists.
 */
function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Build the log filename: YYYY-MM-DD-<runId>.json
 */
function buildFilename(runId) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeRunId = String(runId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${date}-${safeRunId}.json`;
}

/**
 * Write a structured JSON decision record to pipeline-logs/.
 *
 * @param {object} event - The decision event to log.
 * @param {string} event.runId - Pipeline run identifier.
 * @param {string} event.agent - Agent that made the decision.
 * @param {string} event.action - Action taken.
 * @param {string} [event.verdict] - Verdict if applicable (pass/fail/escalated).
 * @param {string} [event.timestamp] - ISO timestamp; auto-generated if omitted.
 * @param {object} [event.metadata] - Additional context.
 * @returns {Promise<{path: string, event: object}>}
 */
export async function logDecision(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('logDecision requires an event object');
  }
  if (!event.runId) {
    throw new Error('event.runId is required');
  }

  ensureLogDir();

  const record = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  const filename = buildFilename(record.runId);
  const filepath = join(LOG_DIR, filename);

  // Append to existing log file for this run, or create new one
  let entries = [];
  if (existsSync(filepath)) {
    try {
      const existing = JSON.parse(readFileSync(filepath, 'utf-8'));
      entries = Array.isArray(existing) ? existing : [existing];
    } catch {
      // Corrupted file — start fresh but don't lose data silently
      entries = [];
    }
  }

  entries.push(record);
  writeFileSync(filepath, JSON.stringify(entries, null, 2) + '\n', 'utf-8');

  return { path: filepath, event: record };
}
