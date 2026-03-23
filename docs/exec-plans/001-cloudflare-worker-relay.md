# ExecPlan: Cloudflare Worker Relay for GitHub Webhooks

**Status:** Active
**Author:** Planner Agent
**Created:** 2026-03-23
**Last Updated:** 2026-03-23 (rev 2 — multi-repo routing)

## Purpose / Big Picture

After this change, GitHub webhook events are securely received by a Cloudflare Worker, classified by intent, and forwarded as structured messages to a local OpenClaw AI agent via Cloudflare Tunnel. Users can trigger AI-powered code review, Q&A, or code modification workflows directly from GitHub comments using `@claw` mentions. The system is production-hardened with HMAC-SHA256 signature verification, typed payloads, and clean intent routing.

## Context and Orientation

### Current State

The repository at `/Users/wanggang/dev/00/claw-github-hook` contains only the docs framework, harness config, and agent definitions. No source code exists yet.

The user has a working but unstructured proof-of-concept Cloudflare Worker (inline JavaScript, no TypeScript, no signature verification, hardcoded secrets, no intent routing) and a local OpenClaw instance reachable via Cloudflare Tunnel.

### Key Concepts

- **Cloudflare Worker** — Edge function that receives GitHub webhook POST requests. Runtime is the standard Web Crypto API (no Node.js built-ins). Secrets are stored as Cloudflare Worker Secrets, not in code.
- **OpenClaw** — Local AI agent runner. Exposes a webhook endpoint at `/hooks/agent`. Configured with `token`, `defaultSessionKey: "hook:github"`, and `allowedAgentIds: ["<agent_id>"]`. Because `allowRequestSessionKey: false`, all events share a single session named `hook:github` — this is a known constraint and is not worked around.
- **Intent** — A classification of what the GitHub event is asking for: `qa`, `code-review`, `code-mod`, or `ignore`. Routing is a pure function of the event payload.
- **HMAC-SHA256** — GitHub signs every webhook payload with a secret using HMAC-SHA256, delivered in the `X-Hub-Signature-256` header. Verification uses only the Web Crypto API (no npm dependencies).
- **Cloudflare Tunnel URL** — The URL of the running `cloudflared` tunnel that exposes the local OpenClaw instance. Stored per-route in the KV routes config (`openclawUrl` field of `RouteConfig`).
- **RouteConfig** — A per-repo routing record that maps a GitHub repo (or wildcard) to a specific OpenClaw instance, token reference, and agent ID. Stored as a JSON array in Cloudflare KV under the key `routes`. See Phase 1b for the full schema.
- **Token indirection** — `openclawToken` in a `RouteConfig` stores an env-var name (e.g. `$TOKEN_PROJ1`) rather than the secret value itself. At runtime the Worker resolves this reference against its own environment bindings. This keeps actual secrets out of KV (which is not a secret store) and allows tokens to be rotated via `wrangler secret put` without editing the routing table.
- **Cloudflare KV** — A key-value store available to Workers at runtime. The `ROUTES_KV` namespace binding holds a single JSON key (`routes`) containing the full routing table. KV can be updated via the Cloudflare dashboard or API without redeploying the Worker.

### File Map (after this plan completes)

```
claw-github-hook/
├── src/
│   ├── index.ts          — Worker entry point; orchestrates verify → parse → route → message → forward
│   ├── verify.ts         — HMAC-SHA256 signature verification using Web Crypto API
│   ├── parser.ts         — Parse raw GitHub JSON payload → typed GitHubEvent
│   ├── router.ts         — Intent routing (pure function): qa / code-review / code-mod / ignore
│   ├── message.ts        — Build structured message string per intent
│   ├── openclaw.ts       — POST structured message to OpenClaw /hooks/agent
│   ├── config.ts         — Load and validate RouteConfig[] from KV; resolve token refs from env
│   └── types.ts          — Shared TypeScript types: RouteConfig, Env (with KV binding)
├── skills/
│   ├── github-qa/
│   │   └── SKILL.md      — Guides the configured agent to answer GitHub questions
│   ├── github-review/
│   │   └── SKILL.md      — Guides the configured agent to perform PR code review
│   └── github-code-mod/
│       └── SKILL.md      — Guides the configured agent to make code changes
├── wrangler.toml         — Cloudflare Worker configuration
├── package.json          — Project manifest and dev dependencies
├── tsconfig.json         — TypeScript configuration for Workers runtime
└── .env.example          — Documents required secrets (values are placeholders, never real secrets)
```

