import type { GitHubEvent } from "./parser.js";

export type Intent = "qa" | "code-review" | "code-mod" | "ignore";

export function routeIntent(ev: GitHubEvent, autoReview: boolean): Intent {
  // 1. Bot senders are always ignored
  if (ev.isBot) return "ignore";

  const comment = ev.commentBody.toLowerCase();

  // 2. Code modification commands
  if (comment.includes("@claw /fix") || comment.includes("@claw /implement")) {
    return "code-mod";
  }

  // 3. Code review commands
  if (comment.includes("@claw /review")) {
    return "code-review";
  }

  // 4. General @claw mention → Q&A
  if (comment.includes("@claw")) {
    return "qa";
  }

  // 5. Auto-review on PR open
  if (ev.event === "pull_request" && ev.action === "opened" && autoReview) {
    return "code-review";
  }

  // 6. Everything else
  return "ignore";
}
