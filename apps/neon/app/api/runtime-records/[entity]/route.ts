import { NextResponse } from "next/server";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeWriteActor, validateRuntimeWrite } from "@/lib/server/meta-entity-write-validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  // Keep lazy pagination aligned with the server-rendered list path. The shared
  // record-list fetcher below still enforces session scope, availability, and
  // field masking; applying a descriptor-only read gate here made page 2 fail
  // after page 1 had already rendered successfully.
  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const list = await getMetaEntityRecordList(entity, normalizeListSearchParams(searchParams), descriptor);
  if (list.state.status === "unavailable") {
    return NextResponse.json(
      { error: "RECORDS_UNAVAILABLE", message: list.state.message ?? "Records are unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      records: list.records,
      state: list.state,
      pagination: list.pagination,
      isFullyLoaded: list.isFullyLoaded,
      reasons: list.reasons,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  if (!descriptor.capabilities.canCreate || descriptor.capabilities.isReadOnly) {
    return NextResponse.json(
      { error: "CREATE_NOT_ALLOWED", message: "This entity is not creatable in the active runtime contract." },
      { status: 403 },
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to create records." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const inputData = isRecord(body) && isRecord(body["data"]) ? body["data"] : {};
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
    mode: "create",
    actor,
    data: inputData,
  });
  if (!validation.ok) {
    if (validation.status !== 400) {
      console.warn("[runtime-records] create blocked", {
        entity: descriptor.entityCode,
        error: validation.error,
        fieldErrorCount: validation.fieldErrors ? Object.keys(validation.fieldErrors).length : 0,
      });
    }
    return NextResponse.json(
      { error: validation.error, message: validation.message, fieldErrors: validation.fieldErrors },
      { status: validation.status },
    );
  }

  const response = await fetch(
    buildRuntimeUrl(`/api/records/${encodeURIComponent(descriptor.entityCode)}`),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: validation.filteredData }),
      cache: "no-store",
    },
  );

  const result = await readJson(response);
  if (!response.ok) {
    return NextResponse.json(
      normalizeUpstreamError(result, response.status, "RECORD_CREATE_FAILED"),
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true, record: result }, { status: 201 });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeListSearchParams(params: Record<string, string>): Record<string, string> {
  const passthroughKeys = new Set(["page", "page_size", "q", "sort", "group", "facets", "picker_tree", "search_scope"]);
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "size") {
      normalized["page_size"] = value;
      continue;
    }
    normalized[key.startsWith("filter.") || passthroughKeys.has(key) ? key : `filter.${key}`] = value;
  }
  return normalized;
}
