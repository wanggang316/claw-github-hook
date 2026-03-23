import type { GitHubEvent } from "./parser.js";
import type { Intent } from "./router.js";
import type { RouteConfig } from "./types.js";

export function buildMessage(ev: GitHubEvent, intent: Intent, route: RouteConfig): string {
  switch (intent) {
    case "qa":
      return buildQAMessage(ev, route);
    case "code-review":
      return buildCodeReviewMessage(ev, route);
    case "code-mod":
      return buildCodeModMessage(ev, route);
    case "ignore":
      return "";
  }
}

function buildQAMessage(ev: GitHubEvent, route: RouteConfig): string {
  const mention = route.botMention ?? "@claw";
  const question = stripMention(ev.commentBody, mention);
  const ref = ev.prNumber
    ? `PR #${ev.prNumber}: ${ev.prTitle}\n${ev.prUrl}`
    : ev.issueNumber
      ? `Issue #${ev.issueNumber}: ${ev.issueTitle}\n${ev.issueUrl}`
      : "";

  const lines = [
    `[GitHub Q&A] Repo: ${ev.repo}`,
    `Sender: ${ev.sender}`,
    ref,
    ghAccountLine(route),
    "",
    `Question: ${question}`,
    "",
    `Reply by posting a comment on the ${ev.prNumber ? "PR" : "issue"} using the gh CLI.`,
    replyHint(ev),
  ];

  return lines.filter(Boolean).join("\n");
}

function buildCodeReviewMessage(ev: GitHubEvent, route: RouteConfig): string {
  const prRef = ev.prNumber
    ? `PR #${ev.prNumber}: ${ev.prTitle}\nURL: ${ev.prUrl}\nBranch: ${ev.prHeadBranch} -> ${ev.prBaseBranch}`
    : "";

  return [
    `[GitHub Code Review] Repo: ${ev.repo}`,
    `Author: ${ev.sender}`,
    prRef,
    ghAccountLine(route),
    "",
    "Review the PR for correctness, security, and code quality.",
    "",
    `Use the gh CLI to fetch the diff and post a review:`,
    `  gh pr diff ${ev.prNumber} --repo ${ev.repo}`,
    `  gh pr review ${ev.prNumber} --repo ${ev.repo} --comment --body "..."`,
  ].filter(Boolean).join("\n");
}

function buildCodeModMessage(ev: GitHubEvent, route: RouteConfig): string {
  const mention = route.botMention ?? "@claw";
  const instruction = stripMention(ev.commentBody, mention)
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
    ghAccountLine(route),
    "",
    `Instruction: ${instruction}`,
    "",
    "Steps:",
    `1. Clone: gh repo clone ${ev.repo}`,
    "2. Create a new branch",
    "3. Make the requested code changes",
    `4. Push and create PR: gh pr create --repo ${ev.repo}`,
  ].filter(Boolean).join("\n");
}

function ghAccountLine(route: RouteConfig): string {
  if (!route.ghAccount) return "";
  return `GitHub Account: ${route.ghAccount} (run \`gh auth switch --user ${route.ghAccount}\` before any gh command)`;
}

function replyHint(ev: GitHubEvent): string {
  if (ev.issueNumber) {
    return `  gh issue comment ${ev.issueNumber} --repo ${ev.repo} --body "..."`;
  }
  if (ev.prNumber) {
    return `  gh pr comment ${ev.prNumber} --repo ${ev.repo} --body "..."`;
  }
  return "";
}

function stripMention(text: string, mention: string): string {
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped + "\\s*", "gi"), "").trim();
}
