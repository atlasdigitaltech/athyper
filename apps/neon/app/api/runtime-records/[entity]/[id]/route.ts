import { NextResponse } from "next/server";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";
import {
  authorizeRuntimeOperation,
  buildRuntimeWriteActor,
  checkVersionConflict,
  maskFieldSecurityResponse,
  normalizeExpectedVersion,
  validateRuntimeWrite,
} from "@/lib/server/meta-entity-write-validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  if (!descriptor.capabilities.canRead) {
    return NextResponse.json(
      { error: "READ_NOT_ALLOWED", message: "This entity is not readable in the active runtime contract." },
      { status: 403 },
    );
  }

  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return NextResponse.json(
      { error: "RECORD_NOT_FOUND", message: detail.state.message ?? "Record was not found in the active organization scope." },
      { status: 404 },
    );
  }

  const record = maskFieldSecurityResponse(detail.record, descriptor);
  const processState = await getMetaEntityProcessRuntimeState(entity, recordId, descriptor, detail.record);
  const responseHeaders: Record<string, string> = { "Cache-Control": "no-store" };
  if (descriptor.concurrency && descriptor.concurrency.strategy !== "none") {
    const versionColumn = descriptor.concurrency.versionColumn ?? "row_version";
    const version = String(record[versionColumn] ?? detail.record[versionColumn] ?? "");
    if (version) responseHeaders["ETag"] = version;
  }

  return NextResponse.json(
    { ok: true, record, processState },
    { headers: responseHeaders },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  if (!descriptor.capabilities.canEdit || descriptor.capabilities.isReadOnly) {
    return NextResponse.json(
      { error: "EDIT_NOT_ALLOWED", message: "This entity is not editable in the active runtime contract." },
      { status: 403 },
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to save changes." },
      { status: 401 },
    );
  }

  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return NextResponse.json(
      { error: "RECORD_NOT_FOUND", message: detail.state.message ?? "Record was not found in the active organization scope." },
      { status: 404 },
    );
  }
  const upstreamRecordId = readResolvedRecordId(detail.record, recordId);

  const body = await readJson(request);
  const inputData = isRecord(body) && isRecord(body["data"]) ? body["data"] : {};
  const expectedVersion =
    normalizeExpectedVersion(request.headers.get("If-Match"))
    ?? normalizeExpectedVersion(isRecord(body) ? body["expectedVersion"] ?? body["version"] : undefined);
  const versionCheck = checkVersionConflict(descriptor, detail.record, expectedVersion);
  if (versionCheck.conflict) {
    return NextResponse.json(
      {
        error: "VERSION_CONFLICT",
        message: versionCheck.message,
        conflict: {
          versionField: versionCheck.versionField,
          expected: versionCheck.expected,
          actual: versionCheck.actual,
          message: versionCheck.message,
        },
      },
      { status: 409 },
    );
  }

  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const actor = buildRuntimeWriteActor(descriptor, {
    userId: session.userId,
    tenantId: membership?.tenantId,
    plane: session.planeKey,
    organizationScope: membership
      ? {
          activeOrg: session.activeOrg,
          ...membership,
        }
      : undefined,
  });
  const validation = validateRuntimeWrite(descriptor, {
    mode: "edit",
    actor,
    data: inputData,
    currentRecord: detail.record,
  });
  if (!validation.ok) {
    if (validation.status !== 400) {
      console.warn("[runtime-records] patch blocked", {
        entity: descriptor.entityCode,
        recordId: upstreamRecordId,
        error: validation.error,
        fieldErrorCount: validation.fieldErrors ? Object.keys(validation.fieldErrors).length : 0,
      });
    }
    return NextResponse.json(
      { error: validation.error, message: validation.message, fieldErrors: validation.fieldErrors },
      { status: validation.status },
    );
  }

  const upstreamHeaders: Record<string, string> = {
    ...buildRuntimeHeaders(session),
    "Content-Type": "application/json",
  };
  if (expectedVersion) upstreamHeaders["If-Match"] = expectedVersion;

  const response = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(descriptor.entityCode)}/${encodeURIComponent(upstreamRecordId)}`),
    {
      method: "PATCH",
      headers: upstreamHeaders,
      body: JSON.stringify({ data: validation.filteredData }),
      cache: "no-store",
    },
  );

  const result = await readJson(response);
  if (!response.ok) {
    return NextResponse.json(
      normalizeUpstreamError(result, response.status, "RECORD_SAVE_FAILED"),
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true, record: result });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  if (!descriptor.capabilities.canDelete || descriptor.capabilities.isReadOnly) {
    return NextResponse.json(
      { error: "DELETE_NOT_ALLOWED", message: "This entity is not deletable in the active runtime contract." },
      { status: 403 },
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to delete records." },
      { status: 401 },
    );
  }

  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const actor = buildRuntimeWriteActor(descriptor, {
    userId: session.userId,
    tenantId: membership?.tenantId,
    plane: session.planeKey,
    organizationScope: membership
      ? {
          activeOrg: session.activeOrg,
          ...membership,
        }
      : undefined,
  });
  const authorization = authorizeRuntimeOperation(descriptor, "delete", actor);
  if (authorization) {
    return NextResponse.json(
      { error: authorization.error, message: authorization.message },
      { status: authorization.status },
    );
  }

  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return NextResponse.json(
      { error: "RECORD_NOT_FOUND", message: detail.state.message ?? "Record was not found in the active organization scope." },
      { status: 404 },
    );
  }
  const upstreamRecordId = readResolvedRecordId(detail.record, recordId);

  const response = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(descriptor.entityCode)}/${encodeURIComponent(upstreamRecordId)}`),
    {
      method: "DELETE",
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    },
  );

  const result = await readJson(response);
  if (!response.ok) {
    return NextResponse.json(
      normalizeUpstreamError(result, response.status, "RECORD_DELETE_FAILED"),
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true });
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}

function normalizeUpstreamError(
  value: unknown,
  status: number,
  fallbackCode: string,
): { error: string; message: string; fieldErrors?: Record<string, string[]> } {
  const error = isRecord(value) && typeof value["error"] === "string" ? value["error"] : fallbackCode;
  const message = isRecord(value) && typeof value["message"] === "string"
    ? value["message"]
    : `Records service returned ${status}.`;
  const fieldErrors =
    isRecord(value) && isRecord(value["fieldErrors"])
      ? (value["fieldErrors"] as Record<string, string[]>)
      : undefined;
  return fieldErrors ? { error, message, fieldErrors } : { error, message };
}

function readResolvedRecordId(record: Record<string, unknown>, fallback: string): string {
  const candidate = record["id"];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
