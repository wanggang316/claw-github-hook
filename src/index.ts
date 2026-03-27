import type { Env } from "./types.js";
import { verifySignature } from "./verify.js";
import { parseEvent } from "./parser.js";
import { routeIntent } from "./router.js";
import { buildMessage } from "./message.js";
import { forwardToOpenClaw } from "./openclaw.js";
import { loadRoutes, resolveRoute } from "./config.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.text();

    // Verify HMAC signature
    const sigHeader = request.headers.get("X-Hub-Signature-256");
    const valid = await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, sigHeader);
    if (!valid) {
      console.log("REJECTED: invalid signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse JSON
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      console.log("REJECTED: JSON parse error");
      return new Response("ok", { status: 200 });
    }

    // Parse event
    const eventType = request.headers.get("x-github-event") ?? "unknown";
    const ev = parseEvent(eventType, data);
    console.log(
      `EVENT: ${ev.event}/${ev.action} install=${ev.installationId ?? "none"} owner=${ev.owner} repo=${ev.repo} sender=${ev.sender} bot=${ev.isBot}`,
    );

    // Load routes from KV
    const routes = await loadRoutes(env.ROUTES_KV);
    console.log(`ROUTES: loaded ${routes.length} org route(s)`);

    // Resolve route
    const route = resolveRoute(
      {
        installationId: ev.installationId,
        owner: ev.owner,
        repo: ev.repoName,
      },
      routes,
    );
    if (!route) {
      console.log(`IGNORED: no route for installation=${ev.installationId ?? "none"} owner=${ev.owner} repo=${ev.repoName}`);
      return new Response("ok", { status: 200 });
    }
    console.log(
      `ROUTE: matched owner=${route.owner} repo=${route.repo} install=${route.installationId ?? "none"} -> ${route.agentId}@${route.openclawUrl}`,
    );

    // Determine effective autoReview
    const autoReview = route.autoReview ?? env.AUTO_REVIEW === "true";

    // Route intent
    const botMention = route.botMention ?? (route.ghAccount ? `@${route.ghAccount}` : "@claw");
    const intent = routeIntent(ev, autoReview, botMention);
    if (intent === "ignore") {
      console.log("IGNORED: intent=ignore");
      return new Response("ok", { status: 200 });
    }
    console.log(`INTENT: ${intent}`);

    // Build message and forward
    const message = buildMessage(ev, intent, route);
    console.log(`MESSAGE: ${message.substring(0, 200)}...`);

    try {
      await forwardToOpenClaw(route, env, message);
      console.log("FORWARDED: success");
    } catch (err) {
      console.error("FORWARD FAILED:", err);
    }

    return new Response("ok", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
