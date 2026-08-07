import "server-only";

import { createHash } from "node:crypto";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import {
  resolveEffectiveRecordWorkspaceManifest,
  type EffectiveRecordWorkspaceResolution,
  type MetaEntityRuntimeDescriptor,
  type ProcessRuntimeState,
  type RecordWorkspaceCacheScope,
  type RecordWorkspacePermissionContext,
} from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildDocumentEditPermissionStamp } from "@/lib/server/document-edit-coordinator-identity";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getNeonServerSession } from "@/lib/server/session";

const DENIED_PERMISSION_DECISIONS = new Set([
  "deny",
  "not_found",
  "not_in_plan",
  "addon_required",
  "not_granted",
]);

const CACHE_SCOPE_VARIANTS = [
  "tenant",
  "principal",
  "permission_stamp",
  "descriptor",
  "entity",
  "record",
  "record_state",
] as const;

export type RecordWorkspaceManifestLoadResult =
  | {
      ok: true;
      resolution: EffectiveRecordWorkspaceResolution;
      descriptor: MetaEntityRuntimeDescriptor;
    }
  | {
      ok: false;
      status: 401 | 403 | 404;
      error: "UNAUTHENTICATED" | "ENTITY_NOT_FOUND" | "READ_NOT_ALLOWED" | "RECORD_NOT_FOUND";
      message: string;
    };

export async function loadEffectiveRecordWorkspaceManifest(
  routeEntity: string,
  routeRecordId: string,
  resolvedSession?: V4Session,
): Promise<RecordWorkspaceManifestLoadResult> {
  const session = resolvedSession ?? await getNeonServerSession();
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "UNAUTHENTICATED",
      message: "Sign in again to inspect this record workspace.",
    };
  }

  const entityCode = normalizeEntityCode(routeEntity);
  const recordId = normalizeRouteRecordId(routeRecordId);
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode, recordId);
  if (!descriptor) {
    return {
      ok: false,
      status: 404,
      error: "ENTITY_NOT_FOUND",
      message: "This entity is not registered for the active tenant.",
    };
  }
  if (!descriptor.capabilities.canRead) {
    return {
      ok: false,
      status: 403,
      error: "READ_NOT_ALLOWED",
      message: "This entity is not readable in the active runtime contract.",
    };
  }

  const detail = await getMetaEntityRecordDetail(entityCode, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return {
      ok: false,
      status: 404,
      error: "RECORD_NOT_FOUND",
      message: detail.state.message ?? "Record was not found in the active organization scope.",
    };
  }
  const processState = await getMetaEntityProcessRuntimeState(
    entityCode,
    recordId,
    descriptor,
    detail.record,
  );
  return {
    ok: true,
    descriptor,
    resolution: resolveEffectiveRecordWorkspaceManifestFromLoaded({
      descriptor,
      recordId,
      record: detail.record,
      processState,
      session,
    }),
  };
}

export function resolveEffectiveRecordWorkspaceManifestFromLoaded(input: {
  descriptor: MetaEntityRuntimeDescriptor;
  recordId: string;
  record: RuntimeRecordRow;
  processState?: ProcessRuntimeState | null;
  session: V4Session;
}): EffectiveRecordWorkspaceResolution {
  const permissions = resolveRecordWorkspacePermissions(input.descriptor);
  const cacheScope = buildRecordWorkspaceCacheScope({
    descriptor: input.descriptor,
    recordId: input.recordId,
    record: input.record,
    processState: input.processState,
    session: input.session,
    permissions,
  });
  return resolveEffectiveRecordWorkspaceManifest({
    descriptor: input.descriptor,
    recordId: input.recordId,
    record: input.record,
    processState: input.processState,
    permissions,
    cacheScope,
  });
}

/**
 * Runtime bootstrap and record-operation endpoints already evaluate grants
 * server-side. The descriptor therefore contains only allowed operations in
 * the normal path; explicit deny decisions remain supported for legacy and
 * diagnostic descriptors.
 */
export function resolveRecordWorkspacePermissions(
  descriptor: MetaEntityRuntimeDescriptor,
): RecordWorkspacePermissionContext {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  const known = new Set<string>();
  for (const operation of descriptor.operations) {
    const code = operation.permissionCode.trim();
    if (!code) continue;
    known.add(code);
    if (operation.permissionDecision && DENIED_PERMISSION_DECISIONS.has(operation.permissionDecision)) {
      denied.add(code);
    } else {
      allowed.add(code);
    }
  }
  return { source: "descriptor_operations", allowed, denied, known };
}

export function buildRecordWorkspaceCacheScope(input: {
  descriptor: MetaEntityRuntimeDescriptor;
  recordId: string;
  record: RuntimeRecordRow;
  processState?: ProcessRuntimeState | null;
  session: V4Session;
  permissions: RecordWorkspacePermissionContext;
}): RecordWorkspaceCacheScope {
  const membership = input.session.activeOrg
    ? input.session.organizations[input.session.activeOrg]
    : undefined;
  const versionColumn = input.descriptor.concurrency?.versionColumn;
  const recordVersion = versionColumn ? readRecordValue(input.record, versionColumn) : null;
  const payload = {
    tenant: membership?.tenantId ?? "",
    principal: input.session.userId,
    permissionStamp: buildDocumentEditPermissionStamp(input.session),
    descriptor: input.descriptor.audit.descriptorHash ?? input.descriptor.audit.compiledHash ?? "",
    entity: input.descriptor.entityCode,
    record: input.recordId,
    recordVersion,
    state: {
      lifecycle: input.processState?.lifecycle?.currentState ?? null,
      terminal: input.processState?.lifecycle?.terminal ?? false,
      allowedTransitions: [...(input.processState?.lifecycle?.allowedTransitions ?? [])].sort(),
      workflow: input.processState?.workflow?.status ?? null,
      workflowStage: input.processState?.workflow?.currentStage ?? null,
      pendingTasks: input.processState?.workflow?.pendingTasks ?? 0,
      disabledOperations: Object.keys(input.processState?.disabledOperations ?? {}).sort(),
    },
    allowedPermissions: [...input.permissions.allowed].map(normalizeCode).sort(),
    deniedPermissions: [...(input.permissions.denied ?? [])].map(normalizeCode).sort(),
  };
  return {
    kind: "principal_record",
    key: `record-workspace:v1:${hashJson(payload)}`,
    variesBy: [...CACHE_SCOPE_VARIANTS],
  };
}

export function isRecordWorkspaceDiagnosticsAdministrator(session: V4Session): boolean {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const roles = new Set((membership?.roles ?? []).map(normalizeCode));
  const contextType = normalizeCode(membership?.contextType ?? "");
  return normalizeCode(session.activeWorkbench ?? "") === "admin"
    || ["tenant_admin", "platform_admin", "organization_admin"].includes(contextType)
    || ["admin", "tenant_admin", "platform_admin", "administrator"].some((role) => roles.has(role));
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function readRecordValue(record: RuntimeRecordRow, fieldName: string): unknown {
  if (record[fieldName] !== undefined) return record[fieldName];
  const data = isRecord(record.data) ? record.data : undefined;
  return data?.[fieldName] ?? null;
}

function normalizeEntityCode(value: string): string {
  return value.trim().replace(/-/g, "_");
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
