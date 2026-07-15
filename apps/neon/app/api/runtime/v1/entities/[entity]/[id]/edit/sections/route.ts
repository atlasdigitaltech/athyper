import { NextResponse } from "next/server";
import { buildDocumentEditSectionBatch } from "@/lib/server/document-edit-runtime-data";
import {
  loadDocumentEditRuntimeRouteContext,
  readLifecycleRecord,
} from "@/lib/server/document-edit-runtime-route-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "read",
    unauthenticatedMessage: "Sign in again to load document sections.",
  });
  if (!loaded.ok) return loaded.response;

  const body = await request.json().catch(() => null);
  const requestedKeys = readSectionKeys(body);
  const batchContext = readLifecycleRecord(body["context"]);
  const batch = await buildDocumentEditSectionBatch({
    session: loaded.context.session,
    descriptor: loaded.context.descriptor,
    editRuntime: loaded.context.editRuntime,
    recordId: loaded.context.recordId,
    record: loaded.context.record,
    requestedKeys,
    context: batchContext,
    signal: request.signal,
  });

  const serverMs = Math.max(0, Date.now() - startedAt);
  return NextResponse.json(
    batch,
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Edit-Cache": summarizeBatchCacheHit(batch),
        "X-Document-Edit-Server-Ms": String(serverMs),
      },
    },
  );
}

function summarizeBatchCacheHit(batch: { sections: Array<{ timing: { cacheHit: string } }> }): string {
  const hits = new Set(batch.sections.map((section) => section.timing.cacheHit));
  if (hits.size === 0) return "none";
  if (hits.size === 1) return [...hits][0] ?? "none";
  return [...hits].sort().join(",");
}

function readSectionKeys(value: unknown): string[] {
  const record = readLifecycleRecord(value);
  if (!Array.isArray(record["keys"])) return [];
  return record["keys"].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
