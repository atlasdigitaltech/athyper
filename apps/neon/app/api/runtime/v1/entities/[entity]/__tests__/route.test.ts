// BFF route tests — /api/runtime/v1/entities/[entity]  (list + create)
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
  getMetaEntityRuntimeDescriptorCacheState: vi.fn(() => "cold"),
}));
vi.mock("@/lib/server/meta-entity-records", () => ({
  getMetaEntityRecordList: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-write-validation", () => ({
  buildRuntimeWriteActor: vi.fn(() => ({ id: "user-1" })),
  validateRuntimeWrite: vi.fn(() => ({ ok: true, filteredData: { name: "x" } })),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET, POST } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { validateRuntimeWrite } from "@/lib/server/meta-entity-write-validation";

function descriptor(overrides: Partial<{ canRead: boolean; canCreate: boolean; isReadOnly: boolean; createMode: string; renderer: string }> = {}) {
  return {
    entityCode: "purchase_invoice",
    createMode: overrides.createMode ?? "FORM_ONLY",
    renderer: overrides.renderer ?? "master",
    capabilities: { canRead: true, canCreate: true, isReadOnly: false, canEdit: true, canDelete: true, ...overrides },
  };
}

const SESSION = {
  userId: "user-1",
  activeOrg: "org-1",
  organizations: { "org-1": { tenantId: "tenant-1" } },
  planeKey: "neon",
};

function params(entity = "purchase_invoice") {
  return { params: Promise.resolve({ entity }) };
}

describe("GET /api/runtime/v1/entities/[entity]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("returns 404 when the descriptor is not registered", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost/api/runtime/v1/entities/foo"), params("foo"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("ENTITY_NOT_FOUND");
  });

  it("returns 401 before descriptor lookup when the session is missing", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost/api/runtime/v1/entities/purchase_invoice"), params());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 503 when records are unavailable", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor() as never);
    vi.mocked(getMetaEntityRecordList).mockResolvedValueOnce({
      state: { status: "unavailable", message: "downstream" },
      records: [],
      pagination: null,
      isFullyLoaded: false,
      reasons: {},
    } as never);
    const res = await GET(new Request("http://localhost/api/runtime/v1/entities/purchase_invoice"), params());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("RECORDS_UNAVAILABLE");
  });

  it("returns the list envelope on success", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor() as never);
    vi.mocked(getMetaEntityRecordList).mockResolvedValueOnce({
      state: { status: "available" },
      records: [{ id: "rec-1" }, { id: "rec-2" }],
      pagination: { page: 1, total: 2 },
      isFullyLoaded: true,
      reasons: { filter: "ok" },
    } as never);
    const res = await GET(new Request("http://localhost/api/runtime/v1/entities/purchase_invoice"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.records).toHaveLength(2);
    expect(body.pagination).toMatchObject({ total: 2 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Athyper-Cache")).toBe("bypass");
    expect(res.headers.get("Server-Timing")).toContain("descriptor;dur=");
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
  });

  it("preserves offset page and query-mode controls on the record-list fetch", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor() as never);
    vi.mocked(getMetaEntityRecordList).mockResolvedValueOnce({
      state: { status: "available" },
      records: [],
      pagination: null,
      isFullyLoaded: true,
    } as never);
    await GET(new Request("http://localhost/api/runtime/v1/entities/purchase_invoice?status=draft&page=2&query_v1=0"), params());
    expect(getMetaEntityRecordList).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(getMetaEntityRecordList).mock.calls[0]!;
    expect(callArgs[1]).toMatchObject({ "filter.status": "draft", page: "2", query_v1: "0" });
  });

  it("does not add a duplicate descriptor read gate to lazy page requests", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(
      descriptor({ canRead: false }) as never,
    );
    vi.mocked(getMetaEntityRecordList).mockResolvedValueOnce({
      state: { status: "available" },
      records: [{ id: "rec-21" }],
      pagination: { page: 2, total: 21, totalPages: 2 },
      isFullyLoaded: true,
    } as never);

    const res = await GET(
      new Request("http://localhost/api/runtime/v1/entities/purchase_invoice?page=2&page_size=20"),
      params(),
    );

    expect(res.status).toBe(200);
    expect(getMetaEntityRecordList).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getMetaEntityRecordList).mock.calls[0]?.[1]).toMatchObject({
      page: "2",
      page_size: "20",
    });
  });
});

describe("POST /api/runtime/v1/entities/[entity]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor() as never);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "rec-new" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 404 when the descriptor is not registered", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(null as never);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      params(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when descriptor cannot create", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor({ canCreate: false }) as never);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      params(),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CREATE_NOT_ALLOWED");
  });

  it("rejects ledger POST with the canonical read-only contract", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(
      descriptor({ renderer: "ledger", canCreate: true, isReadOnly: false }) as never,
    );
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      params("journal_entry"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "LEDGER_READ_ONLY" });
    expect(res.headers.get("X-Entity-Mutation-Policy")).toBe("ledger-read-only");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }),
      params(),
    );
    expect(res.status).toBe(401);
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("rejects generic document POST at the BFF boundary", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce({
      ...descriptor(),
      renderer: "document",
    } as never);
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" },
    }), params());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates validation failures with field errors", async () => {
    vi.mocked(validateRuntimeWrite).mockReturnValueOnce({
      ok: false,
      status: 400,
      error: "VALIDATION_FAILED",
      message: "bad",
      fieldErrors: { name: ["required"] },
    } as never);
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" } }),
      params(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_FAILED");
  });

  it("hits the canonical runtime URL with the filtered create payload", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ data: { name: "y", drop_me: "x" } }),
        headers: { "Content-Type": "application/json" },
      }),
      params(),
    );
    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_invoice");
    expect((init as RequestInit).method).toBe("POST");
    const sentBody = JSON.parse((init as RequestInit & { body: string }).body);
    expect(sentBody).toEqual({ data: { name: "x" } });
  });

  it("keeps FORM_ONLY on create POST and forwards a stable idempotency key", async () => {
    await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ data: { name: "y" } }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": "stable-create-1" },
    }), params());
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("stable-create-1");
  });

  it.each(["EARLY_DRAFT", "SOURCE_DOCUMENT_CREATE"])("rejects generic POST for %s", async (createMode) => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor({ createMode }) as never);
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" },
    }), params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("CREATE_MODE_MISMATCH");
    expect(body.message).toBe(`Use the ${createMode} creation flow for this entity.`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
