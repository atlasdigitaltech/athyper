import { NextResponse } from "next/server";
import { maskFieldSecurityResponse } from "@/lib/server/meta-entity-write-validation";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { buildDocumentEditCorePayload } from "@/lib/server/document-edit-runtime-data";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "read",
    unauthenticatedMessage: "Sign in again to load this document.",
  });
  if (!loaded.ok) return loaded.response;

  const {
    descriptor,
    editRuntime,
    record,
    entityCode,
    recordId,
  } = loaded.context;

  const [securedRecord, processState] = await Promise.all([
    Promise.resolve(maskFieldSecurityResponse(record, descriptor)),
    getMetaEntityProcessRuntimeState(entityCode, recordId, descriptor, record),
  ]);

  const serverMs = Math.max(0, Date.now() - startedAt);
  return NextResponse.json(
    buildDocumentEditCorePayload({
      entityCode,
      recordId,
      descriptor,
      editRuntime,
      record: securedRecord,
      processState: processState ?? undefined,
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Edit-Cache": "none",
        "X-Document-Edit-Server-Ms": String(serverMs),
      },
    },
  );
}
