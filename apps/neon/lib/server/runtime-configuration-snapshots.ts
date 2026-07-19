import "server-only";

import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import {
  buildSessionConfigurationIdentity,
  getSessionConfiguration,
  type SessionConfigurationCacheDiagnostic,
} from "@/lib/server/session-configuration-cache";
import type { RuntimeListDiagnosticRecorder } from "@/lib/server/runtime-list-observability";

export interface RuntimeConfigurationSnapshot {
  values: Record<string, unknown>;
  generation?: string | number;
}

const PARAMETER_SNAPSHOT_POLICY = {
  freshForMs: 60_000,
  staleForMs: 5 * 60_000,
} as const;

const FEATURE_SNAPSHOT_POLICY = {
  freshForMs: 30_000,
  staleForMs: 2 * 60_000,
} as const;

const THEME_SNAPSHOT_POLICY = {
  freshForMs: 5 * 60_000,
  staleForMs: 30 * 60_000,
} as const;

/**
 * Common effective-parameter/feature snapshot loader. The upstream HTTP fetch
 * remains no-store; the normalized result is cached only by the scoped
 * application cache above it.
 */
export async function getRuntimeConfigurationSnapshot(
  namespace: string,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<RuntimeConfigurationSnapshot | null> {
  const session = await getNeonServerSession();
  if (!session) return null;
  const sessionIdentity = buildSessionConfigurationIdentity(session);
  if (!sessionIdentity) return null;

  try {
    return await getSessionConfiguration({
      namespace: `parameters:${namespace}`,
      sessionIdentity,
      keyParts: { parameterNamespace: namespace },
      policy: resolveSnapshotPolicy(namespace),
      loader: async () => {
        const response = await fetch(
          buildRuntimeUrl(`/api/iam/parameters/effective?namespace=${encodeURIComponent(namespace)}`),
          {
            headers: buildRuntimeHeaders(session),
            cache: "no-store",
          },
        );
        if (!response.ok) {
          throw new Error(`Effective parameter snapshot ${namespace} returned ${response.status}.`);
        }
        const body = await response.json() as unknown;
        if (!isRecord(body)) throw new Error(`Effective parameter snapshot ${namespace} was malformed.`);
        return {
          values: isRecord(body["values"]) ? body["values"] : {},
          generation: stringOrNumber(body["generation"]),
        };
      },
      onDiagnostic: diagnostics
        ? (event) => recordRuntimeListDiagnostic(diagnostics, event)
        : undefined,
    });
  } catch {
    return null;
  }
}

function resolveSnapshotPolicy(namespace: string) {
  const normalized = namespace.trim().toLowerCase();
  if (normalized.startsWith("feature.") || normalized.startsWith("features.")) {
    return FEATURE_SNAPSHOT_POLICY;
  }
  if (normalized.startsWith("theme.") || normalized.endsWith(".theme")) {
    return THEME_SNAPSHOT_POLICY;
  }
  return PARAMETER_SNAPSHOT_POLICY;
}

function recordRuntimeListDiagnostic(
  diagnostics: RuntimeListDiagnosticRecorder,
  event: SessionConfigurationCacheDiagnostic,
): void {
  diagnostics.record("session_config", event.durationMs, event.cacheState);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
