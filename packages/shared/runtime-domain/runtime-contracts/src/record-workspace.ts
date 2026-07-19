import { reportMetadataCompatibilityFallback } from "./compatibility-fallback";
import { resolveLifecycleRuntime, resolveRuntimeOperations, type RuntimeRecordLike } from "./process-runtime";
import {
  EffectiveRecordWorkspaceManifestSchema,
  RECORD_WORKSPACE_MANIFEST_VERSION,
  RECORD_WORKSPACE_DEFINITION_VERSION,
  RecordWorkspaceManifestDiagnosticsSchema,
  RecordWorkspaceDefinitionSchema,
  type EffectiveRecordWorkspaceManifest,
  type EffectiveRecordWorkspaceResource,
  type EffectiveRecordWorkspaceSurface,
  type MetaEntityCapabilities,
  type MetaEntityRenderer,
  type MetaEntityRuntimeDescriptor,
  type MetaEntitySurface,
  type MetaEntitySurfaceKind,
  type ProcessRuntimeState,
  type RecordWorkspaceCacheScope,
  type RecordWorkspaceDefinition,
  type RecordWorkspaceManifestDiagnostics,
  type RecordWorkspaceResourceBinding,
  type RecordWorkspaceResourceKey,
  type RecordWorkspaceSurfaceReference,
} from "./schemas";

export interface RecordWorkspaceCompileInput {
  entityCode: string;
  renderer: MetaEntityRenderer;
  capabilities: MetaEntityCapabilities;
  surfaces: readonly MetaEntitySurface[];
}

export interface RecordWorkspacePermissionContext {
  source: "authoritative" | "descriptor_operations";
  allowed: Iterable<string>;
  denied?: Iterable<string>;
  known?: Iterable<string>;
}

export interface ResolveEffectiveRecordWorkspaceManifestInput {
  descriptor: MetaEntityRuntimeDescriptor;
  recordId: string;
  record?: RuntimeRecordLike | null;
  processState?: ProcessRuntimeState | null;
  permissions: RecordWorkspacePermissionContext;
  cacheScope: RecordWorkspaceCacheScope;
}

export interface EffectiveRecordWorkspaceResolution {
  manifest: EffectiveRecordWorkspaceManifest;
  diagnostics: RecordWorkspaceManifestDiagnostics;
}

/**
 * Compiles record orchestration from the descriptor's existing capability and
 * surface contracts. It does not change either source contract or UI routing.
 */
export function compileRecordWorkspaceDefinition(
  input: RecordWorkspaceCompileInput,
): RecordWorkspaceDefinition {
  const surfaceReferences = input.surfaces.map(toSurfaceReference);
  const approvals = resolveResourceBinding(input.capabilities.hasWorkflow, input.surfaces, ["workflow"]);
  const snapshots = resolveResourceBinding(input.capabilities.hasVersions, input.surfaces, ["versions"]);
  const explicitLifecycle = resolveResourceBinding(
    input.capabilities.hasLifecycle,
    input.surfaces,
    ["lifecycle"],
  );
  const lifecycleTimeline = explicitLifecycle.enabled
    ? explicitLifecycle
    : resolveLegacyLifecycleTimeline(input.entityCode, approvals.enabled, snapshots.enabled);
  const compareSurface = firstEnabledSurface(input.surfaces, ["compare"]);

  return RecordWorkspaceDefinitionSchema.parse({
    schemaVersion: RECORD_WORKSPACE_DEFINITION_VERSION,
    renderer: input.renderer,
    initialSurfaceKey: resolveInitialSurfaceKey(input.surfaces),
    surfaces: surfaceReferences,
    resources: {
      approvals,
      lifecycleTimeline,
      snapshots: {
        ...snapshots,
        ...(snapshots.enabled && compareSurface ? { compareSurfaceKey: compareSurface.key } : {}),
      },
      comments: resolveResourceBinding(input.capabilities.hasComments, input.surfaces, ["comments"]),
      attachments: resolveResourceBinding(input.capabilities.hasAttachments, input.surfaces, ["attachments"]),
      activity: resolveResourceBinding(input.capabilities.hasActivityLog, input.surfaces, ["activity_log"]),
    },
  });
}

