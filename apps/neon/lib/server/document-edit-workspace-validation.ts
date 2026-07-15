import "server-only";

import { NextResponse } from "next/server";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import type { DocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import {
  inspectDocumentEditWorkspaceToken,
  type DocumentEditWorkspaceScope,
} from "@/lib/server/document-edit-workspace-token";
import { documentEditMetricTenant, recordDocumentEditMetric } from "@/lib/server/document-edit-observability";

export const DOCUMENT_EDIT_WORKSPACE_HEADER = "x-document-edit-workspace";

export type DocumentEditWorkspaceProfile = "edit" | "approve" | "create";

export type DocumentEditWorkspaceValidationResult =
  | {
      ok: true;
      scope: DocumentEditWorkspaceScope;
      tokenSource: "header" | "compatibility_body";
    }
  | { ok: false; response: NextResponse };

/**
 * Authoritative workspace guard for all post-OPEN document edit lifecycle
 * routes. Header input wins; a body fallback is accepted only where an older
 * transport contract explicitly allows it (currently HYDRATE).
 */
export function validateDocumentEditWorkspace(input: {
  request: Request;
  context: DocumentEditRuntimeRouteContext;
  profile?: DocumentEditWorkspaceProfile;
  compatibilityBodyToken?: string | null;
}): DocumentEditWorkspaceValidationResult {
  const headerToken = input.request.headers.get(DOCUMENT_EDIT_WORKSPACE_HEADER)?.trim();
  const bodyToken = input.compatibilityBodyToken?.trim();
  const token = headerToken || bodyToken;
  if (!token) {
    return failure(
      input.context,
      "WORKSPACE_REQUIRED",
      "Open the document workspace before continuing.",
      428,
      "workspace-required",
    );
  }

  const inspected = inspectDocumentEditWorkspaceToken(token);
  if (!inspected.valid) {
    if (inspected.reason === "expired") {
      return failure(
        input.context,
        "STALE_WORKSPACE",
        "The document workspace expired. Reload it before continuing.",
        409,
        "workspace-stale",
      );
    }
    return failure(
      input.context,
      "INVALID_WORKSPACE",
      "The document workspace is invalid. Reload it before continuing.",
      409,
      "workspace-invalid",
    );
  }

  const identity = buildDocumentEditCoordinatorIdentity(input.context.session, input.context.record);
  if (!identity) {
    return failure(
      input.context,
      "INVALID_WORKSPACE",
      "The document workspace cannot be matched to the active session.",
      409,
      "workspace-identity-unavailable",
    );
  }

  const scope = inspected.scope;
  const physicalRecordId = resolveDocumentEditPhysicalRecordId(input.context.record, input.context.recordId);
  if (
    scope.tenantId !== identity.tenantId
    || scope.principalId !== identity.effectivePrincipal
    || scope.entityCode !== input.context.entityCode
    || scope.recordId !== physicalRecordId
  ) {
    return failure(
      input.context,
      "INVALID_WORKSPACE",
      "The document workspace does not match the active document.",
      409,
      "workspace-scope-mismatch",
    );
  }

  if (scope.profile !== (input.profile ?? resolveDocumentEditWorkspaceProfile(input.context))) {
    return failure(
      input.context,
      "WORKSPACE_PROFILE_DENIED",
      "This document workspace does not permit the requested operation.",
      403,
      "workspace-profile-denied",
    );
  }

  if (scope.permissionStamp !== identity.permissionStamp) {
    return failure(
      input.context,
      "STALE_WORKSPACE",
      "Document permissions changed. Reload the workspace before continuing.",
      409,
      "workspace-permissions-stale",
    );
  }

  const currentPlanHash = resolveDocumentEditPlanHash(input.context);
  if (!currentPlanHash || scope.planHash !== currentPlanHash) {
    return failure(
      input.context,
      "STALE_WORKSPACE",
      "The document workspace plan changed. Reload the workspace before continuing.",
      409,
      currentPlanHash ? "workspace-plan-stale" : "workspace-plan-unavailable",
    );
  }

  return {
    ok: true,
    scope,
    tokenSource: headerToken ? "header" : "compatibility_body",
  };
}

/**
 * A provisional EARLY_DRAFT row is still in its creation authorization
 * boundary even though it already has a physical id.  Keeping this decision
 * here makes OPEN and every subsequent lifecycle guard agree.
 */
export function resolveDocumentEditWorkspaceProfile(
  context: Pick<DocumentEditRuntimeRouteContext, "descriptor" | "record">,
): DocumentEditWorkspaceProfile {
  const record = context.record as RuntimeRecordRow & { data?: Record<string, unknown> };
  const provisional = record.is_provisional === true || record.data?.["is_provisional"] === true;
  return context.descriptor.createMode === "EARLY_DRAFT" && provisional ? "create" : "edit";
}

/** Bind the capability to effective metadata and runtime behavior. */
export function resolveDocumentEditPlanHash(
  context: Pick<DocumentEditRuntimeRouteContext, "editRuntime">,
): string | null {
  if (context.editRuntime.schemaVersion !== "document-edit-runtime/v6.0") return null;
  const explicit = (context.editRuntime as unknown as Record<string, unknown>)["planHash"];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return null;
}

export function resolveDocumentEditPhysicalRecordId(
  record: RuntimeRecordRow | Record<string, unknown>,
  routeRecordId: string,
): string {
  return typeof record.id === "string" && record.id.trim() ? record.id.trim() : routeRecordId;
}

function failure(
  context: DocumentEditRuntimeRouteContext,
  error: "WORKSPACE_REQUIRED" | "INVALID_WORKSPACE" | "STALE_WORKSPACE" | "WORKSPACE_PROFILE_DENIED",
  message: string,
  status: number,
  security: string,
): DocumentEditWorkspaceValidationResult {
  recordDocumentEditMetric({
    event: "workspace_validation",
    entityCode: context.entityCode,
    tenantId: documentEditMetricTenant(context),
    transportMode: "workspace_submit",
    outcome: "failure",
    statusCode: status,
    reason: security,
  });
  return {
    ok: false,
    response: NextResponse.json(
      { error, message },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Document-Edit-Security": security,
        },
      },
    ),
  };
}
