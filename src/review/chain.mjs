import { execFileSync } from 'node:child_process';
import { logDecision } from '../logging/audit.mjs';

const MAX_REVIEW_CYCLES = 3;
const SECURITY_DEBATE_LIMIT = 3;

/**
 * Execute a command safely without shell interpolation.
 * @param {string} cmd - Command name.
 * @param {string[]} args - Arguments array.
 * @returns {string} Trimmed stdout.
 */
function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 60000 }).trim();
}

/**
 * Get the diff for a PR via gh CLI.
 * @param {number} prNumber
 * @returns {string}
 */
function getPRDiff(prNumber) {
  return run('gh', ['pr', 'diff', String(prNumber)]);
}

/**
 * Prepare a review prompt for a specific reviewer agent.
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
 * Build the full review chain sequence for a PR.
 * Returns an ordered list of review steps that the Coding Manager executes.
 *
 * The Coding Manager is responsible for:
 * 1. Spawning each reviewer with the prepared prompt
 * 2. Collecting verdicts via parseVerdict()
 * 3. On FAIL: sending feedback back to builder, incrementing cycleCount
 * 4. On PASS: proceeding to next step in the chain
 * 5. Checking isOscillation() / isSecurityDeadlock() between steps
 *
 * @param {number} prNumber
 * @param {object} config - Loaded pipeline config
 * @returns {Promise<{steps: object[], diffLength: number, prNumber: number}>}
 */
export async function buildReviewChain(prNumber, config) {
  const diff = getPRDiff(prNumber);

  const steps = [
    {
      agent: 'reviewer',
      phase: 'code-review',
      prepFn: () => prepareReview('reviewer', diff, { cycleCount: 0 }),
    },
    {
      agent: 'security-a',
      phase: 'security-review',
      prepFn: (context) => prepareReview('security-a', diff, context),
    },
    {
      agent: 'security-b',
      phase: 'security-review',
      prepFn: (context) => prepareReview('security-b', diff, context),
    },
  ];

  await logDecision({
    runId: `pr-${prNumber}`,
    agent: 'review-chain',
    action: 'chain-built',
    verdict: 'pending',
    timestamp: new Date().toISOString(),
    metadata: { prNumber, steps: steps.map(s => s.agent), diffLength: diff.length },
  });

  return {
    steps,
    diffLength: diff.length,
    prNumber,
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
