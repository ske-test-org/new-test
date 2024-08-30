// This script uses GitHub's Octokit SDK to make API requests.
// import { Octokit } from "octokit";
const { Octokit } = require("octokit");

// The size labels and their corresponding maximum number of files and lines.
// You can modify this object to reflect the size estimates that your team uses.
const sizeCutoffs = {
  tiny: { maxFiles: 4, maxLines: 9 },
  small: { maxFiles: 9, maxLines: 49 },
  medium: { maxFiles: 9, maxLines: 249 },
  large: { maxFiles: Infinity, maxLines: Infinity },
};

/**
 * Determines the size of a pull request based on
 * the number of files changed and lines added/deleted.
 *
 * @param {Object} params - Parameters for requesting information
 * about a pull request.
 * @param {Object} params.octokit - An Octokit instance for making GitHub API
 * requests. The token used to create the instance must have
 * `read` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request.
 * @param {string} params.owner - The owner of the repository where the
 * pull request is located.
 * @param {string} params.repo - The name of the repository where the
 * pull request is located.
 *
 * @returns {Promise<string>} - A promise that resolves to the size
 * of the pull request.
 *
 */
async function getPullRequestSize({ octokit, prNumber, owner, repo }) {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );

  // From the data returned about the pull request,
  // calculate the number of lines changed and the number of files changed.
  const numberLinesChanged = data.deletions + data.additions;
  const numberFilesChanged = data.changed_files;

  // Use the sizes defined in the sizeCutoffs object to
  // determine the size of the pull request.
  for (const [size, { maxFiles, maxLines }] of Object.entries(sizeCutoffs)) {
    if (numberFilesChanged <= maxFiles && numberLinesChanged <= maxLines) {
      return size;
    }
  }
}

/**
 * Labels a pull request with a specified size and removes any other size labels.
 *
 * @param {Object} params - Parameters for labeling a pull request with a size.
 * @param {Object} params.octokit - An Octokit instance for making GitHub API
 * requests. The token used to create the instance must have
 * `write` permission for pull requests.
 * @param {number} params.prNumber - The number of the pull request to label.
 * @param {string} params.owner - The owner of the repository where the
 * pull request is located.
 * @param {string} params.repo - The name of the repository where the
 * pull request is located.
 * @param {string} params.size - The size label to add to the pull request.
 *
 * @throws {Error} Throws an error if the size label is invalid.
 *
 * @returns {Promise<void>} A promise that resolves when the pull request
 * labels have been updated.
 */
async function labelPullRequestWithSize({
  octokit,
  prNumber,
  owner,
  repo,
  size,
}) {
  // Get the size labels that are defined in the sizeCutoffs object.
  const allSizes = Object.keys(sizeCutoffs);

  // Error if the input size is not one of the defined sizes.
  if (!allSizes.includes(size)) {
    throw new Error(`Invalid size label: ${size}`);
  }

  // Add the size label to the pull request
  // and get the labels that are already on the pull request.
  // (This endpoint is used to add a label to both pull requests and issues,
  // even though the path says "issues".)
  const { data } = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
    {
      owner,
      repo,
      issue_number: prNumber,
      labels: [size],
      headers: {
        "x-github-api-version": "2022-11-28",
      },
    },
  );

  // Remove any other size labels from the pull request.
  // (This endpoint is used to remove a label from both pull requests and issues,
  // even though the path says "issues".)
  const currentLabels = data.map((label) => label.name);
  const labelsToRemove = allSizes.filter(
    (potentialSize) =>
      potentialSize !== size && currentLabels.includes(potentialSize),
  );
  for (const label of labelsToRemove) {
    await octokit.request(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
      {
        owner,
        repo,
        issue_number: prNumber,
        name: label,
        headers: {
          "x-github-api-version": "2022-11-28",
        },
      },
    );
  }
}

(async () => {
  // Get the values of environment variables.
  // (These are set by the GitHub Actions workflow that will run this script.)
  const TOKEN = process.env.TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;
  const PR_NUMBER = process.env.PR_NUMBER;

  // Error if any environment variables were not set.
  if (!TOKEN || !REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  // Create an instance of `Octokit` using the token value from above.
  const octokit = new Octokit({
    auth: TOKEN,
  });

  try {
    // Get the size of the pull request.
    const prSize = await getPullRequestSize({
      octokit,
      prNumber: PR_NUMBER,
      owner: REPO_OWNER,
      repo: REPO_NAME,
    });

    // Label the pull request with the size, and remove any other size labels.
    await labelPullRequestWithSize({
      octokit,
      prNumber: PR_NUMBER,
      owner: REPO_OWNER,
      repo: REPO_NAME,
      size: prSize,
    });
  } catch (error) {
    console.error("Error processing the pull request:", error);
    process.exit(1);
  }
})();
