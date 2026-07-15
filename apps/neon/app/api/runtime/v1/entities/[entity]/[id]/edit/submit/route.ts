import { NextResponse } from "next/server";
import {
  DOCUMENT_EDIT_SUBMIT_ERROR_STATUS,
  DOCUMENT_EDIT_SUBMIT_HEADERS,
  DocumentEditSubmitRequestV1Schema,
  DocumentEditSubmitResponseV1Schema,
  type DocumentEditSubmitRequestV1,
  type DocumentEditSubmitResponseV1,
} from "@athyper/api-contracts/document-edit-submit";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { DocumentEditRuntimeContract } from "@athyper/runtime-contracts";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
  readDocumentEditRuntimeJson,
  readLifecycleRecord,
} from "@/lib/server/document-edit-runtime-route-context";
import {
  deleteDocumentEditServerDraft,
  readDocumentEditServerDraft,
  upsertDocumentEditServerDraft,
  DocumentEditDraftConflictError,
  type DocumentEditServerDraft,
} from "@/lib/server/document-edit-runtime-drafts";
import {
  buildDocumentEditRuntimeEventScope,
  publishDocumentEditRuntimeEvent,
} from "@/lib/server/document-edit-runtime-events";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { validateDocumentEditWorkspace } from "@/lib/server/document-edit-workspace-validation";
import {
  documentEditMetricTenant,
  recordDocumentEditMetric,
} from "@/lib/server/document-edit-observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to submit this document.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;
  const metricBase = {
    entityCode: loaded.context.entityCode,
    tenantId: documentEditMetricTenant(loaded.context),
    transportMode: "workspace_submit" as const,
  };
  const workspace = validateDocumentEditWorkspace({ request, context: loaded.context });
  if (!workspace.ok) return workspace.response;

  const transportError = validateSubmitTransportHeaders(request);
  if (transportError) {
    recordDocumentEditMetric({
      event: "save",
      ...metricBase,
      outcome: "transport_validation_failure",
      statusCode: transportError.status,
      durationMs: elapsedLifecycleMs(startedAt),
    });
    return transportError;
  }

  const parsedBody = DocumentEditSubmitRequestV1Schema.safeParse(
    await readDocumentEditRuntimeJson(request),
  );
  if (!parsedBody.success) {
    recordDocumentEditMetric({
      event: "save",
      ...metricBase,
      outcome: "validation_failure",
      statusCode: 422,
      reason: "request_schema",
      durationMs: elapsedLifecycleMs(startedAt),
    });
    return NextResponse.json(
      {
        error: "VALIDATION",
        message: "The document submit request is invalid.",
        fieldErrors: submitRequestFieldErrors(parsedBody.error.issues),
      },
      {
        status: 422,
        headers: documentEditLifecycleHeaders("submit-validation-failed", elapsedLifecycleMs(startedAt)),
      },
    );
  }

  const body = parsedBody.data;
  const childPermissionError = validateChildMutationPermissions(
    body,
    loaded.context.editRuntime,
    loaded.context.descriptor,
  );
  if (childPermissionError) return childPermissionError;
  if (body.intent === "save_and_transition" && loaded.context.editRuntime.submitPolicy.saveAndTransitionEnabled === false) {
    recordDocumentEditMetric({
      event: "save",
      ...metricBase,
      outcome: "save_and_transition_disabled",
      statusCode: 409,
      durationMs: elapsedLifecycleMs(startedAt),
    });
    return NextResponse.json(
      {
        error: "SAVE_AND_TRANSITION_DISABLED",
        message: "Save and transition is temporarily disabled for this document entity.",
      },
      { status: 409, headers: documentEditLifecycleHeaders("submit-transition-disabled", elapsedLifecycleMs(startedAt)) },
    );
  }
  const sourceTabId = body.sourceTabId;
  const clientSeq = body.clientSeq;
  const existingServerDraft = await readDocumentEditServerDraft(loaded.context);
  try {
    await persistSubmitSnapshot({
      context: loaded.context,
      body,
      sourceTabId,
      clientSeq,
      fallback: existingServerDraft,
    });
  } catch (error) {
    if (error instanceof DocumentEditDraftConflictError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          currentRevision: error.currentRevision,
        },
        { status: 409, headers: documentEditLifecycleHeaders("submit-draft-conflict", elapsedLifecycleMs(startedAt)) },
      );
    }
    throw error;
  }
  const actionCode = readSubmitActionCode(body, loaded.context.editRuntime);
  const upstreamResponse = await fetch(
    buildRuntimeUrl(runtimeServerPath.documentEditSubmit(loaded.context.entityCode, loaded.context.recordId)),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(loaded.context.session),
        "Content-Type": "application/json",
        [DOCUMENT_EDIT_SUBMIT_HEADERS.workspace]: request.headers.get(DOCUMENT_EDIT_SUBMIT_HEADERS.workspace)!,
        [DOCUMENT_EDIT_SUBMIT_HEADERS.ifMatch]: request.headers.get(DOCUMENT_EDIT_SUBMIT_HEADERS.ifMatch)!,
        [DOCUMENT_EDIT_SUBMIT_HEADERS.idempotencyKey]: request.headers.get(DOCUMENT_EDIT_SUBMIT_HEADERS.idempotencyKey)!,
      },
      cache: "no-store",
      signal: request.signal,
      body: JSON.stringify(body),
    },
  );
  const upstreamBody = await upstreamResponse.json().catch(() => null) as unknown;
  const serverMs = elapsedLifecycleMs(startedAt);

  if (!upstreamResponse.ok) {
    const failure = readLifecycleRecord(upstreamBody);
    recordDocumentEditMetric({
      event: "save",
      ...metricBase,
      outcome: "failure",
      statusCode: documentEditSubmitFailureStatus(upstreamResponse.status, failure),
      reason: typeof failure["error"] === "string" ? failure["error"] : "unknown",
      durationMs: serverMs,
    });
    return NextResponse.json(failure, {
      status: documentEditSubmitFailureStatus(upstreamResponse.status, failure),
      headers: documentEditLifecycleHeaders("submit-failed", serverMs),
    });
  }

  const submitResponse = normalizeSubmitResponse(body, upstreamBody);
  if (!submitResponse) {
    recordDocumentEditMetric({
      event: "save",
      ...metricBase,
      outcome: "invalid_response",
      statusCode: 502,
      durationMs: serverMs,
    });
    return NextResponse.json(
      {
        error: "INVALID_SUBMIT_RESPONSE",
        message: "The runtime service returned an invalid document submit response.",
      },
      {
        status: 502,
        headers: documentEditLifecycleHeaders("submit-contract-failed", serverMs),
      },
    );
  }

  await deleteDocumentEditServerDraft(loaded.context);
  const idempotencyReplay = upstreamResponse.headers.get("X-Document-Edit-Cache") === "idempotency";
  recordDocumentEditMetric({
    event: "save",
    ...metricBase,
    outcome: "success",
    statusCode: upstreamResponse.status,
    durationMs: serverMs,
    idempotencyReplay,
  });
  const recoverableState = submitResponse.actionResult?.["recoverableState"]
    ?? submitResponse.actionResult?.["state"];
  if (typeof recoverableState === "string" && (
    recoverableState.includes("compens") || recoverableState.includes("action_pending")
  )) {
    recordDocumentEditMetric({
      event: "workflow_compensation",
      ...metricBase,
      outcome: recoverableState.includes("failed") ? "failure" : "pending",
      statusCode: upstreamResponse.status,
      reason: recoverableState,
      durationMs: serverMs,
    });
  }
  publishDocumentEditRuntimeEvent(
    buildDocumentEditRuntimeEventScope(loaded.context),
    {
      type: "document_edit_record_updated",
      sourceTabId,
      payload: {
        reason: "submit",
        actionCode,
      },
    },
  );

  return NextResponse.json(submitResponse, {
    status: upstreamResponse.status,
    headers: {
      ...documentEditLifecycleHeaders("submit", serverMs),
      ETag: submitResponse.etag,
      ...(idempotencyReplay ? { "X-Document-Edit-Cache": "idempotency" } : {}),
    },
  });
}

