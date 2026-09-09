import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve pipeline-logs relative to repo root (two levels up from src/logging/)
const REPO_ROOT = join(__dirname, '..', '..');
const LOG_DIR = join(REPO_ROOT, 'pipeline-logs');

// HMAC key for log integrity chain — derived from a fixed seed.
// In production, this should come from env or secrets store.
const INTEGRITY_KEY = process.env.PIPELINE_LOG_KEY || 'harness-pipeline-integrity-v1';

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
 * Compute HMAC-SHA256 of a record chained to the previous hash.
 * @param {object} record - The log record to hash.
 * @param {string} prevHash - Hash of the previous record (or 'genesis' for first).
 * @returns {string} Hex-encoded HMAC.
 */
function computeChainHash(record, prevHash) {
  const payload = JSON.stringify(record) + '|' + prevHash;
  return createHmac('sha256', INTEGRITY_KEY).update(payload).digest('hex');
}

/**
 * Get the last hash from today's log file (if any).
 * @param {string} logPath
 * @returns {string} Last hash or 'genesis'.
 */
function getLastHash(logPath) {
  if (!existsSync(logPath)) return 'genesis';
  try {
    const content = readFileSync(logPath, 'utf-8').trim();
    if (!content) return 'genesis';
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1];
    const lastRecord = JSON.parse(lastLine);
    return lastRecord._chainHash || 'genesis';
  } catch {
    return 'genesis';
  }
}

/**
 * Log a structured decision/event record with integrity chain.
 * Uses JSONL (append-only) format with HMAC chaining for tamper detection.
 * Note: Files use .jsonl extension (one JSON object per line).
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

  const logPath = getLogPath();
  const prevHash = getLastHash(logPath);
  const chainHash = computeChainHash(record, prevHash);

  // Attach chain metadata (underscore prefix = internal)
  record._prevHash = prevHash;
  record._chainHash = chainHash;

  const line = JSON.stringify(record) + '\n';
  appendFileSync(logPath, line, 'utf-8');
}
