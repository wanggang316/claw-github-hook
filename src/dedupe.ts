import type { GitHubEvent } from "./parser.js";

const DEDUPE_PREFIX = "dedupe:";
const DELIVERY_PREFIX = `${DEDUPE_PREFIX}delivery:`;
const EVENT_PREFIX = `${DEDUPE_PREFIX}event:`;
const DEDUPE_TTL_SECONDS = 60 * 30;

export async function claimDelivery(
  kv: KVNamespace,
  deliveryId: string | null,
): Promise<boolean> {
  if (!deliveryId) return true;
  return claimKey(kv, `${DELIVERY_PREFIX}${deliveryId}`);
}

export async function claimEvent(kv: KVNamespace, ev: GitHubEvent): Promise<boolean> {
  const semanticKey = eventSemanticKey(ev);
  if (!semanticKey) return true;
  return claimKey(kv, `${EVENT_PREFIX}${semanticKey}`);
}

async function claimKey(kv: KVNamespace, key: string): Promise<boolean> {
  const existing = await kv.get(key);
  if (existing !== null) return false;

  await kv.put(key, "1", { expirationTtl: DEDUPE_TTL_SECONDS });
  return true;
}

function eventSemanticKey(ev: GitHubEvent): string | null {
  const scope = [
    ev.installationId ?? "none",
    ev.owner,
    ev.repoName,
    ev.event,
    ev.action,
  ].join(":");

  if (ev.commentId !== null) {
    return `${scope}:comment:${ev.commentId}`;
  }

  if (ev.reviewId !== null) {
    return `${scope}:review:${ev.reviewId}`;
  }

  if (ev.prNumber !== null) {
    return `${scope}:pr:${ev.prNumber}`;
  }

  if (ev.issueNumber !== null) {
    return `${scope}:issue:${ev.issueNumber}`;
  }

  return null;
}