### Layer Mapping (per architecture.md)

The Worker pipeline maps to the project's layer model as follows:

| Layer | File(s) |
|---|---|
| Types | `types.ts` (`RouteConfig`, `Env`); interfaces in `parser.ts` (`GitHubEvent`, `Intent`) |
| Config | `wrangler.toml`, KV namespace `ROUTES_KV`, env secrets (`GITHUB_WEBHOOK_SECRET`, `AUTO_REVIEW`, per-route token secrets) |
| Service | `verify.ts`, `parser.ts`, `router.ts`, `message.ts`, `openclaw.ts`, `config.ts` |
| Runtime | `src/index.ts` (Worker `fetch` handler) |

Dependencies flow strictly: `index.ts` imports from all service modules; service modules do not import from `index.ts`. `router.ts` imports types from `parser.ts`. `message.ts` imports types from `parser.ts` and `router.ts`. `config.ts` imports from `types.ts`. `openclaw.ts` imports from `types.ts`. No circular dependencies.

## Plan of Work

### Phase 1 — Project Scaffold

Set up the TypeScript project targeting the Cloudflare Workers runtime. This is needed before any source code can be written.

1. Create `package.json` with `wrangler` as a dev dependency and a `"type": "module"` declaration. Add scripts: `dev` (wrangler dev), `deploy` (wrangler deploy), `check` (tsc --noEmit).
2. Create `tsconfig.json` targeting ES2022, using the `@cloudflare/workers-types` lib, with `moduleResolution: "bundler"` and `strict: true`.
3. Create `wrangler.toml` declaring the Worker name (`claw-github-hook`), main entry (`src/index.ts`), and compatibility date. List the two global secrets: `GITHUB_WEBHOOK_SECRET` and `AUTO_REVIEW`. The KV namespace binding and per-route token secrets are added in Phase 1b.
4. Create `.env.example` listing the two global secrets with placeholder values (e.g. `GITHUB_WEBHOOK_SECRET=your-webhook-secret-here`). This file is committed to the repo. It will be extended in Phase 1b to document the per-route token pattern.

### Phase 1b — Multi-Repo Routing Config

Define the routing data model, KV binding, and config-loading module. This must be done before Phase 2 because `openclaw.ts` and `index.ts` depend on `RouteConfig`.

**`src/types.ts`**

Defines and exports two types:

```typescript
export interface RouteConfig {
  repo: string;          // "owner/repo", "owner/*", or "*"
  openclawUrl: string;   // e.g. "https://xxx.trycloudflare.com"
  openclawToken: string; // env-var name to resolve, e.g. "$TOKEN_PROJ1"
  agentId: string;       // OpenClaw agent ID, e.g. "<agent_id>"
  autoReview?: boolean;  // overrides global AUTO_REVIEW for this repo
}

export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  AUTO_REVIEW: string;    // global fallback: "true" | "false"
  ROUTES_KV: KVNamespace; // Cloudflare KV binding
  [key: string]: unknown; // allows dynamic token resolution
}
```

The index signature `[key: string]: unknown` is required for TypeScript to allow dynamic property access when resolving token env-var references at runtime.

**`src/config.ts`**

Exports two functions:

`loadRoutes(kv: KVNamespace): Promise<RouteConfig[]>` — Fetches the `routes` key from KV, parses the JSON value, and validates it is an array. Returns an empty array if the key is absent or the value is not a valid array. Validation uses type guards (not a runtime schema library) to keep the bundle dependency-free.

`resolveRoute(repo: string, routes: RouteConfig[]): RouteConfig | null` — Applies the following match order and returns the first match, or `null` if none found:
1. Exact match: `route.repo === repo`
2. Owner-wildcard match: `route.repo === owner + "/*"` where `owner` is the `owner` segment of the requested repo.
3. Global wildcard: `route.repo === "*"`

