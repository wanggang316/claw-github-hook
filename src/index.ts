import type { Env } from "./types.js";
import { verifySignature } from "./verify.js";
import { parseEvent } from "./parser.js";
import { routeIntent } from "./router.js";
import { buildMessage } from "./message.js";
import { forwardToOpenClaw } from "./openclaw.js";
import { loadRoutes, resolveRoute } from "./config.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only accept POST
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 1. Read raw body
    const body = await request.text();

    // 2. Verify HMAC signature
    const sigHeader = request.headers.get("X-Hub-Signature-256");
    const valid = await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, sigHeader);
    if (!valid) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 3. Parse JSON
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return new Response("ok", { status: 200 });
    }

    // 4. Parse event
    const eventType = request.headers.get("x-github-event") ?? "unknown";
    const ev = parseEvent(eventType, data);

    // 5. Load routes from KV
    const routes = await loadRoutes(env.ROUTES_KV);

    // 6. Resolve route for this repo
    const route = resolveRoute(ev.repo, routes);
    if (!route) {
      return new Response("ok", { status: 200 });
    }

    // 7. Determine effective autoReview
    const autoReview = route.autoReview ?? env.AUTO_REVIEW === "true";

    // 8. Route intent
    const intent = routeIntent(ev, autoReview);
    if (intent === "ignore") {
      return new Response("ok", { status: 200 });
    }

    // 9. Build message
    const message = buildMessage(ev, intent);

    // 10. Forward to OpenClaw (never propagate errors to GitHub)
    try {
      await forwardToOpenClaw(route, env, message);
    } catch (err) {
      console.error("Failed to forward to OpenClaw:", err);
    }

    // 11. Always return 200
    return new Response("ok", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
