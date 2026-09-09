import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
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
 * Build the log filename: YYYY-MM-DD.jsonl (one file per day, append-only).
 * @returns {string}
 */
function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.jsonl`);
}

/**
 * Log a structured decision/event record.
 * Uses JSONL (append-only) format for safe concurrent writes.
 *
 * @param {object} event - Decision/event record.
 * @param {string} event.runId - Pipeline run identifier.
 * @param {string} event.agent - Agent that made the decision.
 * @param {string} event.action - What action was taken.
 * @param {string} event.verdict - Outcome (pass/fail/pending/etc).
 * @param {string} event.timestamp - ISO timestamp.
 * @param {object} [event.metadata] - Additional context.
 */
export async function logDecision(event) {
  ensureLogDir();

  const record = {
    timestamp: event.timestamp || new Date().toISOString(),
    runId: event.runId || 'unknown',
    agent: event.agent || 'unknown',
    action: event.action || 'unknown',
    verdict: event.verdict || 'unknown',
    metadata: event.metadata || {},
  };

  const line = JSON.stringify(record) + '\n';
  appendFileSync(getLogPath(), line, 'utf-8');
}
