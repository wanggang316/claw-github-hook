export interface RouteTarget {
  openclawUrl: string;   // e.g. "https://xxx.trycloudflare.com"
  openclawToken: string; // env-var name to resolve, e.g. "$TOKEN_PROJ1"
  agentId: string;       // OpenClaw agent ID, e.g. "<agent_id>"
  autoReview?: boolean;  // overrides global AUTO_REVIEW for this repo
  ghAccount?: string;    // GitHub account for `gh auth switch`, e.g. "wanggang316"
  botMention?: string;   // custom mention trigger, e.g. "@mybot" (default: "@claw")
}

export interface OrgRouteConfig {
  installationId?: number;
  owner: string;
  defaults: RouteTarget;
  repos?: Record<string, Partial<RouteTarget>>;
}

export interface RouteLookup {
  installationId: number | null;
  owner: string;
  repo: string;
}

export interface ResolvedRoute extends RouteTarget {
  installationId: number | null;
  owner: string;
  repo: string;
}

export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  AUTO_REVIEW: string;
  ROUTES_KV: KVNamespace;
  [key: string]: unknown;
}