function validateChildMutationPermissions(
  body: DocumentEditSubmitRequestV1,
  editRuntime: Pick<DocumentEditRuntimeContract, "childCollections">,
  descriptor: { relations?: Array<{ name: string; key: string; targetEntity?: string; mutationOwner?: string }> },
): NextResponse | null {
  const submitted = new Map(Object.entries(body.changes.collections ?? {}));
  if (body.changes.lines) submitted.set("lines", body.changes.lines);
  for (const [key, changes] of submitted) {
    const collection = (editRuntime.childCollections ?? []).find((child) => child.key === key);
    if (!collection) {
      return NextResponse.json({
        error: "CHILD_COLLECTION_NOT_DECLARED",
        message: `Child collection "${key}" is not declared by this document workspace.`,
        collection: key,
      }, { status: 422 });
    }
    const relation = collection.relationName
      ? descriptor.relations?.find((candidate) => candidate.name === collection.relationName || candidate.key === collection.relationName)
      : undefined;
    if (!relation || relation.mutationOwner !== "workspace" || (
      relation.targetEntity && relation.targetEntity !== collection.entityCode
    )) {
      return NextResponse.json({
        error: "CHILD_COLLECTION_WORKSPACE_OWNERSHIP_REQUIRED",
        message: `Child collection "${key}" is not a workspace-owned relation.`,
        collection: key,
      }, { status: 422 });
    }
    const denied = [
      (changes.create?.length ?? 0) > 0 && !collection.mutationPolicy.create ? "create" : null,
      (changes.update?.length ?? 0) > 0 && !collection.mutationPolicy.update ? "update" : null,
      (changes.delete?.length ?? 0) > 0 && !collection.mutationPolicy.delete ? "delete" : null,
    ].filter((value): value is string => value !== null);
    if (denied.length > 0) {
      return NextResponse.json({
        error: "CHILD_MUTATION_DENIED",
        message: `The current principal cannot perform one or more "${key}" mutations.`,
        collection: key,
        operations: denied,
      }, { status: 403 });
    }
  }
  return null;
}

