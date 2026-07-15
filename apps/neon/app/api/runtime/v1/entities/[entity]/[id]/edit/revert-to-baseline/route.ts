import { NextResponse } from "next/server";
import { DocumentEditRevertToBaselineRequestV1Schema } from "@athyper/api-contracts/document-edit-discard";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
  readDocumentEditRuntimeJson,
} from "@/lib/server/document-edit-runtime-route-context";
import {
  resolveDocumentEditPhysicalRecordId,
  validateDocumentEditWorkspace,
} from "@/lib/server/document-edit-workspace-validation";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to revert this document to its baseline.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;
  const workspace = validateDocumentEditWorkspace({ request, context: loaded.context });
  if (!workspace.ok) return workspace.response;

  if (loaded.context.entityCode !== "purchase_invoice") {
    return NextResponse.json(
      { error: "REVERT_TO_BASELINE_NOT_SUPPORTED", message: "This entity has no baseline-reversal operation." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = DocumentEditRevertToBaselineRequestV1Schema.safeParse(
    await readDocumentEditRuntimeJson(request),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION", message: "The revert_to_baseline request is invalid." },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  const physicalRecordId = resolveDocumentEditPhysicalRecordId(
    loaded.context.record,
    loaded.context.recordId,
  );
  const upstream = await fetch(
    buildRuntimeUrl(`/api/finance/ap/invoices/${encodeURIComponent(physicalRecordId)}/revert-to-baseline`),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(loaded.context.session),
        "Content-Type": "application/json",
        "X-Document-Edit-Workspace": request.headers.get("X-Document-Edit-Workspace")!,
      },
      cache: "no-store",
      signal: request.signal,
      body: JSON.stringify(parsed.data),
    },
  );
  const body = await upstream.json().catch(() => null) as unknown;
  return NextResponse.json(
    body && typeof body === "object" ? body : { error: "INVALID_REVERT_RESPONSE" },
    {
      status: upstream.status,
      headers: documentEditLifecycleHeaders(
        upstream.ok ? "revert-to-baseline" : "revert-to-baseline-failed",
        elapsedLifecycleMs(startedAt),
      ),
    },
  );
}