`resolveToken(tokenRef: string, env: Env): string` — If `tokenRef` starts with `$`, looks up `env[tokenRef.slice(1)]` as a string. If it does not start with `$`, returns the value as-is (treated as a literal token, useful for development). Throws if the referenced env var is absent or not a string.

**`wrangler.toml` update**

Add a `[[kv_namespaces]]` binding:

```toml
[[kv_namespaces]]
binding = "ROUTES_KV"
id = "<KV namespace ID to be filled in after `wrangler kv:namespace create`>"
```

Remove the now-redundant global `OPENCLAW_URL` and `OPENCLAW_TOKEN` vars/secrets (per-route values replace them). Keep `GITHUB_WEBHOOK_SECRET` and `AUTO_REVIEW` as global secrets.

**`src/index.ts` update**

After signature verification and before intent routing, call `loadRoutes(env.ROUTES_KV)` and `resolveRoute(ev.repo, routes)`. If `resolveRoute` returns `null`, return `new Response("ok", { status: 200 })` silently (no matching route = ignore). Pass the resolved `RouteConfig` into `forwardToOpenClaw` instead of global env vars.

**`src/openclaw.ts` update**

Change the signature of `forwardToOpenClaw` to accept a `RouteConfig` and `Env` rather than bare `url` and `token` strings:

```typescript
forwardToOpenClaw(route: RouteConfig, env: Env, message: string): Promise<void>
```

Inside the function, resolve the token via `resolveToken(route.openclawToken, env)` and use `route.openclawUrl` and `route.agentId` instead of the hardcoded global equivalents. The `sessionKey` remains hardcoded to `"hook:github"`.

**`.env.example` update**

Remove `OPENCLAW_URL` and `OPENCLAW_TOKEN` from the global secrets list. Add a block explaining that per-route tokens are set as Worker Secrets whose names match the `openclawToken` values in the KV routes config, for example:

```
# Per-route token secrets (names must match openclawToken values in KV routes config)
TOKEN_PROJ1=your-openclaw-token-for-project-1-here
TOKEN_PROJ2=your-openclaw-token-for-project-2-here
```

Add a comment block showing a sample `routes` JSON value for KV:

```json
[
  { "repo": "acme/backend",   "openclawUrl": "https://abc.trycloudflare.com", "openclawToken": "$TOKEN_PROJ1", "agentId": "<api_agent_id>" },
  { "repo": "acme/frontend",  "openclawUrl": "https://def.trycloudflare.com", "openclawToken": "$TOKEN_PROJ2", "agentId": "<web_agent_id>" },
  { "repo": "*",              "openclawUrl": "https://abc.trycloudflare.com", "openclawToken": "$TOKEN_PROJ1", "agentId": "<default_agent_id>", "autoReview": false }
]
```

### Phase 2 — Core Service Modules

Implement the four stateless service modules. Each module has a single responsibility and no side effects except `openclaw.ts`.

**`src/verify.ts`**

Exports one function: `verifySignature(secret: string, body: string, sigHeader: string | null): Promise<boolean>`.

Implementation:
- Return `false` immediately if `sigHeader` is null or does not start with `"sha256="`.
- Import the secret as a `CryptoKey` using `crypto.subtle.importKey` with algorithm `{ name: "HMAC", hash: "SHA-256" }` and `["verify"]` key usage.
- Decode the hex digest from `sigHeader` (strip the `"sha256="` prefix) into a `Uint8Array`.
- Use `crypto.subtle.verify("HMAC", key, signatureBytes, bodyBytes)` directly — this performs a constant-time comparison internally and is the correct Web Crypto API pattern. Do NOT use `crypto.subtle.sign` followed by a manual byte-by-byte comparison; the `verify` method is both simpler and correctly timing-safe.
- Return the boolean result of `crypto.subtle.verify`.

No npm dependencies. Web Crypto API only. Note: `crypto.subtle.timingSafeEqual` does NOT exist in the Web Crypto standard or in the Cloudflare Workers runtime — using `crypto.subtle.verify` for HMAC is the correct replacement.

