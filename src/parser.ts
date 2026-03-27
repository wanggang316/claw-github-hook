import { sanitize } from "./sanitize.js";

export type EventType =
  | "pr_opened"
  | "pr_comment"
  | "pr_review_comment"
  | "pr_review"
  | "issue_opened"
  | "issue_comment"
  | "unknown";

export interface GitHubEvent {
  event: string;
  action: string;
  eventType: EventType;
  installationId: number | null;
  owner: string;
  repoName: string;
  repo: string;
  sender: string;
  isBot: boolean;

  // PR fields
  prTitle: string;
  prUrl: string;
  prNumber: number | null;
  prBaseBranch: string;
  prHeadBranch: string;
  prBody: string;
  prState: string;
  prAdditions: number | null;
  prDeletions: number | null;
  prChangedFiles: number | null;
  prCommits: number | null;
  prMerged: boolean;

  // Issue fields
  issueTitle: string;
  issueUrl: string;
  issueNumber: number | null;
  issueBody: string;
  issueState: string;
  issueLabels: string[];

  // Comment fields
  commentBody: string;
  commentId: number | null;

  // Review fields (pull_request_review event)
  reviewId: number | null;
  reviewState: string;
  reviewBody: string;
}

export function parseEvent(event: string, body: Record<string, unknown>): GitHubEvent {
  const repo = nested(body, "repository", "full_name") ?? "";
  const repoName = nested(body, "repository", "name") ?? "";
  const owner = nested2(body, "repository", "owner", "login") ?? "";
  const sender = nested(body, "sender", "login") ?? "";
  const senderType = nested(body, "sender", "type") ?? "";
  const installationId = nestedNumber(body, "installation", "id");

  const pr = body.pull_request as Record<string, unknown> | undefined;
  const issue = body.issue as Record<string, unknown> | undefined;
  const comment = body.comment as Record<string, unknown> | undefined;
  const review = body.review as Record<string, unknown> | undefined;

  const prBase = pr?.base as Record<string, unknown> | undefined;
  const prHead = pr?.head as Record<string, unknown> | undefined;

  const action = str(body.action);

  // Issue labels
  const rawLabels = issue?.labels;
  const issueLabels: string[] = [];
  if (Array.isArray(rawLabels)) {
    for (const label of rawLabels) {
      if (typeof label === "object" && label !== null) {
        const name = (label as Record<string, unknown>).name;
        if (typeof name === "string") issueLabels.push(name);
      }
    }
  }

  const ev: GitHubEvent = {
    event,
    action,
    eventType: "unknown",
    installationId,
    owner,
    repoName,
    repo,
    sender,
    isBot: sender.includes("[bot]") || senderType === "Bot",

    prTitle: sanitize(str(pr?.title)),
    prUrl: str(pr?.html_url),
    prNumber: num(pr?.number),
    prBaseBranch: str(prBase?.ref),
    prHeadBranch: str(prHead?.ref),
    prBody: sanitize(str(pr?.body)),
    prState: str(pr?.state),
    prAdditions: num(pr?.additions),
    prDeletions: num(pr?.deletions),
    prChangedFiles: num(pr?.changed_files),
    prCommits: num(pr?.commits),
    prMerged: pr?.merged === true,

    issueTitle: sanitize(str(issue?.title)),
    issueUrl: str(issue?.html_url),
    issueNumber: num(issue?.number),
    issueBody: sanitize(str(issue?.body)),
    issueState: str(issue?.state),
    issueLabels,

    commentBody: sanitize(str(comment?.body)),
    commentId: num(comment?.id),

    reviewId: num(review?.id),
    reviewState: str(review?.state),
    reviewBody: sanitize(str(review?.body)),
  };

  ev.eventType = deriveEventType(event, action, ev);
  return ev;
}

export function deriveEventType(event: string, action: string, ev: GitHubEvent): EventType {
  switch (event) {
    case "pull_request":
      return "pr_opened";
    case "pull_request_review_comment":
      return "pr_review_comment";
    case "pull_request_review":
      return "pr_review";
    case "issue_comment":
      return ev.prNumber !== null ? "pr_comment" : "issue_comment";
    case "issues":
      if (action === "opened") return "issue_opened";
      return "issue_comment";
    default:
      return "unknown";
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function nested(obj: Record<string, unknown>, key1: string, key2: string): string | undefined {
  const child = obj[key1];
  if (typeof child === "object" && child !== null) {
    const val = (child as Record<string, unknown>)[key2];
    if (typeof val === "string") return val;
  }
  return undefined;
}

function nested2(
  obj: Record<string, unknown>,
  key1: string,
  key2: string,
  key3: string,
): string | undefined {
  const child = obj[key1];
  if (typeof child !== "object" || child === null) return undefined;

  const grandchild = (child as Record<string, unknown>)[key2];
  if (typeof grandchild !== "object" || grandchild === null) return undefined;

  const val = (grandchild as Record<string, unknown>)[key3];
  return typeof val === "string" ? val : undefined;
}

function nestedNumber(obj: Record<string, unknown>, key1: string, key2: string): number | null {
  const child = obj[key1];
  if (typeof child === "object" && child !== null) {
    const val = (child as Record<string, unknown>)[key2];
    if (typeof val === "number") return val;
  }
  return null;
}
