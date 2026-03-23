import type { GitHubEvent } from "./parser.js";
import type { Intent } from "./router.js";

export function buildMessage(ev: GitHubEvent, intent: Intent): string {
  switch (intent) {
    case "qa":
      return buildQAMessage(ev);
    case "code-review":
      return buildCodeReviewMessage(ev);
    case "code-mod":
      return buildCodeModMessage(ev);
    case "ignore":
      return "";
  }
}

function buildQAMessage(ev: GitHubEvent): string {
  const question = stripMention(ev.commentBody);
  const ref = ev.prNumber
    ? `PR #${ev.prNumber}: ${ev.prTitle}\n${ev.prUrl}`
    : ev.issueNumber
      ? `Issue #${ev.issueNumber}: ${ev.issueTitle}\n${ev.issueUrl}`
      : "";

  return [
    `[GitHub Q&A] Repo: ${ev.repo}`,
    `Sender: ${ev.sender}`,
    ref,
    "",
    `Question: ${question}`,
    "",
    `Reply by posting a comment on the ${ev.prNumber ? "PR" : "issue"} via GitHub API.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function buildCodeReviewMessage(ev: GitHubEvent): string {
  const prRef = ev.prNumber
    ? `PR #${ev.prNumber}: ${ev.prTitle}\nURL: ${ev.prUrl}\nBranch: ${ev.prHeadBranch} -> ${ev.prBaseBranch}`
    : "";

  return [
    `[GitHub Code Review] Repo: ${ev.repo}`,
    `Author: ${ev.sender}`,
    prRef,
    "",
    "Fetch the PR diff, review it for:",
    "- Correctness and logic errors",
    "- Security issues",
    "- Code quality and style",
    "",
    "Post a PR review via GitHub API with line-level comments and a summary.",
  ].join("\n");
}

function buildCodeModMessage(ev: GitHubEvent): string {
  const instruction = stripMention(ev.commentBody)
    .replace(/^\/fix\s*/i, "")
    .replace(/^\/implement\s*/i, "")
    .trim();

  const ref = ev.prNumber
    ? `PR #${ev.prNumber}: ${ev.prTitle}\n${ev.prUrl}`
    : ev.issueNumber
      ? `Issue #${ev.issueNumber}: ${ev.issueTitle}\n${ev.issueUrl}`
      : "";

  return [
    `[GitHub Code Modification] Repo: ${ev.repo}`,
    `Requested by: ${ev.sender}`,
    ref,
    "",
    `Instruction: ${instruction}`,
    "",
    "Steps:",
    "1. Clone the repository",
    "2. Create a new branch",
    "3. Make the requested code changes",
    "4. Push the branch and open a PR",
  ].join("\n");
}

function stripMention(text: string): string {
  return text.replace(/@claw\s*/gi, "").trim();
}
