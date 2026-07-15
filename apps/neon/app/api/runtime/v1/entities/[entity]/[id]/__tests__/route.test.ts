// BFF route tests — /api/runtime/v1/entities/[entity]/[id]
//
// Covers the gates and upstream contracts of the entity-detail handler:
//   • descriptor presence + capabilities (read/edit/delete) → 404 / 403
//   • session presence on mutating verbs → 401
//   • record detail availability → 404
//   • write validation outcome propagation
//   • optimistic concurrency: If-Match header → upstream If-Match
//   • upstream URL is the canonical /api/runtime/v1/entities/* path (post-rename)
//   • ETag emission when descriptor concurrency is enabled
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-records", () => ({
  getMetaEntityRecordDetail: vi.fn(),
  normalizeRouteRecordId: (id: string) => id,
}));
vi.mock("@/lib/server/meta-entity-process-state", () => ({
  getMetaEntityProcessRuntimeState: vi.fn(() => Promise.resolve({ stage: "draft" })),
}));
vi.mock("@/lib/server/meta-entity-write-validation", () => ({
  authorizeRuntimeOperation: vi.fn(() => null),
  buildRuntimeWriteActor: vi.fn(() => ({ id: "user-1" })),
  checkVersionConflict: vi.fn(() => ({ conflict: false })),
  maskFieldSecurityResponse: vi.fn((record) => record),
  normalizeExpectedVersion: vi.fn((v) => (v ? String(v) : null)),
  validateRuntimeWrite: vi.fn(() => ({ ok: true, filteredData: { name: "x" } })),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET, PATCH, DELETE } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { authorizeRuntimeOperation, checkVersionConflict, validateRuntimeWrite } from "@/lib/server/meta-entity-write-validation";

type DescriptorMock = {
  entityCode: string;
  renderer?: "simple" | "master" | "document" | "ledger";
  capabilities: { canRead: boolean; canEdit: boolean; canDelete: boolean; isReadOnly: boolean; canCreate: boolean };
  concurrency?: { strategy: string; versionColumn?: string } | null;
};

function descriptor(overrides: Partial<DescriptorMock["capabilities"]> = {}, extra: Partial<DescriptorMock> = {}): DescriptorMock {
  return {
    entityCode: "purchase_invoice",
    capabilities: {
      canRead: true,
      canEdit: true,
      canDelete: true,
      isReadOnly: false,
      canCreate: true,
      ...overrides,
    },
    ...extra,
  };
}

const SESSION = {
  userId: "user-1",
  activeOrg: "org-1",
  organizations: { "org-1": { tenantId: "tenant-1" } },
  planeKey: "neon",
};

function params(entity = "purchase_invoice", id = "rec-1") {
  return { params: Promise.resolve({ entity, id }) };
}

describe("GET /api/runtime/v1/entities/[entity]/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("returns 404 when the descriptor is not registered", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("ENTITY_NOT_FOUND");
  });

  it("returns 401 before descriptor lookup when the session is missing", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 403 when the descriptor disallows read", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor({ canRead: false }) as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("READ_NOT_ALLOWED");
  });

  it("returns 404 when the record is not visible", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor() as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({ state: { status: "unavailable", message: "scoped out" }, record: null } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("RECORD_NOT_FOUND");
  });

  it("emits an ETag header when descriptor concurrency is enabled", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(
      descriptor({}, { concurrency: { strategy: "version", versionColumn: "row_version" } }) as never,
    );
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "available" },
      record: { id: "rec-1", row_version: "42" },
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe("42");
  });
});

