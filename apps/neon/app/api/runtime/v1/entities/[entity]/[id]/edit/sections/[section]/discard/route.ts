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
  { params }: { params: Promise<{ entity: string; id: string; section: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to discard this document section draft.",
  });
  if (!loaded.ok) return loaded.response;

  const { section } = await params;
  const sectionKey = decodeURIComponent(section);
  const declared = loaded.context.editRuntime.sections.some((item) => item.key === sectionKey);
  if (!declared) {
    return NextResponse.json(
      {
        error: "SECTION_NOT_DECLARED",
        message: `Section '${sectionKey}' is not declared in the document edit runtime contract.`,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const serverMs = elapsedLifecycleMs(startedAt);
  publishDocumentEditRuntimeEvent(
    buildDocumentEditRuntimeEventScope(loaded.context),
    {
      type: "document_edit_section_draft_discarded",
      payload: {
        sectionKey,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      lifecycle: "section_discard",
      entityCode: loaded.context.entityCode,
      recordId: loaded.context.recordId,
      sectionKey,
      serverDraft: {
        cleared: false,
        mode: "client_draft",
        message: "No server section draft was cleared because server draft persistence is not enabled yet.",
      },
      invalidations: [{ type: "section", key: sectionKey }],
      telemetry: { serverMs },
    },
    {
      headers: documentEditLifecycleHeaders("section-discard", serverMs),
    },
  );
}

export const DELETE = POST;
