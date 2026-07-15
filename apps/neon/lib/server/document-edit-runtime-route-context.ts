import "server-only";

import { NextResponse } from "next/server";
import type { V4Session } from "@athyper/auth-bff";
import type {
  DocumentEditRuntimeContract,
  MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  getMetaEntityRecordDetail,
  normalizeRouteRecordId,
} from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import {
  assertDocumentEditRuntimeEnabled,
  validateDocumentEditPermissionStamp,
} from "@/lib/server/document-edit-runtime-security";
import { getNeonServerSession } from "@/lib/server/session";
import { consumeDraftInitiationBootstrap } from "@/lib/server/draft-initiation-bootstrap-cache";

export interface DocumentEditRuntimeRouteContextTimings {
  sessionMs: number;
  descriptorMs: number;
  recordMs: number;
  permissionValidationMs: number;
  recordSource?: "initiation_bootstrap" | "records_service";
}

export interface DocumentEditRuntimeRouteContext {
  session: V4Session;
  entityCode: string;
  recordId: string;
  descriptor: MetaEntityRuntimeDescriptor;
  editRuntime: DocumentEditRuntimeContract;
  record: RuntimeRecordRow;
  timings?: DocumentEditRuntimeRouteContextTimings;
}

export type DocumentEditRuntimeRouteContextResult =
  | { ok: true; context: DocumentEditRuntimeRouteContext }
  | { ok: false; response: NextResponse };

export async function loadDocumentEditRuntimeRouteContext(input: {
  request: Request;
  params: Promise<{ entity: string; id: string }>;
  mode: "read" | "edit";
  unauthenticatedMessage: string;
  /**
   * Workspace lifecycle routes validate the current permission stamp against
   * the signed capability after loading context. OPEN issues that capability.
   * Compatibility routes may retain the standalone permission-stamp guard.
   */
  validatePermissionStamp?: boolean;
}): Promise<DocumentEditRuntimeRouteContextResult> {
  const enabled = assertDocumentEditRuntimeEnabled();
  if (!enabled.ok) return enabled;

  const sessionStart = performance.now();
  const session = await getNeonServerSession();
  if (!session) {
    return fail(
      "UNAUTHENTICATED",
      input.unauthenticatedMessage,
      401,
    );
  }
  const sessionMs = performance.now() - sessionStart;

  const { entity, id } = await input.params;
  const descriptorStart = performance.now();
  const entityCode = entity.trim().replace(/-/g, "_");
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode, recordId);
  const descriptorMs = performance.now() - descriptorStart;
  const recordStart = performance.now();
  if (!descriptor) {
    return fail(
      "ENTITY_NOT_FOUND",
      "This Neon route is not registered for the tenant control plane.",
      404,
    );
  }

  if (descriptor.renderer !== "document" || !descriptor.editRuntime) {
    return fail(
      "EDIT_RUNTIME_NOT_ENABLED",
      "This entity does not expose the document edit runtime contract.",
      404,
    );
  }

  if (input.mode === "read" && !descriptor.capabilities.canRead) {
    return fail(
      "READ_NOT_ALLOWED",
      "This entity is not readable in the active runtime contract.",
      403,
    );
  }

  if (
    input.mode === "edit"
    && (!descriptor.capabilities.canEdit || descriptor.capabilities.isReadOnly)
  ) {
    return fail(
      "EDIT_NOT_ALLOWED",
      "This entity is not editable in the active runtime contract.",
      403,
    );
  }

  const bootstrapRecord = consumeDraftInitiationBootstrap({ session, entityCode, recordId });
  const detail = bootstrapRecord
    ? { record: bootstrapRecord, state: { status: "ready" as const } }
    : await getMetaEntityRecordDetail(entityCode, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return fail(
      "RECORD_NOT_FOUND",
      detail.state.message ?? "Record was not found in the active organization scope.",
      404,
    );
  }
  const recordMs = performance.now() - recordStart;
  let permissionValidationMs = 0;

  if (input.validatePermissionStamp !== false) {
    const permissionStart = performance.now();
    const permissionGuard = validateDocumentEditPermissionStamp({
      request: input.request,
      session,
      record: detail.record,
    });
    permissionValidationMs = performance.now() - permissionStart;
    if (!permissionGuard.ok) return permissionGuard;
  }

  return {
    ok: true,
    context: {
      session,
      entityCode,
      recordId,
      descriptor,
      editRuntime: descriptor.editRuntime,
      record: detail.record,
      timings: {
        sessionMs: Math.max(0, Math.round(sessionMs)),
        descriptorMs: Math.max(0, Math.round(descriptorMs)),
        recordMs: Math.max(0, Math.round(recordMs)),
        permissionValidationMs: Math.round(permissionValidationMs),
        recordSource: bootstrapRecord ? "initiation_bootstrap" : "records_service",
      },
    },
  };
}

export async function readDocumentEditRuntimeJson(request: Request): Promise<unknown> {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

export function documentEditLifecycleHeaders(
  lifecycle: string,
  serverMs: number,
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-Document-Edit-Lifecycle": lifecycle,
    "X-Document-Edit-Server-Ms": String(serverMs),
  };
}

export function elapsedLifecycleMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function readLifecycleStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function readLifecycleRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fail(
  error: string,
  message: string,
  status: number,
): DocumentEditRuntimeRouteContextResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error, message },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    ),
  };
}