**`src/parser.ts`**

Defines and exports the `GitHubEvent` type:

```typescript
export type Intent = "qa" | "code-review" | "code-mod" | "ignore";

export interface GitHubEvent {
  event: string;          // X-GitHub-Event header value
  action: string;
  repo: string;           // repository.full_name
  sender: string;         // sender.login
  prTitle: string;
  prUrl: string;
  prNumber: number | null;
  issueTitle: string;
  issueUrl: string;
  issueNumber: number | null;
  commentBody: string;
  isBot: boolean;         // sender.login includes "[bot]"
}
```

Exports one function: `parseEvent(event: string, body: unknown): GitHubEvent`. The `body` parameter is the already-parsed JSON object. All fields use safe optional chaining with string/number defaults so the function never throws.

**`src/router.ts`**

Exports one pure function: `routeIntent(ev: GitHubEvent, autoReview: boolean): Intent`.

Routing rules applied in order:
1. `ev.isBot` → `"ignore"`
2. `ev.commentBody` contains `@claw /fix` or `@claw /implement` (case-insensitive) → `"code-mod"`
3. `ev.commentBody` contains `@claw /review` (case-insensitive) → `"code-review"`
4. `ev.commentBody` contains `@claw` (case-insensitive) → `"qa"`
5. `ev.event === "pull_request"` and `ev.action === "opened"` and `autoReview === true` → `"code-review"`
6. Else → `"ignore"`

**`src/message.ts`**

Exports one function: `buildMessage(ev: GitHubEvent, intent: Intent): string`.

Constructs a structured plain-text message. Each intent produces a slightly different message shape:
- `qa`: context block (repo, event, sender) + comment body + question framing
- `code-review`: context block + PR title/URL + review request framing
- `code-mod`: context block + PR/issue reference + command extracted from comment + modification request framing
- `ignore`: empty string (caller should skip forwarding)

All labels are in English. No emoji in message bodies (this is a machine-to-machine message; the AI agent will format its own response).

**`src/openclaw.ts`**

Exports one function: `forwardToOpenClaw(route: RouteConfig, env: Env, message: string): Promise<void>`.

Resolves the actual token string by calling `resolveToken(route.openclawToken, env)` (defined in `config.ts`).

POSTs to `${route.openclawUrl}/hooks/agent` with:
- `Authorization: Bearer <resolved token>`
- `Content-Type: application/json`
- Body:
  ```json
  {
    "message": "<the built message>",
    "name": "GitHub",
    "agentId": "<route.agentId>",
    "sessionKey": "hook:github",
    "wakeMode": "now"
  }
  ```

The `sessionKey` is hardcoded to `"hook:github"` because the OpenClaw config has `allowRequestSessionKey: false` — the value sent here will be ignored by OpenClaw anyway, but it is still sent for clarity and forward compatibility. The `wakeMode: "now"` instructs OpenClaw to process the message immediately rather than queuing.

Throws on non-2xx response so the caller can log the error. Does not retry (fail-fast; GitHub will retry on non-200 response from the Worker, but the Worker always returns 200 — see `index.ts` note below).

### Phase 3 — Worker Entry Point

**`src/index.ts`**

The `fetch` handler orchestrates the pipeline:

1. Read raw body as text (`request.text()`).
2. Call `verifySignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get("X-Hub-Signature-256"))`. If `false`, return `new Response("Unauthorized", { status: 401 })`.
3. Parse JSON body (wrap in try/catch; on parse failure, return 200 with body `"ignored: parse error"` — malformed payloads are silently dropped).
4. Call `parseEvent(request.headers.get("x-github-event") ?? "unknown", data)`.
5. Call `loadRoutes(env.ROUTES_KV)` to fetch the routing table from KV.
6. Call `resolveRoute(ev.repo, routes)`. If `null`, return `new Response("ok", { status: 200 })` silently — no configured route for this repo.
7. Determine effective `autoReview`: use `route.autoReview` if defined, otherwise fall back to `env.AUTO_REVIEW === "true"`.
8. Call `routeIntent(ev, effectiveAutoReview)`.
9. If intent is `"ignore"`, return `new Response("ok", { status: 200 })` immediately.
10. Call `buildMessage(ev, intent)`.
11. Call `forwardToOpenClaw(route, env, message)` inside a try/catch. Log errors to `console.error` but do not propagate — the Worker must always return 200 to GitHub to prevent redundant retries.
12. Return `new Response("ok", { status: 200 })`.

