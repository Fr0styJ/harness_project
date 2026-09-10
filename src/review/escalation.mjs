import { logDecision } from '../logging/audit.mjs';

/**
 * Prepare an escalation prompt for the Muse agent.
 *
 * @param {'oscillation'|'security-debate'} type
 * @param {object} context - Full context for Muse to evaluate. For 'oscillation',
 *   context.lastFailAgent should be set to whichever agent produced the most recent
 *   FAIL ('reviewer' | 'security-a' | 'security-b') so the security constraint below
 *   can be enforced.
 * @param {object} config - Loaded pipeline config
 * @returns {{ task: string, agentId: string }}
 */
export function prepareEscalation(type, context, config) {
  let task = '';

  if (type === 'oscillation') {
    const securityOriginated = context.lastFailAgent === 'security-a' || context.lastFailAgent === 'security-b';

    task = `# Escalation: Review Oscillation Detected\n\n`;
    task += `The reviewer and builder have been cycling for ${context.failCycles} rounds without resolution.\n\n`;
    task += `## Task\n${context.originalTask || 'N/A'}\n\n`;
    task += `## Review History\n`;
    for (const review of context.reviews || []) {
      task += `### Cycle ${review.cycle}: ${review.agent} → ${review.verdict}\n${review.reasoning}\n\n`;
    }
    task += `## Your Role\n`;
    task += `Analyze why the review loop isn't converging. Options:\n`;
    task += `1. **retry** — Provide specific guidance to break the deadlock, then the builder tries again\n`;
    task += `2. **block** — The code cannot be salvaged; recommend rejecting this approach\n`;
    if (securityOriginated) {
      task += `\n## Security Constraint (mandatory)\n`;
      task += `The most recent FAIL in this oscillation came from **${context.lastFailAgent}**, a security reviewer. You may NOT select **force-merge** to override a security-originated FAIL. Choose **retry** or **block** only. `;
      task += `If you believe the security concern itself is invalid or overly broad, choose **block** and explain why, and recommend re-running this as a security-debate escalation instead — do not merge around it.\n`;
    } else {
      task += `3. **force-merge** — The reviewer is being overly pedantic on a non-security (style/completeness) point; override and merge\n\n`;
    }
    task += `\nRespond with: RESOLUTION: <retry|block${securityOriginated ? '' : '|force-merge'}>\nREASONING: <detailed explanation>\n`;
  } else if (type === 'security-debate') {
    task = `# Escalation: Security Debate Deadlock\n\n`;
    task += `Security A and Security B have disagreed for ${context.debateRounds} rounds.\n\n`;
    task += `## Security A Position\n${context.securityA?.reasoning || 'N/A'}\n\n`;
    task += `## Security B Position\n${context.securityB?.reasoning || 'N/A'}\n\n`;
    task += `## Code Under Review\n\`\`\`\n${context.diff?.slice(0, 30000) || 'N/A'}\n\`\`\`\n\n`;
    task += `## Your Role\n`;
    task += `Arbitrate the security disagreement. Determine which position is correct, or propose a third option.\n`;
    task += `Respond with: VERDICT: <safe|unsafe|conditional>\nRESOLUTION: <detailed ruling and any required changes>\n\n`;
    task += `## Human Approval Requirement (mandatory)\n`;
    task += `A verdict of **unsafe** or **conditional** means the pipeline MUST NOT auto-merge under any circumstances, no matter what happens in subsequent cycles — this requires an explicit human review and approval before merge can proceed. State this plainly in your RESOLUTION text. Only a verdict of **safe** permits auto-merge to continue without a human checkpoint.\n`;
  }

  return { task, agentId: 'muse' };
}

/**
 * Parse Muse's escalation response.
 * @param {string} response
 * @param {'oscillation'|'security-debate'} type
 * @param {object} [context] - Same context passed to prepareEscalation, used to
 *   compute requiresHumanApproval accurately.
 * @returns {{ resolution: string, reasoning: string, requiresHumanApproval: boolean, raw: string }}
 */
export function parseEscalationResponse(response, type, context = {}) {
  const text = response.trim();

  if (type === 'oscillation') {
    const resMatch = text.match(/RESOLUTION:\s*(retry|block|force-merge)/i);
    const reasonMatch = text.match(/REASONING:\s*([\s\S]*)/i);
    const resolution = resMatch ? resMatch[1].toLowerCase() : 'unknown';
    const securityOriginated = context.lastFailAgent === 'security-a' || context.lastFailAgent === 'security-b';
    return {
      resolution,
      reasoning: reasonMatch ? reasonMatch[1].trim() : text,
      // Belt-and-suspenders: even if the model ignored the constraint and said
      // force-merge on a security-originated deadlock, flag it so the Coding
      // Manager can refuse to act on it without a human.
      requiresHumanApproval: resolution === 'force-merge' && securityOriginated,
      raw: text,
    };
  }

  if (type === 'security-debate') {
    const verdMatch = text.match(/VERDICT:\s*(safe|unsafe|conditional)/i);
    const resMatch = text.match(/RESOLUTION:\s*([\s\S]*)/i);
    const verdict = verdMatch ? verdMatch[1].toLowerCase() : 'unknown';
    return {
      resolution: verdict,
      reasoning: resMatch ? resMatch[1].trim() : text,
      requiresHumanApproval: verdict !== 'safe',
      raw: text,
    };
  }

  return { resolution: 'unknown', reasoning: text, requiresHumanApproval: true, raw: text };
}

/**
 * Log an escalation event.
 * @param {'oscillation'|'security-debate'} type
 * @param {object} context
 * @param {object} result - Parsed escalation result
 */
export async function logEscalation(type, context, result) {
  await logDecision({
    runId: context.runId || 'unknown',
    agent: 'muse',
    action: `escalation-${type}`,
    verdict: result.resolution,
    timestamp: new Date().toISOString(),
    metadata: {
      escalationType: type,
      failCycles: context.failCycles || null,
      debateRounds: context.debateRounds || null,
      requiresHumanApproval: result.requiresHumanApproval ?? null,
      reasoning: result.reasoning.slice(0, 500),
    },
  });
}
