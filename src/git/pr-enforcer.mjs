import { execSync } from 'node:child_process';

const PROTECTED_BRANCH = 'main';

/**
 * Execute a shell command synchronously, returning trimmed stdout.
 * Throws on non-zero exit.
 */
function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30000,
    ...opts,
  }).trim();
}

/**
 * Create a feature branch, push commits, and open a PR via gh CLI.
 * Blocks direct pushes to main.
 *
 * @param {string} branch - Feature branch name to create/push.
 * @param {string} title - PR title.
 * @param {string} body - PR body/description.
 * @returns {Promise<{prNumber: number|null, url: string|null}>}
 */
export async function createPR(branch, title, body) {
  if (!branch || typeof branch !== 'string') {
    throw new Error('Branch name is required');
  }
  if (branch === PROTECTED_BRANCH) {
    throw new Error(`Direct pushes to ${PROTECTED_BRANCH} are blocked. Use a feature branch.`);
  }

  // Ensure we're not accidentally on main with uncommitted changes
  const currentBranch = run('git rev-parse --abbrev-ref HEAD');
  if (currentBranch === PROTECTED_BRANCH) {
    throw new Error(
      `Cannot create PR from ${PROTECTED_BRANCH}. Switch to a feature branch first.`
    );
  }

  // Create and checkout the feature branch if it doesn't exist yet
  try {
    run(`git rev-parse --verify ${branch} 2>/dev/null`);
    // Branch exists, just switch to it
    run(`git checkout ${branch}`);
  } catch {
    // Branch doesn't exist, create it
    run(`git checkout -b ${branch}`);
  }

  // Push the branch to origin
  run(`git push origin ${branch}`);

  // Create the PR via gh CLI
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedBody = body.replace(/"/g, '\\"');

  const prOutput = run(
    `gh pr create --base ${PROTECTED_BRANCH} --head ${branch} --title "${escapedTitle}" --body "${escapedBody}"`
  );

  // gh pr create outputs the PR URL on success
  const url = prOutput.startsWith('http') ? prOutput : null;

  // Extract PR number from URL or via gh
  let prNumber = null;
  if (url) {
    const match = url.match(/\/pull\/(\d+)/);
    if (match) prNumber = parseInt(match[1], 10);
  }

  if (!prNumber) {
    try {
      const numStr = run(
        `gh pr view ${branch} --json number --jq '.number'`
      );
      prNumber = parseInt(numStr, 10) || null;
    } catch {
      // Could not extract PR number
    }
  }

  return { prNumber, url };
}
