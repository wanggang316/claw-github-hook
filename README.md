# claw-github-hook

A Cloudflare Worker that receives GitHub App webhook events and relays them to a local [OpenClaw](https://openclaw.ai) AI agent, enabling AI-powered Q&A, code review, and code modification directly from GitHub issues and pull requests.

## How It Works

```
GitHub App Webhook (issue/PR event)
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
- **Multi-org routing** — route installations and repos to different OpenClaw agents via Cloudflare KV
- **Multi-account support** — `gh auth switch` per route for multiple GitHub accounts
- **Custom bot mention** — defaults to `@ghAccount`, configurable per route
- **Zero runtime dependencies** — Web Crypto API only, no npm packages at runtime

## Setup

### Step 1: Set Up Cloudflare Tunnel

The tunnel exposes your local OpenClaw instance to the internet so the Cloudflare Worker can reach it.

Install `cloudflared` if you haven't: `brew install cloudflared`

**Option A: Named tunnel with custom domain (recommended for production)**

This gives you a stable URL that doesn't change on restart.

```bash
# 1. Login (if you haven't already)
cloudflared tunnel login
# Opens browser — select the domain you want to use

# 2. Create the tunnel
cloudflared tunnel create openclaw
# Output:
#   Tunnel credentials written to /Users/you/.cloudflared/<TUNNEL_ID>.json
#   Created tunnel openclaw with id <TUNNEL_ID>
# Save the TUNNEL_ID for the next step.

# 3. Create config file
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /Users/you/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: openclaw.yourdomain.com
    service: http://localhost:18789
  - service: http_status:404
EOF
# Replace:
#   <TUNNEL_ID> with the ID from step 2
#   /Users/you/ with your actual home directory path
#   openclaw.yourdomain.com with your chosen subdomain
#   18789 with your OpenClaw Gateway port (18789 is the default)

# 4. Add DNS record
cloudflared tunnel route dns openclaw openclaw.yourdomain.com
# This creates a CNAME record in Cloudflare DNS automatically

# 5. Start the tunnel
cloudflared tunnel run openclaw
# Keep this running. Your OpenClaw is now reachable at:
#   https://openclaw.yourdomain.com
```

**Option B: Quick tunnel (for testing only)**

```bash
cloudflared tunnel --url http://localhost:18789
# Output:
#   Your quick Tunnel has been created! Visit it at:
#   https://random-words.trycloudflare.com
# ⚠️ This URL changes every time you restart the tunnel.
# You'll need to update your KV routes config each time.
```

**Verify the tunnel works:**

```bash
curl https://openclaw.yourdomain.com/api/v1/check
# Should return a 200 response from OpenClaw
```

### Step 2: Clone and Install

Requires Node.js 20+ (`brew install node`).

```bash
git clone https://github.com/wanggang316/claw-github-hook.git
cd claw-github-hook
npm install
npm run check    # Should show no errors
```

### Step 3: Create KV Namespace

Install Wrangler CLI if you haven't: `npm install -g wrangler && wrangler login`

KV (Key-Value) stores the routing config that maps GitHub App installations and repos to OpenClaw agents.

```bash
wrangler kv namespace create ROUTES_KV
# Output:
#   ✨ Success!
#   Add the following to your configuration file:
#   [[kv_namespaces]]
#   binding = "ROUTES_KV"
#   id = "abc123..."
```

Copy the `id` value and edit `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ROUTES_KV"
id = "abc123..."   # ← paste your actual ID here
```

### Step 4: Set Worker Secrets

Secrets are sensitive values stored securely in Cloudflare, not in code.

Make sure your OpenClaw config has hooks enabled (see [https://docs.openclaw.ai](https://docs.openclaw.ai)):

Generate a strong token for `hooks.token` first. For example:

```bash
openssl rand -hex 32
```

You can also use any long, random string you create yourself, as long as you use the exact same value later when setting the Worker secret.

```json
{
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "<openclaw_hooks_token>",
    "defaultSessionKey": "hook:github",
    "allowRequestSessionKey": false,
    "allowedAgentIds": ["<agent_id>"]
  }
}
```

```bash
# 1. Generate and set the webhook secret
# Or skip openssl and manually enter your own long random string for GITHUB_WEBHOOK_SECRET
openssl rand -hex 32
# Copy the output, then:
wrangler secret put GITHUB_WEBHOOK_SECRET
# Paste the random string when prompted
# ⚠️ Save this string — you'll need it again in Step 7 for GitHub webhook config

