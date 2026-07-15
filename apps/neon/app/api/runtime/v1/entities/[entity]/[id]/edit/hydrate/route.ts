import { NextResponse } from "next/server";
import { buildDocumentEditSectionBatch } from "@/lib/server/document-edit-runtime-data";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { validateDocumentEditWorkspace } from "@/lib/server/document-edit-workspace-validation";

export const dynamic = "force-dynamic";

/** Hydrates deferred workspace nodes only after validating the OPEN capability. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "read",
    unauthenticatedMessage: "Sign in again to load document sections.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;

  const body = await readJson(request);
  const keys = readStringArray(body, "keys");
  if (keys.length === 0) {
    return NextResponse.json({ error: "INVALID_HYDRATE_REQUEST", message: "At least one node key is required." }, { status: 400 });
  }
  const workspace = validateDocumentEditWorkspace({
    request,
    context: loaded.context,
    // Temporary compatibility for clients that sent the capability in JSON.
    // Header input always wins when both are present.
    compatibilityBodyToken: readString(body, "workspaceId"),
  });
  if (!workspace.ok) return workspace.response;

  const knownDeferred = new Set(loaded.context.editRuntime.sections
    .filter((section) => section.accessible && section.loadPolicy !== "core" && section.loadPolicy !== "eager_parallel")
    .map((section) => section.key));
  const requestedKeys = keys.filter((key) => knownDeferred.has(key));
  if (requestedKeys.length !== keys.length) {
    return NextResponse.json({ error: "INVALID_HYDRATE_NODE", message: "One or more requested nodes are not deferred workspace nodes." }, { status: 400 });
  }

  const sections = await buildDocumentEditSectionBatch({
    session: loaded.context.session,
    descriptor: loaded.context.descriptor,
    editRuntime: loaded.context.editRuntime,
    recordId: loaded.context.recordId,
    record: loaded.context.record,
    requestedKeys,
    context: isRecord(body) ? body["context"] : undefined,
    signal: request.signal,
  });
  return NextResponse.json({ sections }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Document-Edit-Lifecycle": "hydrate",
      "X-Document-Edit-Workspace-Source": workspace.tokenSource,
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json() as unknown; } catch { return null; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readString(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === "string" && value[key].trim() ? value[key].trim() : null;
}
function readStringArray(value: unknown, key: string): string[] {
  return isRecord(value) && Array.isArray(value[key])
    ? value[key].filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}