The `Env` interface is now defined in `src/types.ts` (see Phase 1b). `index.ts` imports it from there rather than defining it inline.

### Phase 4 — OpenClaw Skills

Three skill definition files that guide the configured OpenClaw agent.

**`skills/github-qa/SKILL.md`**

Documents the `github-qa` skill: when invoked, the agent reads the GitHub context message, identifies the question being asked, searches relevant code or documentation in the repository, and posts a clear answer back using the configured agent's normal output mechanism.

**`skills/github-review/SKILL.md`**

Documents the `github-review` skill: when invoked with a PR URL, the agent fetches the PR diff, checks for correctness, style, test coverage, and architectural alignment, and produces a structured review comment.

**`skills/github-code-mod/SKILL.md`**

Documents the `github-code-mod` skill: when invoked with a `/fix` or `/implement` command, the agent parses the request from the comment body, makes the requested code change in the repository, and opens or updates the relevant PR.

### Phase 5 — Validation and Deployment Notes

1. Run `npm run check` (tsc --noEmit) to confirm no type errors.
2. Create the KV namespace: `wrangler kv:namespace create ROUTES_KV`. Copy the returned `id` into `wrangler.toml`.
3. Set Worker Secrets via `wrangler secret put` for `GITHUB_WEBHOOK_SECRET`, `AUTO_REVIEW`, and each per-route token secret (e.g. `TOKEN_PROJ1`, `TOKEN_PROJ2`). The old global `OPENCLAW_URL` and `OPENCLAW_TOKEN` secrets are no longer needed.
4. Upload the initial routes config: `wrangler kv:key put --binding ROUTES_KV routes '<JSON array>'` (or paste via the Cloudflare dashboard).
5. Run `wrangler dev` locally and send a test webhook payload using `curl` with a valid HMAC signature to verify the full pipeline, including route resolution.
6. Deploy with `wrangler deploy`.
7. Configure GitHub repository webhook: URL = Worker URL, Content-Type = `application/json`, Secret = the value of `GITHUB_WEBHOOK_SECRET`, Events = Issues, Pull requests, Issue comments, Pull request review comments.

## Progress

- [ ] **Phase 1.1** — Create `package.json`
- [ ] **Phase 1.2** — Create `tsconfig.json`
- [ ] **Phase 1.3** — Create `wrangler.toml`
- [ ] **Phase 1.4** — Create `.env.example`
- [ ] **Phase 1b.1** — Create `src/types.ts` (`RouteConfig`, `Env` with KV binding and index signature)
- [ ] **Phase 1b.2** — Create `src/config.ts` (`loadRoutes`, `resolveRoute`, `resolveToken`)
- [ ] **Phase 1b.3** — Add `[[kv_namespaces]]` binding to `wrangler.toml`; remove global `OPENCLAW_URL` / `OPENCLAW_TOKEN` vars
- [ ] **Phase 1b.4** — Update `.env.example` for per-route token pattern and sample KV JSON
- [ ] **Phase 2.1** — Implement `src/verify.ts`
- [ ] **Phase 2.2** — Implement `src/parser.ts` (types + `parseEvent`)
- [ ] **Phase 2.3** — Implement `src/router.ts` (`routeIntent`)
- [ ] **Phase 2.4** — Implement `src/message.ts` (`buildMessage`)
- [ ] **Phase 2.5** — Implement `src/openclaw.ts` (`forwardToOpenClaw` with `RouteConfig` + `Env` signature)
- [ ] **Phase 3.1** — Implement `src/index.ts` (Worker entry point; includes `loadRoutes` + `resolveRoute` steps)
- [ ] **Phase 4.1** — Write `skills/github-qa/SKILL.md`
- [ ] **Phase 4.2** — Write `skills/github-review/SKILL.md`
- [ ] **Phase 4.3** — Write `skills/github-code-mod/SKILL.md`
- [ ] **Phase 5.1** — Run `npm run check`; fix any type errors
- [ ] **Phase 5.2** — Create KV namespace with `wrangler kv:namespace create ROUTES_KV`; update `wrangler.toml` with returned id
- [ ] **Phase 5.3** — Set Cloudflare Worker Secrets (`GITHUB_WEBHOOK_SECRET`, `AUTO_REVIEW`, per-route token secrets)
- [ ] **Phase 5.4** — Upload initial routes JSON to KV
- [ ] **Phase 5.5** — Local test with `wrangler dev` + curl test payload (verify route resolution)
- [ ] **Phase 5.6** — Deploy with `wrangler deploy`
- [ ] **Phase 5.7** — Configure GitHub webhook and verify end-to-end

