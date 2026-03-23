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
- [Cloudflare account](https://dash.cloudflare.com/) — sign up at https://dash.cloudflare.com/
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — `npm install -g wrangler`, then `wrangler login`
- [OpenClaw](https://openclaw.ai) running locally with hooks enabled
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) exposing your local OpenClaw Gateway
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

Copy the returned `id` into `wrangler.toml`, replacing the placeholder value.

### 3. Set Secrets

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put AUTO_REVIEW
wrangler secret put TOKEN_PROJ1
```

How to get each value:

| Secret | How to get it |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | Generate a random string (e.g. `openssl rand -hex 32`). You'll use this same string when configuring the GitHub webhook in Step 6. |
| `AUTO_REVIEW` | Enter `"true"` to automatically review every PR when opened, or `"false"` to only review when explicitly asked via `@mention /review`. |
| `TOKEN_PROJ1` | From your OpenClaw config: this is the `token` value in your OpenClaw hooks configuration (e.g. in `~/.openclaw/config.json` under `hooks.token`). |

### 4. Upload Routes

Routes tell the Worker which repos go to which OpenClaw agent. Each route maps a GitHub repo to an OpenClaw instance.

```bash
wrangler kv key put routes '<JSON array>' --binding ROUTES_KV --remote
```

Example (single command, all on one line):

```bash
wrangler kv key put routes '[{"repo":"*","openclawUrl":"https://openclaw.example.com","openclawToken":"$TOKEN_PROJ1","agentId":"product-builder","ghAccount":"my-github-user"}]' --binding ROUTES_KV --remote
```

How to get each field:

| Field | How to get it |
|---|---|
| `repo` | The GitHub repo to match, in `"owner/repo"` format. Use `"owner/*"` to match all repos under an owner. Use `"*"` as a catch-all default. |
| `openclawUrl` | Your Cloudflare Tunnel URL that exposes OpenClaw. If using a named tunnel with custom domain: `"https://openclaw.yourdomain.com"`. If using a quick tunnel: the `*.trycloudflare.com` URL (changes on restart). |
| `openclawToken` | Reference to a Worker Secret by name, prefixed with `$`. E.g. `"$TOKEN_PROJ1"` resolves to the value you set via `wrangler secret put TOKEN_PROJ1`. If you have multiple OpenClaw instances with different tokens, create multiple secrets (`TOKEN_PROJ1`, `TOKEN_PROJ2`, etc.). |
| `agentId` | The OpenClaw agent ID to route to. Find it in your OpenClaw config — run `openclaw agents list` or check `~/.openclaw/agents/`. Examples: `"product-builder"`, `"code-reviewer"`, `"default"`. |
| `ghAccount` | *(Optional)* Your GitHub username for this route. Used for two things: (1) the bot responds to `@ghAccount` mentions in comments, (2) runs `gh auth switch --user <ghAccount>` before any `gh` command. Find your GitHub username at https://github.com/settings/profile. |
| `botMention` | *(Optional)* Override the trigger mention. If omitted, defaults to `@ghAccount` (if set) or `@claw`. Example: `"@my-ai-bot"`. |
| `autoReview` | *(Optional)* `true` or `false`. Override the global `AUTO_REVIEW` setting for this specific repo. |

Multi-repo example:

```json
[
  {
    "repo": "myorg/backend",
    "openclawUrl": "https://openclaw.mysite.com",
    "openclawToken": "$TOKEN_PROJ1",
    "agentId": "backend-dev",
    "ghAccount": "my-bot-account"
  },
  {
    "repo": "myorg/frontend",
    "openclawUrl": "https://openclaw.mysite.com",
    "openclawToken": "$TOKEN_PROJ1",
    "agentId": "frontend-dev",
    "ghAccount": "my-bot-account",
    "autoReview": true
  },
  {
    "repo": "*",
    "openclawUrl": "https://openclaw.mysite.com",
    "openclawToken": "$TOKEN_PROJ1",
    "agentId": "product-builder"
  }
]
```

Route resolution priority: exact repo match → owner wildcard (`owner/*`) → global wildcard (`*`).

### 5. Deploy

```bash
wrangler deploy
```

The output shows your Worker URL (e.g. `https://claw-github-hook.xxx.workers.dev`).

### 6. Configure GitHub Webhook

In your GitHub repo (or org): **Settings → Webhooks → Add webhook**

| Field | Value | How to get it |
|---|---|---|
| Payload URL | Your Worker URL | From Step 5 output, e.g. `https://claw-github-hook.xxx.workers.dev` |
| Content type | `application/json` | Select from dropdown |
| Secret | Your webhook secret | The same random string you entered for `GITHUB_WEBHOOK_SECRET` in Step 3 |
| Events | Individual events | Select "Let me select individual events", then check: **Issues**, **Issue comments**, **Pull requests**, **Pull request review comments** |

### 7. Install Skills in OpenClaw

Copy the skills to your OpenClaw workspace:

```bash
cp -r skills/* ~/.openclaw/skills/
```

Or symlink them so they stay in sync with this repo:

```bash
ln -s $(pwd)/skills/github-qa ~/.openclaw/skills/github-qa
ln -s $(pwd)/skills/github-review ~/.openclaw/skills/github-review
ln -s $(pwd)/skills/github-code-mod ~/.openclaw/skills/github-code-mod
```

## Usage

Once configured, mention the bot in any GitHub issue or PR comment to trigger it.

### Bot Mention

The bot responds to mentions based on this priority:

1. **`botMention`** in route config (if set) — e.g. `@my-ai-bot`
2. **`@ghAccount`** (if `ghAccount` is set) — e.g. `@superada2026`
3. **`@claw`** (default fallback)

### Commands

| Comment | Action |
|---|---|
| `@superada2026 what does this function do?` | **Q&A** — agent answers the question and posts a reply |
| `@superada2026 /review` | **Code Review** — agent fetches the PR diff and posts a review |
| `@superada2026 /fix null pointer in auth.ts` | **Code Mod** — agent fixes the code and opens a PR |
| `@superada2026 /implement add input validation` | **Code Mod** — agent implements the feature and opens a PR |

*(Replace `@superada2026` with your configured bot mention.)*

## Development

```bash
npm run dev       # Local dev server with wrangler
npm run check     # TypeScript type check
wrangler tail     # Live Worker logs
```

## License

MIT
