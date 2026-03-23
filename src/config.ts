import type { RouteConfig, Env } from "./types.js";

function isRouteConfig(value: unknown): value is RouteConfig {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.repo === "string" &&
    typeof obj.openclawUrl === "string" &&
    typeof obj.openclawToken === "string" &&
    typeof obj.agentId === "string"
  );
}

export async function loadRoutes(kv: KVNamespace): Promise<RouteConfig[]> {
  try {
    const raw = await kv.get("routes");
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("KV routes value is not an array, falling back to empty routes");
      return [];
    }
    return parsed.filter(isRouteConfig);
  } catch (err) {
    console.warn("Failed to load routes from KV:", err);
    return [];
  }
}

export function resolveRoute(repo: string, routes: RouteConfig[]): RouteConfig | null {
  const owner = repo.split("/")[0];

  // 1. Exact match
  const exact = routes.find((r) => r.repo === repo);
  if (exact) return exact;

  // 2. Owner wildcard
  const ownerWild = routes.find((r) => r.repo === `${owner}/*`);
  if (ownerWild) return ownerWild;

  // 3. Global wildcard
  const global = routes.find((r) => r.repo === "*");
  if (global) return global;

  return null;
}

export function resolveToken(tokenRef: string, env: Env): string {
  if (!tokenRef.startsWith("$")) return tokenRef;

  const varName = tokenRef.slice(1);
  const value = env[varName];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Token env var "${varName}" is not set or empty`);
  }
  return value;
}
