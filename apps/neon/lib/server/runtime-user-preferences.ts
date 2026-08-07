import "server-only";

import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import {
  buildSessionConfigurationIdentity,
  getSessionConfiguration,
  invalidateSessionConfiguration,
  type SessionConfigurationCacheDiagnostic,
} from "@/lib/server/session-configuration-cache";
import type { RuntimeListDiagnosticRecorder } from "@/lib/server/runtime-list-observability";

const USER_PREFERENCES_NAMESPACE = "me_preferences";
const USER_PREFERENCES_POLICY = {
  freshForMs: 5 * 60_000,
  staleForMs: 25 * 60_000,
} as const;

export class RuntimeUserPreferencesUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`User preferences returned ${status}.`);
    this.name = "RuntimeUserPreferencesUpstreamError";
  }
}

/**
 * Resolves preferences once per authenticated configuration scope. The cache
 * key includes tenant, organization, principal, permission stamp and auth
 * version through SessionConfigurationIdentity.
 */
export async function getRuntimeUserPreferences(
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<unknown | null> {
  const session = await getNeonServerSession();
  if (!session) return null;
  const sessionIdentity = buildSessionConfigurationIdentity(session);
  if (!sessionIdentity) return null;

  return getSessionConfiguration({
    namespace: USER_PREFERENCES_NAMESPACE,
    sessionIdentity,
    policy: USER_PREFERENCES_POLICY,
    loader: () => fetchRuntimeUserPreferences(session),
    onDiagnostic: diagnostics
      ? (event) => recordPreferencesDiagnostic(diagnostics, event)
      : undefined,
  });
}

export function invalidateRuntimeUserPreferences(session: V4Session, reason: string): number {
  const identity = buildSessionConfigurationIdentity(session);
  if (!identity) return 0;
  return invalidateSessionConfiguration({
    namespace: USER_PREFERENCES_NAMESPACE,
    tenantId: identity.tenantId,
    planeKey: identity.planeKey,
    realmKey: identity.realmKey,
    principalId: identity.principalId,
    activeOrganizationId: identity.activeOrganizationId,
    permissionStamp: identity.permissionStamp,
    reason,
  });
}

async function fetchRuntimeUserPreferences(session: V4Session): Promise<unknown> {
  const response = await fetch(buildRuntimeUrl("/api/me/preferences"), {
    headers: buildRuntimeHeaders(session),
    cache: "no-store",
  });
  const payload = await readJson(response);
  if (!response.ok) throw new RuntimeUserPreferencesUpstreamError(response.status, payload);
  return payload;
}

function recordPreferencesDiagnostic(
  diagnostics: RuntimeListDiagnosticRecorder,
  event: SessionConfigurationCacheDiagnostic,
): void {
  diagnostics.record("session_config", event.durationMs, event.cacheState);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}
