// GET|POST /api/runtime/v1/entities/[entity] — list + create records for a runtime-registered entity.
import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { rejectPublicLedgerMutation } from "@/lib/server/meta-entity-mutation-gates";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeWriteActor, validateRuntimeWrite } from "@/lib/server/meta-entity-write-validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load records." },
      { status: 401 },
    );
  }

  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  // Descriptor-only read gate is deliberately skipped here: the shared list
  // fetcher already enforces session scope, availability, and field masking.
  // A duplicate gate broke lazy pagination (page 2 failed after page 1 rendered).
  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const list = await getMetaEntityRecordList(entityCode, normalizeListSearchParams(searchParams), descriptor);
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
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to create records." },
      { status: 401 },
    );
  }

  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  const ledgerRejection = rejectPublicLedgerMutation(descriptor.renderer);
  if (ledgerRejection) return ledgerRejection;

  if (!descriptor.capabilities.canCreate || descriptor.capabilities.isReadOnly) {
    return NextResponse.json(
      { error: "CREATE_NOT_ALLOWED", message: "This entity is not creatable in the active runtime contract." },
      { status: 403 },
    );
  }
  if (descriptor.renderer === "document") {
    return NextResponse.json(
      {
        error: "DOCUMENT_WORKSPACE_REQUIRED",
        message: "Document creation must use its declared draft or source-document workflow.",
      },
      { status: 409 },
    );
  }
  if (descriptor.createMode === "EARLY_DRAFT" || descriptor.createMode === "SOURCE_DOCUMENT_CREATE") {
    return NextResponse.json(
      { error: "CREATE_MODE_MISMATCH", message: `Use the ${descriptor.createMode} creation flow for this entity.` },
      { status: 409 },
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
      console.warn("[runtime/v1/entities] create blocked", {
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
    buildRuntimeUrl(runtimeServerPath.entityCreate(descriptor.entityCode)),
    {
      method: "POST",
      headers: {
        ...buildRuntimeHeaders(session),
        "Content-Type": "application/json",
        ...(request.headers.get("Idempotency-Key")
          ? { "Idempotency-Key": request.headers.get("Idempotency-Key") as string }
          : {}),
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
  // Map legacy paging aliases to the canonical page_size so older picker
  // callers (and any third-party tooling) don't accidentally rewrite as
  // `filter.size` / `filter.limit` — a bogus column filter that breaks
  // SQL on entities without those columns.
  const pagingAliases = new Set(["size", "limit"]);
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (pagingAliases.has(key)) {
      normalized["page_size"] = value;
      continue;
    }
    normalized[key.startsWith("filter.") || passthroughKeys.has(key) ? key : `filter.${key}`] = value;
  }
  return normalized;
}
