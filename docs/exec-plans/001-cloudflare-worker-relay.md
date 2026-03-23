# ExecPlan: Cloudflare Worker Relay for GitHub Webhooks

**Status:** Active
**Author:** Planner Agent
**Created:** 2026-03-23
**Last Updated:** 2026-03-23

## Purpose / Big Picture

After this change, GitHub webhook events are securely received by a Cloudflare Worker, classified by intent, and forwarded as structured messages to a local OpenClaw AI agent via Cloudflare Tunnel. Users can trigger AI-powered code review, Q&A, or code modification workflows directly from GitHub comments using `@claw` mentions. The system is production-hardened with HMAC-SHA256 signature verification, typed payloads, and clean intent routing.

## Context and Orientation

### Current State

The repository at `/Users/wanggang/dev/00/claw-github-hook` contains only the docs framework, harness config, and agent definitions. No source code exists yet.

The user has a working but unstructured proof-of-concept Cloudflare Worker (inline JavaScript, no TypeScript, no signature verification, hardcoded secrets, no intent routing) and a local OpenClaw instance reachable via Cloudflare Tunnel.

### Key Concepts

- **Cloudflare Worker** — Edge function that receives GitHub webhook POST requests. Runtime is the standard Web Crypto API (no Node.js built-ins). Secrets are stored as Cloudflare Worker Secrets, not in code.
- **OpenClaw** — Local AI agent runner. Exposes a webhook endpoint at `/hooks/agent`. Configured with `token`, `defaultSessionKey: "hook:github"`, and `allowedAgentIds: ["product-builder"]`. Because `allowRequestSessionKey: false`, all events share a single session named `hook:github` — this is a known constraint and is not worked around.
- **Intent** — A classification of what the GitHub event is asking for: `qa`, `code-review`, `code-mod`, or `ignore`. Routing is a pure function of the event payload.
- **HMAC-SHA256** — GitHub signs every webhook payload with a secret using HMAC-SHA256, delivered in the `X-Hub-Signature-256` header. Verification uses only the Web Crypto API (no npm dependencies).
- **Cloudflare Tunnel URL** — The URL of the running `cloudflared` tunnel that exposes the local OpenClaw instance. Stored as a Worker Secret (`OPENCLAW_URL`).

### File Map (after this plan completes)

```
claw-github-hook/
├── src/
│   ├── index.ts          — Worker entry point; orchestrates verify → parse → route → message → forward
│   ├── verify.ts         — HMAC-SHA256 signature verification using Web Crypto API
│   ├── parser.ts         — Parse raw GitHub JSON payload → typed GitHubEvent
│   ├── router.ts         — Intent routing (pure function): qa / code-review / code-mod / ignore
│   ├── message.ts        — Build structured message string per intent
│   └── openclaw.ts       — POST structured message to OpenClaw /hooks/agent
├── skills/
│   ├── github-qa/
│   │   └── SKILL.md      — Guides product-builder agent to answer GitHub questions
│   ├── github-review/
│   │   └── SKILL.md      — Guides product-builder agent to perform PR code review
│   └── github-code-mod/
│       └── SKILL.md      — Guides product-builder agent to make code changes
├── wrangler.toml         — Cloudflare Worker configuration
├── package.json          — Project manifest and dev dependencies
└── tsconfig.json         — TypeScript configuration for Workers runtime
```

### Layer Mapping (per architecture.md)

The Worker pipeline maps to the project's layer model as follows:

| Layer | File(s) |
|---|---|
| Types | Interfaces defined in `parser.ts` (`GitHubEvent`, `Intent`) |
| Config | `wrangler.toml`, environment secrets (`GITHUB_WEBHOOK_SECRET`, `OPENCLAW_URL`, `OPENCLAW_TOKEN`, `AUTO_REVIEW`) |
| Service | `verify.ts`, `parser.ts`, `router.ts`, `message.ts`, `openclaw.ts` |
| Runtime | `src/index.ts` (Worker `fetch` handler) |