## Surprises & Discoveries

<!-- Document unexpected behaviors, bugs, optimizations, or insights found during implementation. -->

- **Known constraint:** `allowRequestSessionKey: false` in the OpenClaw config means all GitHub events share the `hook:github` session. Concurrent events could interleave in the same AI context window. This is acceptable for the current scale but may need addressing if event volume grows. No workaround is implemented.
- **`timingSafeEqual` does not exist in Web Crypto:** `crypto.subtle.timingSafeEqual` is not part of the Web Crypto API standard and is not available in Cloudflare Workers. The correct constant-time verification approach is to use `crypto.subtle.verify("HMAC", key, signatureBytes, bodyBytes)` directly — the HMAC verify operation is specified to be constant-time. This is simpler and more correct than computing `sign` and then manually comparing bytes. The plan spec for `verify.ts` has been updated to use this approach. No `nodejs_compat` flag is needed.

## Decision Log

- **Decision:** Use TypeScript with strict mode rather than plain JavaScript.
  **Rationale:** Golden Rule 2 (validate boundaries, never probe data). Typed `GitHubEvent` makes the boundary contract explicit and catches missing fields at compile time. Cloudflare Workers natively supports TypeScript via Wrangler.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** No npm runtime dependencies (Web Crypto API only for HMAC verification).
  **Rationale:** Cloudflare Workers has a 1 MB compressed bundle limit. External crypto libraries are unnecessary since the Web Crypto API is available in all Workers. Keeps the bundle minimal and reasoning simple (Golden Rule 10).
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Worker always returns 200 to GitHub, even on OpenClaw forwarding failure.
  **Rationale:** GitHub retries webhooks on non-200 responses. If OpenClaw is temporarily unavailable (tunnel down), retries would queue up and flood the agent on recovery. Silently dropping with `console.error` logging is the correct behavior for a relay; the agent's availability is a separate concern.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Intent routing is a pure function in its own module (`router.ts`), not inlined into `index.ts`.
  **Rationale:** Pure functions are trivially testable and replaceable. Routing logic will evolve (new `@claw` commands, new event types). Isolation makes future changes safe. Aligns with the Service layer responsibility in architecture.md.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** `AUTO_REVIEW` secret is typed as `string` (`"true"` | `"false"`) not a boolean.
  **Rationale:** Cloudflare Worker Secrets and environment bindings are always strings. Converting at the call site (`env.AUTO_REVIEW === "true"`) is the correct boundary validation pattern per Golden Rule 2.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** All message text is English; no emoji in forwarded messages.
  **Rationale:** Messages are machine-to-machine. The AI agent will produce its own human-readable output. Emoji in structured messages adds noise and complicates downstream parsing if the skill ever needs to extract fields.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Skills are defined as `SKILL.md` files under `skills/`, not as code.
  **Rationale:** The configured OpenClaw agent interprets skills as documentation-driven instructions. Encoding them as Markdown files keeps them legible to both agents and humans (Golden Rule 10) and avoids adding a code execution surface to the Worker bundle.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Include `sessionKey: "hook:github"` and `wakeMode: "now"` explicitly in the OpenClaw POST body.
  **Rationale:** `wakeMode: "now"` is required by the OpenClaw `/hooks/agent` API to trigger immediate processing. `sessionKey` is sent for documentation clarity even though OpenClaw ignores it when `allowRequestSessionKey: false`. Both fields are part of the OpenClaw API contract and must appear in the body per the API spec.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Commit `.env.example` with placeholder values to the repository.
  **Rationale:** Documents the required secrets without exposing real values. Gives any implementer or contributor an immediate list of what secrets need to be provisioned. Real secrets are set via `wrangler secret put` and never committed.
  **Date/Author:** 2026-03-23 / Planner Agent

