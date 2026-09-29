export type CapabilityPlane = "studio" | "neon" | "mesh";
export type CapabilityReadiness = "healthy" | "degraded" | "unhealthy";
export type CapabilityState =
  | "disabled"
  | "dependency_missing"
  | "wrong_plane"
  | "partial_plane"
  | "unhealthy"
  | "healthy";

export interface HostCapabilityDefinition {
  readonly id: string;
  readonly featureFlag: string;
  readonly service: string;
  readonly repositoryProvider: string;
  readonly entryPoint: string;
  readonly planes: readonly CapabilityPlane[];
  readonly readinessChecks: Readonly<Record<CapabilityPlane, string>> | Readonly<Partial<Record<CapabilityPlane, string>>>;
}

export interface HostCompositionSnapshot {
  readonly enabledFlags: ReadonlySet<string>;
  readonly services: ReadonlySet<string>;
  readonly repositoryProviders: ReadonlyMap<string, ReadonlySet<CapabilityPlane>>;
  readonly entryPoints: ReadonlySet<string>;
  readonly activePlanes: ReadonlySet<CapabilityPlane>;
  readonly readiness: ReadonlyMap<string, CapabilityReadiness>;
}

export interface HostCapabilityAssessment {
  readonly id: string;
  readonly state: CapabilityState;
  readonly reasons: readonly string[];
}

/**
 * Evaluates the same fail-closed chain enforced statically by the repository
 * policy. It deliberately reports every missing link so readiness output is
 * useful to operators and does not silently substitute another plane.
 */
export function evaluateHostCapabilities(
  definitions: readonly HostCapabilityDefinition[],
  snapshot: HostCompositionSnapshot,
): readonly HostCapabilityAssessment[] {
  return definitions.map((definition) => evaluateCapability(definition, snapshot));
}

function evaluateCapability(
  definition: HostCapabilityDefinition,
  snapshot: HostCompositionSnapshot,
): HostCapabilityAssessment {
  if (!snapshot.enabledFlags.has(definition.featureFlag)) return result(definition.id, "disabled");

  const wrongPlanes = [...snapshot.activePlanes].filter((plane) => !definition.planes.includes(plane));
  if (wrongPlanes.length > 0) return result(definition.id, "wrong_plane", wrongPlanes.map((plane) => `unsupported plane: ${plane}`));

  const missingDependencies = [
    !snapshot.services.has(definition.service) ? `service: ${definition.service}` : undefined,
    !snapshot.repositoryProviders.has(definition.repositoryProvider) ? `repository provider: ${definition.repositoryProvider}` : undefined,
    !snapshot.entryPoints.has(definition.entryPoint) ? `entry point: ${definition.entryPoint}` : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  if (missingDependencies.length > 0) return result(definition.id, "dependency_missing", missingDependencies);

  const providerPlanes = snapshot.repositoryProviders.get(definition.repositoryProvider)!;
  const partialReasons: string[] = [];
  for (const plane of snapshot.activePlanes) {
    if (!providerPlanes.has(plane)) partialReasons.push(`repository provider missing plane: ${plane}`);
    const check = definition.readinessChecks[plane];
    if (!check) partialReasons.push(`readiness link missing plane: ${plane}`);
    else if (!snapshot.readiness.has(check)) partialReasons.push(`readiness result missing: ${check}`);
  }
  if (partialReasons.length > 0) return result(definition.id, "partial_plane", partialReasons);

  const unhealthy = [...snapshot.activePlanes]
    .map((plane) => definition.readinessChecks[plane])
    .filter((check): check is string => Boolean(check))
    .filter((check) => snapshot.readiness.get(check) !== "healthy");
  if (unhealthy.length > 0) return result(definition.id, "unhealthy", unhealthy.map((check) => `readiness check failed: ${check}`));
  return result(definition.id, "healthy");
}

function result(id: string, state: CapabilityState, reasons: readonly string[] = []): HostCapabilityAssessment {
  return { id, state, reasons };
}