Dependencies flow strictly: `index.ts` imports from all service modules; service modules do not import from `index.ts`. `router.ts` imports types from `parser.ts`. `message.ts` imports types from `parser.ts` and `router.ts`. No circular dependencies.

## Plan of Work

### Phase 1 — Project Scaffold

Set up the TypeScript project targeting the Cloudflare Workers runtime. This is needed before any source code can be written.

1. Create `package.json` with `wrangler` as a dev dependency and a `"type": "module"` declaration. Add scripts: `dev` (wrangler dev), `deploy` (wrangler deploy), `check` (tsc --noEmit).
2. Create `tsconfig.json` targeting ES2022, using the `@cloudflare/workers-types` lib, with `moduleResolution: "bundler"` and `strict: true`.
3. Create `wrangler.toml` declaring the Worker name (`claw-github-hook`), main entry (`src/index.ts`), compatibility date, and listing the four expected secrets: `GITHUB_WEBHOOK_SECRET`, `OPENCLAW_URL`, `OPENCLAW_TOKEN`, `AUTO_REVIEW`.

### Phase 2 — Core Service Modules

Implement the four stateless service modules. Each module has a single responsibility and no side effects except `openclaw.ts`.

**`src/verify.ts`**

Exports one function: `verifySignature(secret: string, body: string, sigHeader: string | null): Promise<boolean>`.

Implementation:
- Return `false` immediately if `sigHeader` is null or does not start with `"sha256="`.
- Import the secret as a `CryptoKey` using `crypto.subtle.importKey` with algorithm `HMAC / SHA-256`.
- Compute the expected signature with `crypto.subtle.sign`.
- Compare using `crypto.subtle.timingSafeEqual` (available in Workers runtime) to prevent timing attacks.
- Return `true` only if signatures match.

No npm dependencies. Web Crypto API only.

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

Exports one function: `forwardToOpenClaw(url: string, token: string, message: string): Promise<void>`.

POSTs to `${url}/hooks/agent` with:
- `Authorization: Bearer ${token}`
- `Content-Type: application/json`
- Body: `{ message, name: "GitHub", agentId: "product-builder" }`

Throws on non-2xx response so the caller can log the error. Does not retry (fail-fast; GitHub will retry on non-200 response from the Worker, but the Worker always returns 200 — see `index.ts` note below).

### Phase 3 — Worker Entry Point

**`src/index.ts`**

The `fetch` handler orchestrates the pipeline:

1. Read raw body as text (`request.text()`).
2. Call `verifySignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get("X-Hub-Signature-256"))`. If `false`, return `new Response("Unauthorized", { status: 401 })`.
3. Parse JSON body (wrap in try/catch; on parse failure, return 200 with body `"ignored: parse error"` — malformed payloads are silently dropped).
4. Call `parseEvent(request.headers.get("x-github-event") ?? "unknown", data)`.
5. Call `routeIntent(ev, env.AUTO_REVIEW === "true")`.
6. If intent is `"ignore"`, return `new Response("ok", { status: 200 })` immediately.
7. Call `buildMessage(ev, intent)`.
8. Call `forwardToOpenClaw(env.OPENCLAW_URL, env.OPENCLAW_TOKEN, message)` inside a try/catch. Log errors to `console.error` but do not propagate — the Worker must always return 200 to GitHub to prevent redundant retries.
9. Return `new Response("ok", { status: 200 })`.

The `Env` interface:
```typescript
interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  OPENCLAW_URL: string;
  OPENCLAW_TOKEN: string;
  AUTO_REVIEW: string;  // "true" | "false" | undefined
}
```

### Phase 4 — OpenClaw Skills

Three skill definition files that guide the `product-builder` agent.

**`skills/github-qa/SKILL.md`**

Documents the `github-qa` skill: when invoked, the agent reads the GitHub context message, identifies the question being asked, searches relevant code or documentation in the repository, and posts a clear answer back (via whatever output mechanism `product-builder` uses).

**`skills/github-review/SKILL.md`**

