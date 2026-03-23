# claw-github-hook

Cloudflare Worker that relays GitHub webhooks to a local [OpenClaw](https://openclaw.ai) AI agent. Receives issue/PR events, verifies signatures, routes intent, and forwards structured messages to OpenClaw via `/hooks/agent`.

## Quick Start

```bash
npm install
npm run check          # TypeScript type check
npx wrangler dev       # Local dev server
npx wrangler deploy    # Deploy to Cloudflare
```

## Architecture

```
GitHub Webhook → Cloudflare Worker → OpenClaw /hooks/agent → Agent + Skills
```

| Layer | Files | Responsibility |
|---|---|---|
| Types | `types.ts`, `parser.ts` | RouteConfig, Env, GitHubEvent, Intent |
| Config | `config.ts`, `wrangler.toml` | KV routes, env secrets |
| Service | `verify.ts`, `parser.ts`, `router.ts`, `message.ts` | Signature check, parse, route, format |
| Runtime | `index.ts`, `openclaw.ts` | Worker entry point, OpenClaw forwarding |

Dependencies flow strictly forward: `index.ts` → service modules → types. No circular imports.

## Repository Structure

```
claw-github-hook/
├── src/                   # Cloudflare Worker source
│   ├── index.ts           # Entry point (fetch handler)
│   ├── verify.ts          # HMAC-SHA256 signature verification
│   ├── parser.ts          # GitHub payload → GitHubEvent
│   ├── router.ts          # Intent routing (qa/code-review/code-mod/ignore)
│   ├── message.ts         # Build structured message per intent
│   ├── openclaw.ts        # POST to OpenClaw /hooks/agent
│   ├── config.ts          # Load routes from KV, resolve tokens
│   └── types.ts           # RouteConfig, Env interfaces
├── skills/                # OpenClaw workspace skills (copy to OpenClaw)
│   ├── github-qa/         # Answer questions via gh CLI
│   ├── github-review/     # PR code review via gh CLI
│   └── github-code-mod/   # Code modification via gh CLI
├── docs/                  # Project documentation
│   ├── architecture.md    # System design and data flow
│   ├── golden-rules.md    # Enforced principles
│   ├── design-docs/       # Feature design documentation
│   └── exec-plans/        # Implementation plans with progress
├── wrangler.toml          # Worker + KV config
└── .env.example           # Secrets and KV routes sample
```

## Key Concepts

- **RouteConfig**: Maps GitHub repos to OpenClaw instances (`repo → agentId + URL + token`)
- **Intent routing**: Pure function, rule-based (`@mention /command` → qa/review/code-mod)
- **Bot mention**: Defaults to `@ghAccount`, customizable via `botMention` in route config
- **gh CLI**: Skills use `gh` for all GitHub interactions, with `gh auth switch` for multi-account

## Golden Rules

1. **AGENTS.md is a map, not a manual** — keep under 150 lines
2. **Validate boundaries** — Zod-less type guards at system edges
3. **Prefer shared utilities** — centralize invariants
4. **Every decision gets logged** — ExecPlans for complex work
5. **Fix the environment, not the prompt** — add tools/docs/guardrails

See [Golden Rules](docs/golden-rules.md) for the full list.

## Documentation

| Path | Purpose |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Data flow, layers, technology choices |
| [docs/golden-rules.md](docs/golden-rules.md) | Enforced principles |
| [docs/exec-plans/](docs/exec-plans/) | Implementation plans |
| [.env.example](.env.example) | Config reference |

## Build & Test

```bash
npm run check     # tsc --noEmit
npm run dev       # wrangler dev (local)
npm run deploy    # wrangler deploy
```
