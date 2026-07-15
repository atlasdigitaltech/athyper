import { NextResponse } from "next/server";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
} from "@/lib/server/document-edit-runtime-route-context";
import {
  buildDocumentEditRuntimeEventScope,
  publishDocumentEditRuntimeEvent,
} from "@/lib/server/document-edit-runtime-events";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string; collection: string; rowId: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to discard this document row draft.",
  });
  if (!loaded.ok) return loaded.response;

  const { collection, rowId } = await params;
  const collectionKey = decodeURIComponent(collection);
  const decodedRowId = decodeURIComponent(rowId);
  const declared = loaded.context.editRuntime.childCollections.some((item) => item.key === collectionKey);
  if (!declared) {
    return NextResponse.json(
      {
        error: "COLLECTION_NOT_DECLARED",
        message: `Child collection '${collectionKey}' is not declared in the document edit runtime contract.`,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const serverMs = elapsedLifecycleMs(startedAt);
  publishDocumentEditRuntimeEvent(
    buildDocumentEditRuntimeEventScope(loaded.context),
    {
      type: "document_edit_row_draft_discarded",
      payload: {
        collectionKey,
        rowId: decodedRowId,
        sectionKey: collectionKey,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      lifecycle: "row_discard",
      entityCode: loaded.context.entityCode,
      recordId: loaded.context.recordId,
      collectionKey,
      rowId: decodedRowId,
      serverDraft: {
        cleared: false,
        mode: "client_draft",
        message: "No server row draft was cleared because server draft persistence is not enabled yet.",
      },
      invalidations: [{ type: "section", key: collectionKey }],
      telemetry: { serverMs },
    },
    {
      headers: documentEditLifecycleHeaders("row-discard", serverMs),
    },
  );
}

export const DELETE = POST;
