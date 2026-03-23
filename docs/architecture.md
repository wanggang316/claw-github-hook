# Architecture

## System Overview

claw-github-hook is a Cloudflare Worker that acts as a secure relay between GitHub webhooks and a local OpenClaw AI agent. It receives GitHub events at the edge, verifies their authenticity, classifies intent, and forwards structured messages to OpenClaw via Cloudflare Tunnel. OpenClaw's agent then uses the `gh` CLI to interact with GitHub.

## Data Flow

```
GitHub Webhook
  │ POST with X-Hub-Signature-256
  ▼
Cloudflare Worker (src/index.ts)
  │
  ├── verify.ts     ─ HMAC-SHA256 signature verification (Web Crypto API)
  ├── parser.ts      ─ Raw payload → typed GitHubEvent
  ├── config.ts      ─ Load RouteConfig[] from KV, resolve route for repo
  ├── router.ts      ─ GitHubEvent + route → Intent (qa/code-review/code-mod/ignore)
  ├── message.ts     ─ Intent → structured message with gh CLI hints
  └── openclaw.ts    ─ POST message to OpenClaw /hooks/agent
  │
  ▼
OpenClaw Gateway (local :18789, via Cloudflare Tunnel)
  │
  ▼
Agent (e.g. <agent_id>)
  │ Reads workspace Skills
  ├── skills/github-qa/       ─ Answer questions
  ├── skills/github-review/   ─ PR code review
  └── skills/github-code-mod/ ─ Code modification
  │
  ▼
GitHub (via gh CLI on the OpenClaw machine)
```

## Layer Structure

```
Types → Config → Service → Runtime
```

| Layer | Files | Responsibility |
|---|---|---|
| **Types** | `types.ts`, interfaces in `parser.ts` | `RouteConfig`, `Env`, `GitHubEvent`, `Intent` |
| **Config** | `config.ts`, `wrangler.toml`, KV namespace | Route loading, token resolution, env secrets |
| **Service** | `verify.ts`, `parser.ts`, `router.ts`, `message.ts` | Stateless processing: verify, parse, route, format |
| **Runtime** | `index.ts`, `openclaw.ts` | Worker fetch handler, HTTP forwarding |

No UI layer — GitHub itself is the user interface.

## Dependency Rules

- `index.ts` imports from all service modules; service modules do not import from `index.ts`
- `router.ts` and `message.ts` import types from `parser.ts`
- `message.ts` imports `Intent` from `router.ts` and `RouteConfig` from `types.ts`
- `openclaw.ts` imports from `types.ts` and `config.ts`
- No circular dependencies

## Key Abstractions

### RouteConfig

Maps a GitHub repo (or wildcard pattern) to an OpenClaw instance:

```typescript
interface RouteConfig {
  repo: string;          // "owner/repo", "owner/*", or "*"
  openclawUrl: string;   // Cloudflare Tunnel URL
  openclawToken: string; // "$ENV_VAR_NAME" (resolved at runtime)
  agentId: string;       // OpenClaw agent ID
  ghAccount?: string;    // For gh auth switch
  botMention?: string;   // Custom trigger mention
  autoReview?: boolean;  // Auto-review PRs on open
}
```

Resolution priority: exact match → owner wildcard → global wildcard → null (ignore).

### Intent Routing

Pure function: `(GitHubEvent, autoReview, botMention) → Intent`

| Priority | Rule | Intent |
|---|---|---|
| 1 | sender is bot (`[bot]` in login) | ignore |
| 2 | comment contains `@mention /fix` or `/implement` | code-mod |
| 3 | comment contains `@mention /review` | code-review |
| 4 | comment contains `@mention` | qa |
| 5 | PR opened + autoReview enabled | code-review |
| 6 | everything else | ignore |

### Token Indirection

OpenClaw tokens are stored as Worker Secrets, not in KV. Route configs reference them by name (e.g. `"$TOKEN_PROJ1"`), resolved at runtime via `resolveToken()`. This keeps secrets out of KV (which is not a secret store).

## Technology Choices

| Choice | Rationale |
|---|---|
| **Cloudflare Workers** | Edge deployment, no server management, global low latency |
| **TypeScript strict mode** | Boundary validation at compile time (Golden Rule 2) |
| **Web Crypto API** | HMAC verification without npm dependencies; `crypto.subtle.verify` is constant-time |
| **Cloudflare KV** | Route config updates without redeployment |
| **gh CLI (in Skills)** | OpenClaw uses local `gh` for GitHub interactions — simpler and more secure than passing API tokens through the relay |
| **Zero runtime deps** | Keeps Worker bundle minimal; avoids the 1MB compressed limit |

## Security Model

- **Webhook verification**: HMAC-SHA256 via Web Crypto API; rejects unsigned/invalid requests with 401
- **Token indirection**: Secrets stored in Worker Secrets, referenced by name in KV
- **Always-200 to GitHub**: Worker returns 200 even on OpenClaw failure, preventing retry floods
- **Bot loop prevention**: Senders with `[bot]` in login are always ignored
- **Multi-account isolation**: `gh auth switch --user` per route prevents cross-account actions
