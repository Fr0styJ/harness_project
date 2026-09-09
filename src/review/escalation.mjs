import { logDecision } from '../logging/audit.mjs';

/**
 * Prepare an escalation prompt for the Muse agent.
 *
 * @param {'oscillation'|'security-debate'} type
 * @param {object} context - Full context for Muse to evaluate
 * @param {object} config - Loaded pipeline config
 * @returns {{ task: string, agentId: string }}
 */
export function prepareEscalation(type, context, config) {
  let task = '';

  if (type === 'oscillation') {
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
    task += `3. **force-merge** — The reviewer is being overly pedantic; override and merge\n\n`;
    task += `Respond with: RESOLUTION: <retry|block|force-merge>\nREASONING: <detailed explanation>\n`;
  } else if (type === 'security-debate') {
    task = `# Escalation: Security Debate Deadlock\n\n`;
    task += `Security A and Security B have disagreed for ${context.debateRounds} rounds.\n\n`;
    task += `## Security A Position\n${context.securityA?.reasoning || 'N/A'}\n\n`;
    task += `## Security B Position\n${context.securityB?.reasoning || 'N/A'}\n\n`;
    task += `## Code Under Review\n\`\`\`\n${context.diff?.slice(0, 30000) || 'N/A'}\n\`\`\`\n\n`;
    task += `## Your Role\n`;
    task += `Arbitrate the security disagreement. Determine which position is correct, or propose a third option.\n`;
    task += `Respond with: VERDICT: <safe|unsafe|conditional>\nRESOLUTION: <detailed ruling and any required changes>\n`;
  }

  return { task, agentId: 'muse' };
}

/**
 * Parse Muse's escalation response.
 * @param {string} response
 * @param {'oscillation'|'security-debate'} type
 * @returns {{ resolution: string, reasoning: string, raw: string }}
 */
export function parseEscalationResponse(response, type) {
  const text = response.trim();

  if (type === 'oscillation') {
    const resMatch = text.match(/RESOLUTION:\s*(retry|block|force-merge)/i);
    const reasonMatch = text.match(/REASONING:\s*([\s\S]*)/i);
    return {
      resolution: resMatch ? resMatch[1].toLowerCase() : 'unknown',
      reasoning: reasonMatch ? reasonMatch[1].trim() : text,
      raw: text,
    };
  }

  if (type === 'security-debate') {
    const verdMatch = text.match(/VERDICT:\s*(safe|unsafe|conditional)/i);
    const resMatch = text.match(/RESOLUTION:\s*([\s\S]*)/i);
    return {
      resolution: verdMatch ? verdMatch[1].toLowerCase() : 'unknown',
      reasoning: resMatch ? resMatch[1].trim() : text,
      raw: text,
    };
  }

  return { resolution: 'unknown', reasoning: text, raw: text };
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
      reasoning: result.reasoning.slice(0, 500),
    },
  });
}
