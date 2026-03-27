import type { OrgRouteConfig, Env, ResolvedRoute, RouteLookup, RouteTarget } from "./types.js";

function isRouteTarget(value: unknown): value is RouteTarget {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.openclawUrl === "string" &&
    typeof obj.openclawToken === "string" &&
    typeof obj.agentId === "string"
  );
}

function isRepoOverrides(value: unknown): value is Record<string, Partial<RouteTarget>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  for (const override of Object.values(value as Record<string, unknown>)) {
    if (typeof override !== "object" || override === null || Array.isArray(override)) {
      return false;
    }

    for (const [key, field] of Object.entries(override)) {
      if (!["openclawUrl", "openclawToken", "agentId", "autoReview", "ghAccount", "botMention"].includes(key)) {
        return false;
      }
      if (key === "autoReview") {
        if (field !== undefined && typeof field !== "boolean") return false;
        continue;
      }
      if (field !== undefined && typeof field !== "string") return false;
    }
  }

  return true;
}

function isOrgRouteConfig(value: unknown): value is OrgRouteConfig {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.owner === "string" &&
    (obj.installationId === undefined || typeof obj.installationId === "number") &&
    isRouteTarget(obj.defaults) &&
    (obj.repos === undefined || isRepoOverrides(obj.repos))
  );
}

export async function loadRoutes(kv: KVNamespace): Promise<OrgRouteConfig[]> {
  try {
    const raw = await kv.get("routes");
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("KV routes value is not an array, falling back to empty routes");
      return [];
    }
    return parsed.filter(isOrgRouteConfig);
  } catch (err) {
    console.warn("Failed to load routes from KV:", err);
    return [];
  }
}

export function resolveRoute(lookup: RouteLookup, routes: OrgRouteConfig[]): ResolvedRoute | null {
  const orgRoute = (
    lookup.installationId !== null
      ? routes.find((route) => route.installationId === lookup.installationId)
      : null
  ) ?? routes.find((route) => route.owner === lookup.owner);

  if (!orgRoute) return null;

  const repoOverride = orgRoute.repos?.[lookup.repo];
  return {
    ...orgRoute.defaults,
    ...repoOverride,
    installationId: lookup.installationId,
    owner: lookup.owner,
    repo: lookup.repo,
  };
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