- **Decision:** Store the routing table as a JSON blob in Cloudflare KV (Option D: single key `routes` in the `ROUTES_KV` namespace) rather than in `wrangler.toml` vars, Worker env vars, or individual KV keys per repo.
  **Rationale:** Route tables change frequently as new repos and OpenClaw instances are added. Option B (env vars) and Option C (wrangler.toml vars) both require a full Worker redeployment for every routing change, which is operationally fragile and creates a deployment gate around a config change. Option A (one KV key per repo) requires provisioning and querying multiple keys with no atomicity. A single JSON blob (Option D) can be updated via the Cloudflare dashboard or API in seconds without redeployment, keeps the entire routing table visible in one place, and degrades gracefully (empty array = ignore all). The only downside is that malformed JSON silently falls back to an empty route table — mitigated by type-guarding the parsed value and logging a warning.
  **Date/Author:** 2026-03-23 / Planner Agent (rev 2)

- **Decision:** Store token env-var names (e.g. `"$TOKEN_PROJ1"`) in KV rather than actual token values; resolve at runtime from Worker Secrets.
  **Rationale:** Cloudflare KV is not a secret store — values are encrypted at rest but are visible in the Cloudflare dashboard to any account member and can be read by any code that has the KV binding. Worker Secrets are the correct Cloudflare primitive for sensitive values: they are write-only in the dashboard, never logged, and injected only into the Worker's environment at runtime. By storing a reference name in KV and resolving it from `env`, secrets stay in the secure store and can be rotated via `wrangler secret put` without touching the routing table. The `$`-prefix convention makes the indirection visually explicit and is validated at runtime before the first HTTP call. Golden Rule 2 (validate at boundaries).
  **Date/Author:** 2026-03-23 / Planner Agent (rev 2)

- **Decision:** Route resolution priority order: exact match > owner wildcard (`owner/*`) > global wildcard (`*`) > null (ignore).
  **Rationale:** More specific rules should always win over more general ones. Exact-repo rules capture intentional per-repo configuration. Owner wildcards let a team route all of their repos to a shared agent without listing each one. The global wildcard acts as a catch-all default, matching the common pattern of a single-developer setup where all repos go to one agent. Returning `null` (not an error) for unmatched repos means the Worker silently accepts the webhook and returns 200 — consistent with the "always return 200 to GitHub" decision and prevents noise from organization-wide webhook subscriptions that include repos not yet configured.
  **Date/Author:** 2026-03-23 / Planner Agent (rev 2)

- **Decision:** Use `crypto.subtle.verify` for HMAC validation rather than `crypto.subtle.sign` + manual byte comparison.
  **Rationale:** `crypto.subtle.verify` for HMAC is specified to be constant-time by the Web Crypto API spec and is available in all Cloudflare Workers runtimes. Manual byte comparison is error-prone and risks introducing a timing oracle. `timingSafeEqual` from Node.js `crypto` is not available in the standard Web Crypto API.
  **Date/Author:** 2026-03-23 / Planner Agent

## Outcomes & Retrospective

<!-- To be filled in after implementation is complete. -->

<!-- Expected outcomes:
  - GitHub webhooks are verified, parsed, routed, and forwarded to OpenClaw end-to-end.
  - PR review, Q&A, and code modification intents are correctly classified from @claw comments.
  - The Worker bundle has zero npm runtime dependencies and passes TypeScript strict checks.
  - Secrets are not stored in code or version control.
  - The three SKILL.md files are usable by the configured OpenClaw agent without additional context.
-->
