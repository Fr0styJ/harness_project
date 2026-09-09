import { execSync } from 'node:child_process';

const DEFAULT_CONTEXT_LIMIT = 128000;
const DEBATE_CONTEXT_LIMIT = 80000;
const COMPACT_AT_PERCENT = 85;

const COMPACTION_PROMPT =
  'Your context is approaching the token limit. Summarize the key decisions, current state, and pending tasks from this session so far, then truncate the oldest messages to free space. Preserve all actionable information.';

/**
 * Check a session's token usage against thresholds and trigger compaction if needed.
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
    // Query session status via openclaw CLI
    const raw = execSync(
      `openclaw sessions status ${sessionKey} --json 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15000 }
    );

    const status = JSON.parse(raw);
    tokensBefore = status?.tokensUsed ?? status?.tokenCount ?? null;

    if (tokensBefore === null) {
      return { compacted: false, tokensBefore: null, tokensAfter: null };
    }

    if (tokensBefore >= triggerThreshold) {
      // Inject summarization prompt into the session
      execSync(
        `openclaw sessions send ${sessionKey} ${JSON.stringify(COMPACTION_PROMPT)} 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      compacted = true;

      // Re-check after compaction attempt
      try {
        const afterRaw = execSync(
          `openclaw sessions status ${sessionKey} --json 2>/dev/null`,
          { encoding: 'utf-8', timeout: 15000 }
        );
        const afterStatus = JSON.parse(afterRaw);
        tokensAfter = afterStatus?.tokensUsed ?? afterStatus?.tokenCount ?? null;
      } catch {
        // Post-compaction check failed; still report as compacted
        tokensAfter = null;
      }
    }
  } catch (err) {
    // Session query or send failed — return what we have
    return {
      compacted: false,
      tokensBefore,
      tokensAfter: null,
      error: err.message,
    };
  }

  return { compacted, tokensBefore, tokensAfter };
}