# 2. Set auto-review preference
wrangler secret put AUTO_REVIEW
# Enter: false (or true if you want every PR auto-reviewed)

# 3. Set OpenClaw token
wrangler secret put TOKEN_PROJ1
# Enter: the exact hooks.token value from your OpenClaw config
```

If you have multiple OpenClaw instances with different tokens, add more secrets:

```bash
wrangler secret put TOKEN_PROJ2
wrangler secret put TOKEN_PROJ3
```

### Step 5: Upload Routes

Routes tell the Worker which GitHub App installation and repo go to which OpenClaw agent.

**Recommended setup (organization defaults + repo overrides):**

```bash
wrangler kv key put routes '[
  {
    "installationId": 12345678,
    "owner": "myorg",
    "defaults": {
      "openclawUrl": "https://openclaw.yourdomain.com",
      "openclawToken": "$TOKEN_PROJ1",
      "agentId": "<default_agent_id>",
      "ghAccount": "your-github-username",
      "autoReview": true
    },
    "repos": {
      "api": {
        "agentId": "<api_agent_id>"
      },
      "web": {
        "agentId": "<web_agent_id>",
        "autoReview": false
      }
    }
  }
]' --binding ROUTES_KV --remote
```

Replace:

- `12345678` — your GitHub App installation ID
- `myorg` — the organization login
- `https://openclaw.yourdomain.com` — your tunnel URL from Step 1
- `$TOKEN_PROJ1` — keep as-is, this references the secret from Step 4
- `<default_agent_id>` / `<api_agent_id>` / `<web_agent_id>` — your OpenClaw agent IDs
- `your-github-username` — your GitHub username if you want `gh auth switch` and `@username` mention defaults

**Route field reference:**

| Field | Required | Description |
| --- | --- | --- |
| `installationId` | No but recommended | GitHub App installation ID; best primary key in multi-org setups |
| `owner` | Yes | Organization login used as readable key and fallback matcher |
| `defaults` | Yes | Default OpenClaw target for the installation/org |
| `repos` | No | Repo-name keyed overrides, for example `"api"` or `"web"` |
| `defaults.openclawUrl` | Yes | Tunnel URL from Step 1 |
| `defaults.openclawToken` | Yes | Token reference like `"$TOKEN_PROJ1"` |
| `defaults.agentId` | Yes | Default OpenClaw agent ID |
| `defaults.ghAccount` | No | GitHub username for `gh auth switch` |
| `defaults.botMention` | No | Custom trigger mention |
| `defaults.autoReview` | No | Default PR auto-review policy |

Route resolution priority: `installationId` → `owner` → `defaults` merged with `repos[repoName]`.

### Step 6: Deploy the Worker

```bash
wrangler deploy
# Output:
#   Published claw-github-hook (x.xx sec)
#   https://claw-github-hook.your-account.workers.dev
# Save this URL for Step 7
```

### Step 7: Configure the GitHub App

Create a GitHub App and set its webhook URL to your Worker URL from Step 6.

1. Go to **GitHub Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set **Webhook URL** to your Worker URL
3. Set **Webhook secret** to the same value as `GITHUB_WEBHOOK_SECRET`
4. Subscribe only to:
  - `Issue comment`
  - `Pull request`
  - `Pull request review comment`
5. Grant repository permissions:
  - `Metadata: Read-only`
  - `Issues: Read-only`
  - `Pull requests: Read-only`
6. Install the App into each target organization
7. For each installation, either select all repositories or the subset you want routed

GitHub will send webhook deliveries to the App webhook automatically after installation.

