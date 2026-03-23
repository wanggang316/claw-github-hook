# claw-github-hook

A Cloudflare Worker that relays GitHub webhook events to a local [OpenClaw](https://openclaw.ai) AI agent, enabling AI-powered Q&A, code review, and code modification directly from GitHub issues and pull requests.

## How It Works

```
GitHub Webhook (issue/PR event)
  │
  ▼ HTTPS POST
Cloudflare Worker (edge)
  │ 1. Verify HMAC-SHA256 signature
  │ 2. Parse GitHub event payload
  │ 3. Route intent: qa / code-review / code-mod / ignore
  │ 4. Build structured message with gh CLI hints
  │ 5. POST to OpenClaw /hooks/agent
  ▼
OpenClaw (local, via Cloudflare Tunnel)
  │ Agent reads workspace Skills
  │ Uses gh CLI for all GitHub interactions
  ▼
GitHub (reply posted via gh CLI)
```

## Features

- **HMAC-SHA256 signature verification** — rejects forged webhooks
- **Intent routing** — `@mention /review`, `@mention /fix`, `@mention <question>`
- **Multi-repo routing** — route different repos to different OpenClaw agents via Cloudflare KV
- **Multi-account support** — `gh auth switch` per route for multiple GitHub accounts
- **Custom bot mention** — defaults to `@ghAccount`, configurable per route
- **Zero runtime dependencies** — Web Crypto API only, no npm packages at runtime

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Cloudflare account](https://dash.cloudflare.com/)
- [OpenClaw](https://openclaw.ai) running locally
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) exposing OpenClaw
- [GitHub CLI (gh)](https://cli.github.com/) installed and authenticated on the OpenClaw machine

### 1. Install & Build

```bash
git clone https://github.com/your-org/claw-github-hook.git
cd claw-github-hook
npm install
npm run check
```

### 2. Create KV Namespace

```bash
wrangler kv namespace create ROUTES_KV
```

Copy the returned `id` into `wrangler.toml`.

### 3. Set Secrets

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET   # random string, same as GitHub webhook config
wrangler secret put AUTO_REVIEW              # "true" or "false"
wrangler secret put TOKEN_PROJ1              # OpenClaw hooks token
```

### 4. Upload Routes

```bash
wrangler kv key put routes '[
  {
    "repo": "myorg/myrepo",
    "openclawUrl": "https://openclaw.example.com",
    "openclawToken": "$TOKEN_PROJ1",
    "agentId": "product-builder",
    "ghAccount": "my-github-user"
  },
  {
    "repo": "*",
    "openclawUrl": "https://openclaw.example.com",
    "openclawToken": "$TOKEN_PROJ1",
    "agentId": "product-builder"
  }
]' --binding ROUTES_KV --remote
```

### 5. Deploy

```bash
wrangler deploy
```

### 6. Configure GitHub Webhook

In your GitHub repo: **Settings → Webhooks → Add webhook**

| Field | Value |
|---|---|
| Payload URL | Your Worker URL (e.g. `https://claw-github-hook.xxx.workers.dev`) |
| Content type | `application/json` |
| Secret | Same value as `GITHUB_WEBHOOK_SECRET` |
| Events | Issues, Issue comments, Pull requests, PR review comments |

### 7. Install Skills in OpenClaw

Copy the skills to your OpenClaw workspace:

```bash
cp -r skills/* ~/.openclaw/skills/
```

## Usage

Once configured, mention the bot in any issue or PR comment:

| Command | Action |
|---|---|
| `@bot-name what does this function do?` | Q&A — agent answers the question |
| `@bot-name /review` | Code Review — agent reviews the PR |
| `@bot-name /fix null pointer in auth.ts` | Code Mod — agent fixes code and opens a PR |
| `@bot-name /implement add input validation` | Code Mod — agent implements and opens a PR |

The bot mention defaults to `@ghAccount` (e.g., `@superada2026`). Override with `botMention` in the route config.

## Route Config Reference

| Field | Required | Description |
|---|---|---|
| `repo` | Yes | `"owner/repo"`, `"owner/*"`, or `"*"` |
| `openclawUrl` | Yes | OpenClaw tunnel URL |
| `openclawToken` | Yes | Token ref, e.g. `"$TOKEN_PROJ1"` |
| `agentId` | Yes | OpenClaw agent ID |
| `ghAccount` | No | GitHub username for `gh auth switch` |
| `botMention` | No | Custom trigger (default: `@ghAccount` or `@claw`) |
| `autoReview` | No | Auto-review PRs on open (overrides global) |

Route resolution priority: exact repo → owner wildcard (`owner/*`) → global (`*`).

## Development

```bash
npm run dev       # Local dev server with wrangler
npm run check     # TypeScript type check
wrangler tail     # Live Worker logs
```

## License

MIT
