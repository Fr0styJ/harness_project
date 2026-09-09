import { execSync } from 'node:child_process';
import { logDecision } from '../logging/audit.mjs';

const MAX_REVIEW_CYCLES = 3;
const SECURITY_DEBATE_LIMIT = 3;

/**
 * Run a shell command, return trimmed stdout. Throws on failure.
 */
function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 60000 }).trim();
}

/**
 * Get the diff for a PR via gh CLI.
 * @param {number} prNumber
 * @returns {string}
 */
function getPRDiff(prNumber) {
  return run(`gh pr diff ${prNumber}`);
}

/**
 * Spawn a reviewer subagent and wait for its verdict.
 * In practice, the Coding Manager calls sessions_spawn directly.
 * This function prepares the prompt and returns what to spawn.
 *
 * @param {string} agentId - 'reviewer', 'security-a', or 'security-b'
 * @param {string} diff - The PR diff text
 * @param {object} context - Additional context (prior reviews, cycle count)
 * @returns {{ task: string, agentId: string }}
 */
export function prepareReview(agentId, diff, context = {}) {
  const priorReviews = context.priorReviews || [];
  const cycleCount = context.cycleCount || 0;

  let task = `You are ${agentId}. Review this PR diff and respond with either PASS or FAIL followed by your reasoning.\n\n`;
  task += `## PR Diff\n\`\`\`\n${diff.slice(0, 50000)}\n\`\`\`\n\n`;

  if (priorReviews.length > 0) {
    task += `## Prior Reviews\n`;
    for (const review of priorReviews) {
      task += `### ${review.agent}: ${review.verdict}\n${review.reasoning}\n\n`;
    }
  }

  if (cycleCount > 0) {
    task += `## Note\nThis is review cycle ${cycleCount}. Previous cycles resulted in FAIL. Address prior feedback.\n`;
  }

  task += `\nRespond with:\n- PASS: <reasoning> — code is acceptable\n- FAIL: <reasoning> — specific issues that must be fixed\n`;

  return { task, agentId };
}

/**
 * Parse a reviewer's response into a structured verdict.
 * @param {string} response
 * @returns {{ verdict: 'pass'|'fail'|'unknown', reasoning: string }}
 */
export function parseVerdict(response) {
  const text = response.trim();
  if (/^PASS[:\s]/i.test(text)) {
    return { verdict: 'pass', reasoning: text.replace(/^PASS[:\s]*/i, '').trim() };
  }
  if (/^FAIL[:\s]/i.test(text)) {
    return { verdict: 'fail', reasoning: text.replace(/^FAIL[:\s]*/i, '').trim() };
  }
  return { verdict: 'unknown', reasoning: text };
}

/**
 * Orchestrate the full review chain for a PR.
 * Returns the chain result with all verdicts and whether escalation is needed.
 *
 * @param {number} prNumber
 * @param {object} config - Loaded pipeline config
 * @returns {Promise<{verdict: string, rounds: number, details: object[], needsEscalation: boolean, escalationType: string|null}>}
 */
export async function runReviewChain(prNumber, config) {
  const diff = getPRDiff(prNumber);
  const details = [];
  let cycleCount = 0;
  let needsEscalation = false;
  let escalationType = null;

  // Step 1: Code review
  const reviewPrep = prepareReview('reviewer', diff, { cycleCount });
  await logDecision({
    runId: `pr-${prNumber}`,
    agent: 'reviewer',
    action: 'review-prepared',
    verdict: 'pending',
    timestamp: new Date().toISOString(),
    metadata: { prNumber, cycleCount },
  });

  // The actual spawn happens in the Coding Manager.
  // This module returns what to spawn and collects results.
  // For the self-contained interface, we document the expected flow:
  // 1. Coding Manager spawns reviewer with reviewPrep.task
  // 2. Gets response, calls parseVerdict()
  // 3. If FAIL, sends back to builder, increments cycleCount
  // 4. If PASS after <=MAX_REVIEW_CYCLES, proceeds to security
  // 5. If still FAIL after MAX_REVIEW_CYCLES, escalate oscillation

  return {
    verdict: 'pending',
    rounds: cycleCount,
    details,
    needsEscalation,
    escalationType,
    nextStep: 'spawn-reviewer',
    reviewPrompt: reviewPrep,
    diffLength: diff.length,
  };
}

/**
 * Check if review results indicate oscillation requiring escalation.
 * @param {number} failCycles - Number of consecutive fail cycles
 * @returns {boolean}
 */
export function isOscillation(failCycles) {
  return failCycles > MAX_REVIEW_CYCLES;
}

/**
 * Check if security debate has exceeded the round limit.
 * @param {number} debateRounds
 * @returns {boolean}
 */
export function isSecurityDeadlock(debateRounds) {
  return debateRounds > SECURITY_DEBATE_LIMIT;
}