### Step 8: Install Skills in OpenClaw

The skills guide OpenClaw's agent on how to handle each type of GitHub event. There are three skills:

- `github-qa` — answer questions from issue/PR comments
- `github-review` — perform code review on pull requests
- `github-code-mod` — make code changes and open PRs

**Option 1: Ask your Agent to install them**

Give your OpenClaw agent a prompt like this:

```text
Please install these 3 skills from https://github.com/wanggang316/claw-github-hook.git into OpenClaw:
- skills/github-qa
- skills/github-review
- skills/github-code-mod

If OpenClaw needs a restart or reload to detect new skills, do that too.
```

**Option 2: Manually install them**

Clone this repo, enter it, then copy the three skill folders:

```bash
git clone https://github.com/wanggang316/claw-github-hook.git
cd claw-github-hook
cp -r skills/github-qa skills/github-review skills/github-code-mod ~/.openclaw/skills/
```

- Global install: `~/.openclaw/skills/`
- Install for one agent: `~/agents/<agent_id>/skills/` (replace the `cp` target path)

Restart OpenClaw or wait for the skills watcher to pick them up.

### Step 9: Verify End-to-End

1. Make sure OpenClaw is running and the Cloudflare Tunnel is active
2. Go to a GitHub issue in your configured repo
3. Post a comment: `@your-github-username hello, can you see this?`
4. Watch the Worker logs: `wrangler tail`
5. Check OpenClaw logs for the incoming message

If the Worker log shows `FORWARDED: success` but OpenClaw doesn't respond, check:

- Is the tunnel URL correct and reachable?
- Is the agent ID correct?
- Are the skills installed in the OpenClaw workspace?

## Usage

Once everything is set up, mention the bot in any GitHub issue or PR comment.

### Bot Mention

The bot responds to mentions based on this priority:

1. `**botMention**` in route config (if set) — e.g. `@my-ai-bot`
2. `**@ghAccount**` (if `ghAccount` is set in route config) — e.g. `@superada2026`
3. `**@claw**` (default fallback when neither is set)

### Commands


| Comment                                    | Action                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| `@mention what does this function do?`     | **Q&A** — agent answers the question and posts a reply         |
| `@mention /review`                         | **Code Review** — agent fetches the PR diff and posts a review |
| `@mention /fix null pointer in auth.ts`    | **Code Mod** — agent fixes the code and opens a PR             |
| `@mention /implement add input validation` | **Code Mod** — agent implements the feature and opens a PR     |


*(Replace `@mention` with your bot mention — see priority above.)*

## Updating Routes

To change routing without redeploying:

```bash
wrangler kv key put routes '<new JSON>' --binding ROUTES_KV --remote
```

Changes take effect immediately — no `wrangler deploy` needed.

## Troubleshooting


| Symptom                                     | Cause                                          | Fix                                                                                          |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GitHub shows 401                            | Signature mismatch                             | Ensure `GITHUB_WEBHOOK_SECRET` matches the GitHub webhook Secret field                       |
| Worker log: `IGNORED: no route`             | No matching installation/org route in KV      | Check `wrangler kv key get routes --binding ROUTES_KV --remote` and verify `installationId`, `owner`, and repo override names |
| Worker log: `IGNORED: intent=ignore`        | Comment doesn't contain the bot mention        | Check which mention is configured — run `wrangler tail` to see the logs                      |
| Worker log: `FORWARD FAILED: 530`           | Tunnel is down or URL changed                  | Restart `cloudflared tunnel run` and update KV routes if using quick tunnel                  |
| Worker log: `FORWARD FAILED: 400`           | OpenClaw rejected the request                  | Check OpenClaw logs; verify `agentId` is in `allowedAgentIds`                                |
| OpenClaw receives message but doesn't reply | Skills not installed or `gh` not authenticated | Run `gh auth status` and check `~/.openclaw/skills/`                                         |


## Development

```bash
npm run dev       # Local dev server with wrangler
npm run check     # TypeScript type check
wrangler tail     # Live Worker logs
```

## License

MIT
