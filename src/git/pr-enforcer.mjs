import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const PROTECTED_BRANCH = 'main';

/**
 * Execute a gh CLI command safely using execFileSync (no shell interpolation).
 * @param {string[]} args - Arguments array passed directly to gh.
 * @returns {string} Trimmed stdout.
 */
function gh(args) {
  const result = execFileSync('gh', args, {
    encoding: 'utf-8',
    timeout: 30000,
  });
  return result.trim();
}

/**
 * Create a feature branch, push commits, and open a PR via gh CLI.
 * Uses file-based title/body to prevent shell injection.
 *
 * @param {string} branch - Feature branch name.
 * @param {string} title - PR title.
 * @param {string} body - PR body/description.
 * @returns {{ prNumber: number, url: string }}
 */
export async function createPR(branch, title, body) {
  // Safety check: never allow direct push to protected branch
  if (branch === PROTECTED_BRANCH) {
    throw new Error(`Direct operations on '${PROTECTED_BRANCH}' are blocked. Use a feature branch.`);
  }

  // Validate branch name (alphanumeric, hyphens, underscores, slashes only)
  if (!/^[a-zA-Z0-9_\-\/]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}. Only alphanumeric, hyphens, underscores, and slashes allowed.`);
  }

  // Write title and body to temp files to avoid shell injection
  const tmpDir = tmpdir();
  const id = randomUUID().slice(0, 8);
  const titleFile = join(tmpDir, `pr-title-${id}.txt`);
  const bodyFile = join(tmpDir, `pr-body-${id}.txt`);

  try {
    writeFileSync(titleFile, title, 'utf-8');
    writeFileSync(bodyFile, body, 'utf-8');

    // Create PR using --title-file and --body-file (safe from injection)
    const output = gh([
      'pr', 'create',
      '--base', PROTECTED_BRANCH,
      '--head', branch,
      '--title-file', titleFile,
      '--body-file', bodyFile,
    ]);

    // Parse PR number and URL from gh output
    // gh pr create outputs the URL on success
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
    const prNumber = urlMatch ? parseInt(urlMatch[1], 10) : null;

    return {
      prNumber,
      url: urlMatch ? urlMatch[0] : output,
    };
  } finally {
    // Clean up temp files
    try { unlinkSync(titleFile); } catch {}
    try { unlinkSync(bodyFile); } catch {}
  }
}

/**
 * Check if a branch exists locally.
 * @param {string} branch
 * @returns {boolean}
 */
export function branchExists(branch) {
  try {
    gh(['branch', '--list', branch]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Push current branch to remote.
 * @param {string} branch
 */
export async function pushBranch(branch) {
  if (branch === PROTECTED_BRANCH) {
    throw new Error(`Direct push to '${PROTECTED_BRANCH}' is blocked.`);
  }
  gh(['push', 'origin', branch]);
}
