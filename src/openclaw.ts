import type { RouteConfig, Env } from "./types.js";
import { resolveToken } from "./config.js";

export async function forwardToOpenClaw(
  route: RouteConfig,
  env: Env,
  message: string,
): Promise<void> {
  const token = resolveToken(route.openclawToken, env);
  const url = `${route.openclawUrl.replace(/\/+$/, "")}/hooks/agent`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      name: "GitHub",
      agentId: route.agentId,
      wakeMode: "now",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenClaw responded ${resp.status}: ${body}`);
  }
}
