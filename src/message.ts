import type { GitHubEvent } from "./parser.js";
import type { Intent } from "./router.js";
import type { ResolvedRoute } from "./types.js";

export function buildMessage(ev: GitHubEvent, intent: Intent, route: ResolvedRoute): string {
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

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

function buildQAMessage(ev: GitHubEvent, route: ResolvedRoute): string {
  const mention = botMention(route);
  const question = stripMention(ev.commentBody, mention);

  return [
    xmlMeta(ev, route, `${ev.sender} asked a question`),
    xmlEntityContext(ev),
    xmlBody(ev),
    tag("trigger_comment", question),
    tag("instructions", [
      `[GitHub Q&A]`,
      `Answer the question clearly and helpfully, then post your reply using the gh CLI.`,
      ``,
      replyHint(ev),
    ].join("\n")),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Code Review
// ---------------------------------------------------------------------------

function buildCodeReviewMessage(ev: GitHubEvent, route: ResolvedRoute): string {
  return [
    xmlMeta(ev, route, `Code review requested by ${ev.sender}`),
    xmlEntityContext(ev),
    xmlBody(ev),
    ev.commentBody ? tag("trigger_comment", stripMention(ev.commentBody, botMention(route))) : "",
    tag("instructions", [
      `[GitHub Code Review]`,
      `Review the PR for correctness, security, and code quality.`,
      ``,
      `Use the gh CLI to fetch the diff and post a review:`,
      `  gh pr diff ${ev.prNumber} --repo ${ev.repo}`,
      `  gh pr review ${ev.prNumber} --repo ${ev.repo} --comment --body "..."`,
    ].join("\n")),
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Code Modification
// ---------------------------------------------------------------------------

function buildCodeModMessage(ev: GitHubEvent, route: ResolvedRoute): string {
  const mention = botMention(route);
  const instruction = stripMention(ev.commentBody, mention)
    .replace(/^\/fix\s*/i, "")
    .replace(/^\/implement\s*/i, "")
    .trim();

  return [
    xmlMeta(ev, route, `Code modification requested by ${ev.sender}`),
    xmlEntityContext(ev),
    xmlBody(ev),
    tag("trigger_comment", instruction),
    branchStrategy(ev),
    tag("instructions", [
      `[GitHub Code Modification]`,
      `Make the requested code changes, then submit a PR.`,
      ``,
      `Steps:`,
      `1. Clone: gh repo clone ${ev.repo}`,
      `2. Create a new branch (or check out existing PR branch — see <branch_strategy>)`,
      `3. Make the requested code changes`,
      `4. Push and create PR: gh pr create --repo ${ev.repo}`,
    ].join("\n")),
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// XML building blocks
// ---------------------------------------------------------------------------

function xmlMeta(ev: GitHubEvent, route: ResolvedRoute, triggerContext: string): string {
  const lines = [
    tag("event_type", ev.eventType),
    tag("trigger_context", triggerContext),
    tag("trigger_username", ev.sender),
    tag("is_pr", ev.prNumber !== null ? "true" : "false"),
    tag("installation_id", ev.installationId !== null ? String(ev.installationId) : ""),
    tag("owner", ev.owner),
    tag("repo", ev.repo),
  ];

  if (route.ghAccount) {
    lines.push(tag("gh_account", route.ghAccount));
  }

  if (ev.commentId !== null) {
    lines.push(tag("comment_id", String(ev.commentId)));
  }

  return lines.join("\n");
}

function xmlEntityContext(ev: GitHubEvent): string {
  if (ev.prNumber !== null) {
    const stats = [
      ev.prState ? `State: ${ev.prState}` : "",
      ev.prAdditions !== null ? `+${ev.prAdditions}` : "",
      ev.prDeletions !== null ? `-${ev.prDeletions}` : "",
      ev.prChangedFiles !== null ? `${ev.prChangedFiles} files` : "",
      ev.prCommits !== null ? `${ev.prCommits} commits` : "",
    ].filter(Boolean).join(" | ");

    const content = [
      `PR #${ev.prNumber}: ${ev.prTitle}`,
      stats,
      `Branch: ${ev.prHeadBranch} → ${ev.prBaseBranch}`,
      `URL: ${ev.prUrl}`,
    ].filter(Boolean).join("\n");

    return tag("pr_metadata", content);
  }

  if (ev.issueNumber !== null) {
    const labels = ev.issueLabels.length > 0
      ? `Labels: ${ev.issueLabels.join(", ")}`
      : "";
    const content = [
      `Issue #${ev.issueNumber}: ${ev.issueTitle}`,
      ev.issueState ? `State: ${ev.issueState}` : "",
      labels,
      `URL: ${ev.issueUrl}`,
    ].filter(Boolean).join("\n");

    return tag("issue_metadata", content);
  }

  return "";
}

function xmlBody(ev: GitHubEvent): string {
  const parts: string[] = [];

  if (ev.prNumber !== null && ev.prBody) {
    parts.push(tag("pr_body", ev.prBody));
  }

  if (ev.issueNumber !== null && ev.issueBody) {
    parts.push(tag("issue_body", ev.issueBody));
  }

  return parts.join("\n\n");
}

function tag(name: string, content: string): string {
  return `<${name}>\n${content}\n</${name}>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function branchStrategy(ev: GitHubEvent): string {
  if (ev.prNumber !== null && ev.prState === "open") {
    return tag("branch_strategy", [
      `checkout_pr`,
      `This is an open PR. Check out the existing PR branch instead of creating a new one:`,
      `  gh pr checkout ${ev.prNumber} --repo ${ev.repo}`,
    ].join("\n"));
  }
  return tag("branch_strategy", "new_branch\nCreate a new feature branch for this change.");
}

function botMention(route: ResolvedRoute): string {
  return route.botMention ?? (route.ghAccount ? `@${route.ghAccount}` : "@claw");
}

function replyHint(ev: GitHubEvent): string {
  if (ev.issueNumber) {
    return `Reply: gh issue comment ${ev.issueNumber} --repo ${ev.repo} --body "..."`;
  }
  if (ev.prNumber) {
    return `Reply: gh pr comment ${ev.prNumber} --repo ${ev.repo} --body "..."`;
  }
  return "";
}

function stripMention(text: string, mention: string): string {
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped + "\\s*", "gi"), "").trim();
}
