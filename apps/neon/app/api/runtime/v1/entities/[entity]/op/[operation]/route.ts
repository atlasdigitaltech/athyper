import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import {
  loadDocumentEditRuntimeRouteContext,
} from "@/lib/server/document-edit-runtime-route-context";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { mintDocumentEditWorkspaceToken } from "@/lib/server/document-edit-workspace-token";
import {
  resolveDocumentEditPhysicalRecordId,
  resolveDocumentEditPlanHash,
} from "@/lib/server/document-edit-workspace-validation";
import { resolveP2pOperationWorkspaceScope } from "@/lib/server/p2p-operation-workspace";

export const dynamic = "force-dynamic";

/**
 * Canonical P2P conversion facade. It mints source-document capabilities only
 * after loading the source through the caller's server session; the records
 * service remains authoritative for operation, company, and IAM decisions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; operation: string }> },
) {
  const route = await params;
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "INVALID_OPERATION_PAYLOAD", message: "A JSON operation payload is required." }, { status: 400 });
  }

  const scope = resolveP2pOperationWorkspaceScope(route.entity, route.operation, body);
  if (!scope) {
    return NextResponse.json({ error: "INVALID_OPERATION_SOURCE", message: "The operation requires a valid source document." }, { status: 400 });
  }

  const workspaceTokens: string[] = [];
  let runtimeHeaders: Record<string, string> | null = null;
  for (const sourceId of scope.sourceIds) {
    const loaded = await loadDocumentEditRuntimeRouteContext({
      request,
      params: Promise.resolve({ entity: scope.sourceEntityCode, id: sourceId }),
      mode: "read",
      unauthenticatedMessage: "Sign in again to run this operation.",
      validatePermissionStamp: false,
    });
    if (!loaded.ok) return loaded.response;

    const identity = buildDocumentEditCoordinatorIdentity(loaded.context.session, loaded.context.record);
    const planHash = resolveDocumentEditPlanHash(loaded.context);
    if (!identity || !planHash) {
      return NextResponse.json({
        error: "WORKSPACE_TOKEN_UNAVAILABLE",
        message: "The source document workspace cannot be authorized.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const token = mintDocumentEditWorkspaceToken({
      tenantId: identity.tenantId,
      principalId: identity.effectivePrincipal,
      entityCode: scope.sourceEntityCode,
      recordId: resolveDocumentEditPhysicalRecordId(loaded.context.record, sourceId),
      permissionStamp: identity.permissionStamp,
      planHash,
      profile: scope.profile,
    });
    if (!token) {
      return NextResponse.json({
        error: "WORKSPACE_TOKEN_UNAVAILABLE",
        message: "Document workspace signing is not configured.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    workspaceTokens.push(token);
    runtimeHeaders ??= buildRuntimeHeaders(loaded.context.session);
  }

  const upstream = await fetch(
    buildRuntimeUrl(`/runtime/v1/entities/${encodeURIComponent(route.entity)}/op/${encodeURIComponent(route.operation)}`),
    {
      method: "POST",
      headers: {
        ...runtimeHeaders!,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Document-Edit-Workspace": workspaceTokens.join(","),
        ...(copyRequestHeader(request, "Idempotency-Key")),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const responseHeaders = new Headers();
  responseHeaders.set("Cache-Control", "no-store");
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function copyRequestHeader(request: Request, name: string): Record<string, string> {
  const value = request.headers.get(name)?.trim();
  return value ? { [name]: value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