/**
 * Compatibility reader for descriptors emitted before record-workspace/v1.
 * Callers can adopt the contract without silently dropping older tenants.
 */
export function resolveRecordWorkspaceDefinition(
  descriptor: MetaEntityRuntimeDescriptor,
): RecordWorkspaceDefinition {
  const parsed = RecordWorkspaceDefinitionSchema.safeParse(descriptor.recordWorkspace);
  if (parsed.success) return parsed.data;

  reportMetadataCompatibilityFallback({
    area: "record-workspace",
    subjectKind: "descriptor",
    subjectName: descriptor.entityCode,
    convention: "descriptor capabilities and surfaces",
    expectedMetadata: "descriptor.recordWorkspace compiled from record-workspace/v1",
  });
  return compileRecordWorkspaceDefinition({
    entityCode: descriptor.entityCode,
    renderer: descriptor.renderer,
    capabilities: descriptor.capabilities,
    surfaces: descriptor.surfaces,
  });
}

export function assertRecordWorkspaceDefinition(value: unknown): RecordWorkspaceDefinition {
  return RecordWorkspaceDefinitionSchema.parse(value);
}

/**
 * Resolves the principal- and record-specific workspace query manifest.
 * Protected surfaces fail closed: an unresolved permission code is excluded
 * and reported to diagnostics instead of being interpreted as a role name or
 * inferred from the surface label.
 */