async function persistSubmitSnapshot(input: {
  context: Parameters<typeof readDocumentEditServerDraft>[0];
  body: DocumentEditSubmitRequestV1;
  sourceTabId: string;
  clientSeq: number;
  fallback: DocumentEditServerDraft | null;
}): Promise<DocumentEditServerDraft | null> {
  try {
    return await upsertDocumentEditServerDraft({
      scope: input.context,
      kind: "core",
      values: input.body,
      sourceField: "__submit__",
      expectedRevision: input.fallback?.revision ?? 0,
      draftVersion: `submit_${Date.now().toString(36)}`,
      tabId: input.sourceTabId,
      clientSeq: input.clientSeq,
    });
  } catch (error) {
    if (error instanceof DocumentEditDraftConflictError) throw error;
    console.warn("[document-edit/submit] failed to persist submit snapshot", {
      message: error instanceof Error ? error.message : String(error),
    });
    return input.fallback;
  }
}

function readSubmitActionCode(
  body: DocumentEditSubmitRequestV1,
  editRuntime: {
    submitPolicy?: unknown;
    workflowPolicy?: { submitAction?: string };
  },
): string {
  if (body.action?.code) return body.action.code;
  const submitPolicy = isRecord(editRuntime.submitPolicy) ? editRuntime.submitPolicy : {};
  const contractAction = submitPolicy["actionCode"]
    ?? submitPolicy["action"]
    ?? editRuntime.workflowPolicy?.submitAction;
  return typeof contractAction === "string" && contractAction.trim()
    ? contractAction.trim()
    : "submit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSubmitTransportHeaders(request: Request): NextResponse | null {
  if (!request.headers.get(DOCUMENT_EDIT_SUBMIT_HEADERS.ifMatch)?.trim()) {
    return NextResponse.json(
      { error: "PRECONDITION_REQUIRED", message: "If-Match header is required for document submit." },
      { status: 428, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!request.headers.get(DOCUMENT_EDIT_SUBMIT_HEADERS.idempotencyKey)?.trim()) {
    return NextResponse.json(
      { error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required for document submit." },
      { status: 428, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

function submitRequestFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "request";
    (errors[path] ??= []).push(issue.message);
  }
  return errors;
}

export function normalizeSubmitResponse(
  request: DocumentEditSubmitRequestV1,
  upstreamBody: unknown,
): DocumentEditSubmitResponseV1 | null {
  const envelope = isRecord(upstreamBody) ? upstreamBody : {};
  const result = isRecord(envelope["result"]) ? envelope["result"] : envelope;
  const record = isRecord(result["record"]) ? result["record"] : {};
  const recordData = isRecord(record["data"]) ? record["data"] : {};
  const candidate = {
    ok: true,
    intent: request.intent,
    record: {
      id: record["id"],
      data: recordData,
      status: record["status"] ?? result["status"],
    },
    etag: result["etag"],
    fieldMask: result["fieldMask"],
    sectionMask: result["sectionMask"],
    invalidations: result["invalidations"],
    documentVersion: result["documentVersion"],
    ...(isRecord(result["actionResult"])
      ? { actionResult: result["actionResult"] }
      : request.intent === "save_and_transition"
        ? { actionResult: result }
        : {}),
  };
  const parsed = DocumentEditSubmitResponseV1Schema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function documentEditSubmitFailureStatus(
  upstreamStatus: number,
  failure: Record<string, unknown>,
): number {
  const error = typeof failure["error"] === "string" ? failure["error"] : "";
  return error in DOCUMENT_EDIT_SUBMIT_ERROR_STATUS
    ? DOCUMENT_EDIT_SUBMIT_ERROR_STATUS[error as keyof typeof DOCUMENT_EDIT_SUBMIT_ERROR_STATUS]
    : upstreamStatus;
}
