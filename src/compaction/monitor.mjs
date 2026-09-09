import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_CONTEXT_LIMIT = 128000;
const DEBATE_CONTEXT_LIMIT = 80000;
const COMPACT_AT_PERCENT = 85;

const COMPACTION_PROMPT =
  'Your context is approaching the token limit. Summarize the key decisions, current state, and pending tasks from this session so far, then truncate the oldest messages to free space. Preserve all actionable information.';

/**
 * Run a command asynchronously, returning trimmed stdout.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<string>}
 */
async function runAsync(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args, {
    encoding: 'utf-8',
    timeout: 30000,
  });
  return stdout.trim();
}

/**
 * Check a session's token usage against thresholds and trigger compaction if needed.
 * Fully async — no event loop blocking.
 *
 * @param {string} sessionKey - The OpenClaw session key to check.
 * @param {object} [thresholds] - Optional threshold overrides.
 * @param {number} [thresholds.contextLimit=128000] - Max tokens before compaction consideration.
 * @param {number} [thresholds.compactAtPercent=85] - Percentage of contextLimit that triggers compaction.
 * @returns {Promise<{compacted: boolean, tokensBefore: number|null, tokensAfter: number|null}>}
 */
export async function checkAndCompact(sessionKey, thresholds = {}) {
  const contextLimit = thresholds.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const compactAtPercent = thresholds.compactAtPercent ?? COMPACT_AT_PERCENT;
  const triggerThreshold = Math.floor(contextLimit * (compactAtPercent / 100));

  let tokensBefore = null;
  let tokensAfter = null;
  let compacted = false;

  try {
    // Query session status via openclaw CLI (async)
    const raw = await runAsync('openclaw', [
      'session', 'status',
      '--session-key', sessionKey,
      '--json',
    ]);

    const status = JSON.parse(raw);
    tokensBefore = status.tokens?.total ?? status.usage?.totalTokens ?? null;

    if (tokensBefore === null) {
      return { compacted: false, tokensBefore: null, tokensAfter: null };
    }

    if (tokensBefore >= triggerThreshold) {
      // Trigger compaction by sending a summarization prompt (async)
      await runAsync('openclaw', [
        'session', 'send',
        '--session-key', sessionKey,
        '--message', COMPACTION_PROMPT,
      ]);
      compacted = true;

      // Give the session a moment to process, then re-check
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        const rawAfter = await runAsync('openclaw', [
          'session', 'status',
          '--session-key', sessionKey,
          '--json',
        ]);
        const statusAfter = JSON.parse(rawAfter);
        tokensAfter = statusAfter.tokens?.total ?? statusAfter.usage?.totalTokens ?? null;
      } catch {
        tokensAfter = null;
      }
    }
  } catch (err) {
    // Session may not exist or be accessible; return gracefully
    return { compacted: false, tokensBefore: null, tokensAfter: null };
  }

  return { compacted, tokensBefore, tokensAfter };
}
