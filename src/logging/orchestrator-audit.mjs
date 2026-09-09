import { logDecision } from './audit.mjs';

/**
 * Log a review verdict from the orchestration layer.
 * Call this after each reviewer subagent returns a verdict.
 *
 * @param {object} params
 * @param {string} params.prNumber - PR number being reviewed
 * @param {string} params.agent - Reviewer agent id (reviewer, security-a, security-b)
 * @param {string} params.verdict - pass, fail, or unknown
 * @param {string} params.reasoning - Reviewer's reasoning text
 * @param {number} [params.cycleCount] - Current review cycle number
 * @param {string} [params.phase] - code-review or security-review
 */
export async function logReviewVerdict({ prNumber, agent, verdict, reasoning, cycleCount, phase }) {
  await logDecision({
    runId: `pr-${prNumber}`,
    agent,
    action: phase || 'review',
    verdict,
    timestamp: new Date().toISOString(),
    metadata: {
      prNumber,
      cycleCount: cycleCount ?? 0,
      reasoningPreview: reasoning?.slice(0, 500) || '',
    },
  });
}

/**
 * Log an escalation event from the orchestration layer.
 * @param {object} params
 * @param {string} params.prNumber
 * @param {'oscillation'|'security-debate'} params.type
 * @param {string} params.resolution - retry, block, force-merge, safe, unsafe, conditional
 * @param {string} params.reasoning
 */
export async function logEscalationEvent({ prNumber, type, resolution, reasoning }) {
  await logDecision({
    runId: `pr-${prNumber}`,
    agent: 'muse',
    action: `escalation-${type}`,
    verdict: resolution,
    timestamp: new Date().toISOString(),
    metadata: {
      prNumber,
      escalationType: type,
      reasoningPreview: reasoning?.slice(0, 500) || '',
    },
  });
}

/**
 * Log a merge decision.
 * @param {object} params
 * @param {string} params.prNumber
 * @param {'auto'|'manual'} params.mergeType
 * @param {string} params.status - merged, blocked, paused
 * @param {string} [params.reason]
 */
export async function logMergeDecision({ prNumber, mergeType, status, reason }) {
  await logDecision({
    runId: `pr-${prNumber}`,
    agent: 'coding-manager',
    action: 'merge-decision',
    verdict: status,
    timestamp: new Date().toISOString(),
    metadata: {
      prNumber,
      mergeType,
      reason: reason || '',
    },
  });
}

/**
 * Backfill audit records for the harness v1 self-review.
 * Reconstructs the review chain from known outcomes.
 */
export async function backfillSelfReviewAudit() {
  const events = [
    { prNumber: '1', agent: 'reviewer', verdict: 'fail', reasoning: 'Round 1: shell injection in pr-enforcer, dispatcher stub, incomplete review chain, fragile JSON5 parser, sync execSync, merge counter ambiguity', cycleCount: 0, phase: 'code-review' },
    { prNumber: '1', agent: 'coding-manager', verdict: 'fix-applied', reasoning: 'Fixed all 6 round 1 issues in commit bccfc87', cycleCount: 1, phase: 'remediation' },
    { prNumber: '1', agent: 'reviewer', verdict: 'fail', reasoning: 'Round 2: killswitch.mjs still used sync execSync with shell interpolation', cycleCount: 1, phase: 'code-review' },
    { prNumber: '1', agent: 'coding-manager', verdict: 'fix-applied', reasoning: 'Fixed killswitch in commit 3e5ed45', cycleCount: 2, phase: 'remediation' },
    { prNumber: '1', agent: 'reviewer', verdict: 'pass', reasoning: 'Round 3: all issues resolved, zero injection vectors, all modules match architecture', cycleCount: 2, phase: 'code-review' },
    { prNumber: '1', agent: 'security-a', verdict: 'fail', reasoning: 'Round 1: 6 findings including session key validation, path traversal, log tamper resistance, merge counter race, diff injection, prNumber validation', cycleCount: 0, phase: 'security-review' },
    { prNumber: '1', agent: 'coding-manager', verdict: 'fix-applied', reasoning: 'Fixed all 6 Security A findings in commit fe5d745', cycleCount: 1, phase: 'remediation' },
    { prNumber: '1', agent: 'security-a', verdict: 'pass', reasoning: 'Round 2: all 6 findings verified resolved, no new issues', cycleCount: 1, phase: 'security-review' },
    { prNumber: '1', agent: 'security-b', verdict: 'fail', reasoning: 'Independent review: 8 findings including hardcoded HMAC key, merge counter race, prompt injection via prior reviews, escalation diff injection, symlink bypass, error leakage, silent error swallowing', cycleCount: 0, phase: 'security-review' },
    { prNumber: '1', agent: 'coding-manager', verdict: 'fix-applied', reasoning: 'Fixed 7 actionable Security B findings (skipped #8 as acceptable v1 risk)', cycleCount: 1, phase: 'remediation' },
    { prNumber: '1', agent: 'security-b', verdict: 'pass', reasoning: 'All critical and moderate issues resolved', cycleCount: 1, phase: 'security-review' },
    { prNumber: '1', agent: 'coding-manager', verdict: 'merged', reasoning: 'Manual merge approval by repo owner after full review chain passed', cycleCount: 0, phase: 'merge' },
  ];

  for (const evt of events) {
    if (evt.phase === 'merge') {
      await logMergeDecision({ prNumber: evt.prNumber, mergeType: 'manual', status: evt.verdict, reason: evt.reasoning });
    } else {
      await logReviewVerdict(evt);
    }
  }

  return { backfilled: events.length };
}
