import type { AtlasPlane } from "../protocol/request";

export interface AtlasSessionScope {
  userId: string;
  tenantId: string;
  workContextId?: string;
  plane: AtlasPlane;
  /**
   * Both the session and membership epochs participate in this value. It is
   * intentionally opaque to consumers; they only use it for scope identity.
   */
  authEpoch: string;
  permissionStamp: string;
}

export function createAtlasSessionScope(value: unknown): AtlasSessionScope {
  if (!isRecord(value)) throw new Error("Atlas requires a validated public session");

  const userId = readString(value["userId"]);
  const plane = readPlane(value["planeKey"]);
  const activeOrg = readString(value["activeOrg"]);
  const organizations = isRecord(value["organizations"]) ? value["organizations"] : {};
  const membership = activeOrg && isRecord(organizations[activeOrg])
    ? organizations[activeOrg]
    : {};
  const tenantId = readString(membership["tenantId"]) ?? activeOrg;
  const activeWorkContext = isRecord(value["activeWorkContext"])
    ? value["activeWorkContext"]
    : {};
  const workContextId =
    readString(activeWorkContext["id"]) ??
    readString(membership["workspaceId"]) ??
    readString(membership["organizationId"]);

  if (!userId || !tenantId || !plane) {
    throw new Error("Atlas session is missing user, tenant, or plane scope");
  }

  const sessionAuthEpoch = readEpoch(value["authEpoch"]) ?? "0";
  const membershipAuthEpoch = readEpoch(membership["authEpoch"]) ?? "0";
  const authEpoch = `${sessionAuthEpoch}:${membershipAuthEpoch}`;
  const explicitStamp = readString(value["permissionStamp"]);
  const permissionStamp = explicitStamp
    ?? String(readNumber(membership["scopeVersion"]) ?? 0);

  return {
    userId,
    tenantId,
    ...(workContextId ? { workContextId } : {}),
    plane,
    authEpoch,
    permissionStamp,
  };
}

/**
 * Collision-free identity for client-side state isolation.
 *
 * This is intentionally a canonical tuple rather than a short hash. The key
 * stays in memory and is never used as telemetry, so preserving exact scope
 * identity is more important than compactness.
 */
export function atlasSessionScopeKey(scope: AtlasSessionScope): string {
  return JSON.stringify([
    scope.userId,
    scope.tenantId,
    scope.workContextId ?? null,
    scope.plane,
    scope.authEpoch,
    scope.permissionStamp,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readEpoch(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return readString(value);
}

function readPlane(value: unknown): AtlasPlane | undefined {
  return value === "neon" || value === "mesh" || value === "admin" ? value : undefined;
}
