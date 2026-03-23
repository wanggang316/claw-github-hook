export interface GitHubEvent {
  event: string;
  action: string;
  repo: string;
  sender: string;
  prTitle: string;
  prUrl: string;
  prNumber: number | null;
  prBaseBranch: string;
  prHeadBranch: string;
  issueTitle: string;
  issueUrl: string;
  issueNumber: number | null;
  commentBody: string;
  isBot: boolean;
}

export function parseEvent(event: string, body: Record<string, unknown>): GitHubEvent {
  const repo = nested(body, "repository", "full_name") ?? "";
  const sender = nested(body, "sender", "login") ?? "";

  const pr = body.pull_request as Record<string, unknown> | undefined;
  const issue = body.issue as Record<string, unknown> | undefined;
  const comment = body.comment as Record<string, unknown> | undefined;

  const prBase = pr?.base as Record<string, unknown> | undefined;
  const prHead = pr?.head as Record<string, unknown> | undefined;

  return {
    event,
    action: str(body.action),
    repo,
    sender,
    prTitle: str(pr?.title),
    prUrl: str(pr?.html_url),
    prNumber: num(pr?.number),
    prBaseBranch: str(prBase?.ref),
    prHeadBranch: str(prHead?.ref),
    issueTitle: str(issue?.title),
    issueUrl: str(issue?.html_url),
    issueNumber: num(issue?.number),
    commentBody: str(comment?.body),
    isBot: sender.includes("[bot]"),
  };
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
