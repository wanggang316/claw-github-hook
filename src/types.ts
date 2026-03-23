export interface RouteConfig {
  repo: string;          // "owner/repo", "owner/*", or "*"
  openclawUrl: string;   // e.g. "https://xxx.trycloudflare.com"
  openclawToken: string; // env-var name to resolve, e.g. "$TOKEN_PROJ1"
  agentId: string;       // OpenClaw agent ID, e.g. "product-builder"
  autoReview?: boolean;  // overrides global AUTO_REVIEW for this repo
}

export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  AUTO_REVIEW: string;
  ROUTES_KV: KVNamespace;
  [key: string]: unknown;
}