describe("PATCH /api/runtime/v1/entities/[entity]/[id]", () => {
  const baseDescriptor = descriptor({}, { concurrency: { strategy: "version", versionColumn: "row_version" } });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(baseDescriptor as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "available" },
      record: { id: "rec-1", row_version: "1" },
    } as never);

    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "rec-1", row_version: "2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValue(null as never);
    const req = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" } });
    const res = await PATCH(req, params());
    expect(res.status).toBe(401);
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 403 when descriptor disallows edit", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor({ canEdit: false }) as never);
    const req = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" } });
    const res = await PATCH(req, params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("EDIT_NOT_ALLOWED");
  });

  it("rejects ledger PATCH before validation or upstream transport", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(
      descriptor({}, { renderer: "ledger" }) as never,
    );
    const req = new Request("http://localhost", { method: "PATCH", body: "{}", headers: { "Content-Type": "application/json" } });
    const res = await PATCH(req, params("journal_entry"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "LEDGER_READ_ONLY" });
    expect(validateRuntimeWrite).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects document PATCH before loading the record or calling the generic upstream transport", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(
      descriptor({}, { renderer: "document" }) as never,
    );
    const req = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" } });
    const res = await PATCH(req, params());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(res.headers.get("X-Document-Edit-Security")).toBe("workspace-required");
    expect(getMetaEntityRecordDetail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 409 on optimistic-concurrency conflict", async () => {
    vi.mocked(checkVersionConflict).mockReturnValueOnce({ conflict: true, versionField: "row_version", expected: "1", actual: "2", message: "stale" } as never);
    const req = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json", "If-Match": "1" } });
    const res = await PATCH(req, params());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("VERSION_CONFLICT");
    expect(body.conflict).toMatchObject({ expected: "1", actual: "2" });
  });

  it("forwards If-Match to upstream and hits the canonical runtime URL", async () => {
    const req = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ data: { name: "y" } }),
      headers: { "Content-Type": "application/json", "If-Match": "1" },
    });
    const res = await PATCH(req, params());
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_invoice/rec-1");
    expect((init as RequestInit).method).toBe("PATCH");
    expect((init as RequestInit).headers).toMatchObject({ "If-Match": "1", "Content-Type": "application/json" });
  });

  it("propagates validation failures with field errors", async () => {
    vi.mocked(validateRuntimeWrite).mockReturnValueOnce({
      ok: false,
      status: 400,
      error: "VALIDATION_FAILED",
      message: "bad",
      fieldErrors: { name: ["required"] },
    } as never);
    const req = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ data: {} }), headers: { "Content-Type": "application/json" } });
    const res = await PATCH(req, params());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.fieldErrors).toEqual({ name: ["required"] });
  });
});

describe("DELETE /api/runtime/v1/entities/[entity]/[id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor() as never);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "available" },
      record: { id: "rec-1", row_version: 1 },
    } as never);

    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 before descriptor lookup when the session is missing", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await DELETE(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 403 when descriptor disallows delete", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor({ canDelete: false }) as never);
    const res = await DELETE(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("DELETE_NOT_ALLOWED");
  });

  it("rejects ledger DELETE before authorization or upstream transport", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(
      descriptor({}, { renderer: "ledger" }) as never,
    );
    const res = await DELETE(new Request("http://localhost"), params("journal_entry"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "LEDGER_READ_ONLY" });
    expect(authorizeRuntimeOperation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects document DELETE before authorization or generic upstream transport", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(
      descriptor({}, { renderer: "document" }) as never,
    );
    const res = await DELETE(new Request("http://localhost"), params());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "DOCUMENT_WORKSPACE_REQUIRED" });
    expect(authorizeRuntimeOperation).not.toHaveBeenCalled();
    expect(getMetaEntityRecordDetail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates an authorization denial", async () => {
    vi.mocked(authorizeRuntimeOperation).mockReturnValueOnce({ error: "POLICY_DENIED", message: "no", status: 403 } as never);
    const res = await DELETE(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("POLICY_DENIED");
  });

  it("calls upstream DELETE on the canonical runtime URL", async () => {
    const res = await DELETE(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://runtime.test/api/runtime/v1/entities/purchase_invoice/rec-1");
    expect((init as RequestInit).method).toBe("DELETE");
    expect(new Headers((init as RequestInit).headers).get("If-Match")).toBe("1");
    expect(new Headers((init as RequestInit).headers).get("Idempotency-Key"))
      .toBe("delete:purchase_invoice:rec-1:1");
  });
});