export function resolveEffectiveRecordWorkspaceManifest(
  input: ResolveEffectiveRecordWorkspaceManifestInput,
): EffectiveRecordWorkspaceResolution {
  const definition = resolveRecordWorkspaceDefinition(input.descriptor);
  const descriptorSurfaceByKey = new Map(
    input.descriptor.surfaces.map((surface) => [surface.key, surface] as const),
  );
  const permissionSets = buildPermissionSets(input.permissions);
  const surfaceDecisions: RecordWorkspaceManifestDiagnostics["surfaceDecisions"] = [];
  const invalidPermissionCodes: RecordWorkspaceManifestDiagnostics["invalidPermissionCodes"] = [];
  const effectiveSurfaces: EffectiveRecordWorkspaceSurface[] = [];

  for (const reference of definition.surfaces) {
    const surface = descriptorSurfaceByKey.get(reference.key);
    if (!reference.enabled || !surface?.enabled) {
      surfaceDecisions.push({
        surfaceKey: reference.key,
        included: false,
        reason: "unsupported",
      });
      continue;
    }

    const permissionCode = surface.permissionCode?.trim();
    if (!permissionCode) {
      surfaceDecisions.push({ surfaceKey: reference.key, included: true, reason: "included" });
      effectiveSurfaces.push({ ...reference });
      continue;
    }

    const normalizedPermission = normalizePermissionCode(permissionCode);
    if (permissionSets.denied.has(normalizedPermission)) {
      surfaceDecisions.push({
        surfaceKey: reference.key,
        permissionCode,
        included: false,
        reason: "permission_denied",
      });
      continue;
    }
    if (permissionSets.allowed.has(normalizedPermission)) {
      surfaceDecisions.push({
        surfaceKey: reference.key,
        permissionCode,
        included: true,
        reason: "included",
      });
      effectiveSurfaces.push({ ...reference, permissionCode });
      continue;
    }

    const known = permissionSets.known.has(normalizedPermission);
    surfaceDecisions.push({
      surfaceKey: reference.key,
      permissionCode,
      included: false,
      reason: known ? "permission_denied" : "permission_unresolved",
    });
    if (!known) {
      invalidPermissionCodes.push({
        surfaceKey: reference.key,
        permissionCode,
        message: `Surface permission "${permissionCode}" is not present in the effective permission catalog.`,
      });
    }
  }

  const effectiveSurfaceKeys = new Set(effectiveSurfaces.map((surface) => surface.key));
  const resourceDecisions: RecordWorkspaceManifestDiagnostics["resourceDecisions"] = [];
  const effectiveResources: EffectiveRecordWorkspaceResource[] = [];
  for (const resource of RECORD_WORKSPACE_RESOURCE_KEYS) {
    const binding = definition.resources[resource];
    if (!binding.enabled) {
      resourceDecisions.push({ resource, included: false, reason: "unsupported" });
      continue;
    }
    if (binding.surfaceKey && !effectiveSurfaceKeys.has(binding.surfaceKey)) {
      resourceDecisions.push({
        resource,
        surfaceKey: binding.surfaceKey,
        included: false,
        reason: "surface_unavailable",
      });
      continue;
    }

    const compareCandidate = resource === "snapshots"
      ? definition.resources.snapshots.compareSurfaceKey
      : undefined;
    const compareSurfaceKey = compareCandidate
      && effectiveSurfaceKeys.has(compareCandidate)
      ? compareCandidate
      : undefined;
    effectiveResources.push({
      key: resource,
      ...(binding.surfaceKey ? { surfaceKey: binding.surfaceKey } : {}),
      ...(compareSurfaceKey ? { compareSurfaceKey } : {}),
    });
    resourceDecisions.push({
      resource,
      ...(binding.surfaceKey ? { surfaceKey: binding.surfaceKey } : {}),
      included: true,
      reason: "included",
    });
  }

  const lifecycle = resolveLifecycleRuntime({
    descriptor: input.descriptor,
    record: input.record,
    processState: input.processState,
  });
  const operations = resolveRuntimeOperations({
    descriptor: input.descriptor,
    record: input.record,
    processState: input.processState,
    mode: "detail",
    permissions: permissionSets.allowed,
    enforcePermissions: true,
    includeDisabled: false,
    includeUnsupportedMode: false,
    includeWorkflowTaskOperations: true,
  }).map(({ operation }) => ({
    key: operation.key,
    permissionCode: operation.permissionCode,
    ...(operation.source ? { source: operation.source } : {}),
  }));

  const manifest = EffectiveRecordWorkspaceManifestSchema.parse({
    schemaVersion: RECORD_WORKSPACE_MANIFEST_VERSION,
    definitionVersion: RECORD_WORKSPACE_DEFINITION_VERSION,
    entityCode: input.descriptor.entityCode,
    recordId: input.recordId,
    renderer: definition.renderer,
    initialSurfaceKey: resolveEffectiveInitialSurfaceKey(
      definition.initialSurfaceKey,
      effectiveSurfaces,
    ),
    cacheScope: input.cacheScope,
    recordState: {
      lifecycleState: lifecycle.currentState,
      terminal: lifecycle.terminal,
      allowedTransitions: lifecycle.allowedTransitions,
      workflowStatus: input.processState?.workflow?.status ?? null,
      pendingWorkflowTasks: input.processState?.workflow?.pendingTasks ?? 0,
    },
    surfaces: effectiveSurfaces,
    resources: effectiveResources,
    operations,
  });
  const diagnostics = RecordWorkspaceManifestDiagnosticsSchema.parse({
    permissionSource: input.permissions.source,
    surfaceDecisions,
    resourceDecisions,
    invalidPermissionCodes,
  });
  return { manifest, diagnostics };
}

export function validateRecordWorkspaceSurfacePermissions(
  descriptor: MetaEntityRuntimeDescriptor,
  permissions: RecordWorkspacePermissionContext,
): RecordWorkspaceManifestDiagnostics["invalidPermissionCodes"] {
  const permissionSets = buildPermissionSets(permissions);
  return descriptor.surfaces.flatMap((surface) => {
    const permissionCode = surface.permissionCode?.trim();
    if (!permissionCode || permissionSets.known.has(normalizePermissionCode(permissionCode))) return [];
    return [{
      surfaceKey: surface.key,
      permissionCode,
      message: `Surface permission "${permissionCode}" is not present in the effective permission catalog.`,
    }];
  });
}

