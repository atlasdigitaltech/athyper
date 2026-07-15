import { NextResponse } from "next/server";
import { DocumentEditDiscardDraftRequestV1Schema } from "@athyper/api-contracts/document-edit-discard";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
  readDocumentEditRuntimeJson,
} from "@/lib/server/document-edit-runtime-route-context";
import { deleteDocumentEditServerDraft } from "@/lib/server/document-edit-runtime-drafts";
import {
  buildDocumentEditRuntimeEventScope,
  publishDocumentEditRuntimeEvent,
} from "@/lib/server/document-edit-runtime-events";
import { validateDocumentEditWorkspace } from "@/lib/server/document-edit-workspace-validation";
import { documentEditMetricTenant, recordDocumentEditMetric } from "@/lib/server/document-edit-observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to discard this document draft.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;
  const workspace = validateDocumentEditWorkspace({ request, context: loaded.context });
  if (!workspace.ok) return workspace.response;

  const parsed = DocumentEditDiscardDraftRequestV1Schema.safeParse(
    await readDocumentEditRuntimeJson(request),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION",
        message: "The discard request must explicitly specify operation 'discard_draft'.",
        fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [
          issue.path.length > 0 ? issue.path.map(String).join(".") : "request",
          issue.message,
        ])),
      },
      { status: 422, headers: documentEditLifecycleHeaders("discard-draft-validation-failed", elapsedLifecycleMs(startedAt)) },
    );
  }
  const sourceTabId = parsed.data.sourceTabId;
  const cleared = await deleteDocumentEditServerDraft(loaded.context);
  const serverMs = elapsedLifecycleMs(startedAt);
  recordDocumentEditMetric({
    event: "draft_discard",
    entityCode: loaded.context.entityCode,
    tenantId: documentEditMetricTenant(loaded.context),
    transportMode: "workspace_submit",
    outcome: cleared ? "cleared" : "empty",
    statusCode: 200,
    durationMs: serverMs,
  });
  publishDocumentEditRuntimeEvent(
    buildDocumentEditRuntimeEventScope(loaded.context),
    {
      type: "document_edit_client_draft_discarded",
      sourceTabId,
      payload: {
        reason: "discard_draft",
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      operation: "discard_draft",
      draft: {
        cleared,
        authoritative: false,
        mode: "recovery_only",
      },
      invalidations: [{ type: "draft", key: "recovery" }],
    },
    {
      headers: documentEditLifecycleHeaders("discard-draft", serverMs),
    },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "Use POST with operation 'discard_draft'.",
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