Documents the `github-review` skill: when invoked with a PR URL, the agent fetches the PR diff, checks for correctness, style, test coverage, and architectural alignment, and produces a structured review comment.

**`skills/github-code-mod/SKILL.md`**

Documents the `github-code-mod` skill: when invoked with a `/fix` or `/implement` command, the agent parses the request from the comment body, makes the requested code change in the repository, and opens or updates the relevant PR.

### Phase 5 — Validation and Deployment Notes

1. Run `npm run check` (tsc --noEmit) to confirm no type errors.
2. Set Worker Secrets via `wrangler secret put` for all four secrets.
3. Run `wrangler dev` locally and send a test webhook payload using `curl` with a valid HMAC signature to verify the full pipeline.
4. Deploy with `wrangler deploy`.
5. Configure GitHub repository webhook: URL = Worker URL, Content-Type = `application/json`, Secret = the value of `GITHUB_WEBHOOK_SECRET`, Events = Issues, Pull requests, Issue comments, Pull request review comments.

## Progress

- [ ] **Phase 1.1** — Create `package.json`
- [ ] **Phase 1.2** — Create `tsconfig.json`
- [ ] **Phase 1.3** — Create `wrangler.toml`
- [ ] **Phase 2.1** — Implement `src/verify.ts`
- [ ] **Phase 2.2** — Implement `src/parser.ts` (types + `parseEvent`)
- [ ] **Phase 2.3** — Implement `src/router.ts` (`routeIntent`)
- [ ] **Phase 2.4** — Implement `src/message.ts` (`buildMessage`)
- [ ] **Phase 2.5** — Implement `src/openclaw.ts` (`forwardToOpenClaw`)
- [ ] **Phase 3.1** — Implement `src/index.ts` (Worker entry point)
- [ ] **Phase 4.1** — Write `skills/github-qa/SKILL.md`
- [ ] **Phase 4.2** — Write `skills/github-review/SKILL.md`
- [ ] **Phase 4.3** — Write `skills/github-code-mod/SKILL.md`
- [ ] **Phase 5.1** — Run `npm run check`; fix any type errors
- [ ] **Phase 5.2** — Local test with `wrangler dev` + curl test payload
- [ ] **Phase 5.3** — Set Cloudflare Worker Secrets
- [ ] **Phase 5.4** — Deploy with `wrangler deploy`
- [ ] **Phase 5.5** — Configure GitHub webhook and verify end-to-end

## Surprises & Discoveries

<!-- Document unexpected behaviors, bugs, optimizations, or insights found during implementation. -->

- **Known constraint:** `allowRequestSessionKey: false` in the OpenClaw config means all GitHub events share the `hook:github` session. Concurrent events could interleave in the same AI context window. This is acceptable for the current scale but may need addressing if event volume grows. No workaround is implemented.
- **`timingSafeEqual` availability:** Cloudflare Workers' `crypto.subtle` does not expose `timingSafeEqual` directly — it is available on the Node.js `crypto` module but not the Web Crypto API standard. In Cloudflare Workers, the comparison must be done by converting both `ArrayBuffer` results to `Uint8Array` and comparing length + each byte, or by using the `nodejs_compat` compatibility flag. This should be verified during Phase 2.1.

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
  **Rationale:** The `product-builder` agent interprets skills as documentation-driven instructions. Encoding them as Markdown files keeps them legible to both agents and humans (Golden Rule 10) and avoids adding a code execution surface to the Worker bundle.
  **Date/Author:** 2026-03-23 / Planner Agent

## Outcomes & Retrospective

<!-- To be filled in after implementation is complete. -->

<!-- Expected outcomes:
  - GitHub webhooks are verified, parsed, routed, and forwarded to OpenClaw end-to-end.
  - PR review, Q&A, and code modification intents are correctly classified from @claw comments.
  - The Worker bundle has zero npm runtime dependencies and passes TypeScript strict checks.
  - Secrets are not stored in code or version control.
  - The three SKILL.md files are usable by the product-builder agent without additional context.
-->
