import type { GitHubEvent } from "./parser.js";

export type Intent = "qa" | "code-review" | "code-mod" | "ignore";

export function routeIntent(ev: GitHubEvent, autoReview: boolean, botMention: string = "@claw"): Intent {
  if (ev.isBot) return "ignore";

  const comment = ev.commentBody.toLowerCase();
  const mention = botMention.toLowerCase();

  // Command routing from comments (any event with a comment mentioning the bot)
  if (comment.includes(`${mention} /fix`) || comment.includes(`${mention} /implement`)) {
    return "code-mod";
  }

  if (comment.includes(`${mention} /review`)) {
    return "code-review";
  }

  if (comment.includes(mention)) {
    return "qa";
  }

  // Auto-review on PR opened
  if (ev.eventType === "pr_opened" && ev.action === "opened" && autoReview) {
    return "code-review";
  }

  return "ignore";
}