function resolveResourceBinding(
  capabilityEnabled: boolean,
  surfaces: readonly MetaEntitySurface[],
  kinds: readonly MetaEntitySurfaceKind[],
): RecordWorkspaceResourceBinding {
  const surface = firstEnabledSurface(surfaces, kinds);
  if (capabilityEnabled && surface) {
    return {
      enabled: true,
      source: "capability_and_surface",
      surfaceKey: surface.key,
    };
  }
  if (capabilityEnabled) return { enabled: true, source: "capability" };
  if (surface) return { enabled: true, source: "surface", surfaceKey: surface.key };
  return { enabled: false, source: "none" };
}

function resolveLegacyLifecycleTimeline(
  entityCode: string,
  approvalsEnabled: boolean,
  snapshotsEnabled: boolean,
): RecordWorkspaceResourceBinding {
  if (!approvalsEnabled && !snapshotsEnabled) return { enabled: false, source: "none" };

  const fallbackReason = approvalsEnabled && snapshotsEnabled
    ? "approvals_or_snapshots_imply_lifecycle_timeline"
    : approvalsEnabled
      ? "approvals_imply_lifecycle_timeline"
      : "snapshots_imply_lifecycle_timeline";
  reportMetadataCompatibilityFallback({
    area: "record-workspace.lifecycle-timeline",
    subjectKind: "descriptor",
    subjectName: entityCode,
    convention: fallbackReason,
    expectedMetadata: "capabilities.hasLifecycle or an enabled lifecycle surface",
  });
  return {
    enabled: true,
    source: "compatibility_fallback",
    fallbackReason,
  };
}

function firstEnabledSurface(
  surfaces: readonly MetaEntitySurface[],
  kinds: readonly MetaEntitySurfaceKind[],
): MetaEntitySurface | undefined {
  return surfaces.find((surface) => surface.enabled && kinds.includes(surface.kind));
}

function resolveInitialSurfaceKey(surfaces: readonly MetaEntitySurface[]): string | null {
  return surfaces.find((surface) => surface.enabled && surface.kind === "fields")?.key
    ?? surfaces.find((surface) => surface.enabled && surface.placement === "main")?.key
    ?? surfaces.find((surface) => surface.enabled)?.key
    ?? null;
}

function toSurfaceReference(surface: MetaEntitySurface): RecordWorkspaceSurfaceReference {
  return {
    key: surface.key,
    kind: surface.kind,
    placement: surface.placement,
    order: surface.order,
    enabled: surface.enabled,
  };
}

const RECORD_WORKSPACE_RESOURCE_KEYS = [
  "approvals",
  "lifecycleTimeline",
  "snapshots",
  "comments",
  "attachments",
  "activity",
] as const satisfies readonly RecordWorkspaceResourceKey[];

function buildPermissionSets(permissions: RecordWorkspacePermissionContext): {
  allowed: Set<string>;
  denied: Set<string>;
  known: Set<string>;
} {
  const allowed = new Set([...permissions.allowed].map(normalizePermissionCode).filter(Boolean));
  const denied = new Set([...(permissions.denied ?? [])].map(normalizePermissionCode).filter(Boolean));
  const known = new Set([...(permissions.known ?? []), ...permissions.allowed, ...(permissions.denied ?? [])]
    .map(normalizePermissionCode)
    .filter(Boolean));
  return { allowed, denied, known };
}

function normalizePermissionCode(value: string): string {
  return value.trim().toLowerCase();
}

function resolveEffectiveInitialSurfaceKey(
  preferred: string | null,
  surfaces: readonly EffectiveRecordWorkspaceSurface[],
): string | null {
  if (preferred && surfaces.some((surface) => surface.key === preferred)) return preferred;
  return surfaces.find((surface) => surface.kind === "fields")?.key
    ?? surfaces.find((surface) => surface.placement === "main")?.key
    ?? surfaces[0]?.key
    ?? null;
}
