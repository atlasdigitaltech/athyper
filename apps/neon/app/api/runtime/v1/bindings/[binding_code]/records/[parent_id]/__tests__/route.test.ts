// BFF route tests — /api/runtime/v1/bindings/[binding_code]/records/[parent_id]
// Exercises the 5-gate authz chain and the binding-filter precedence rules.
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
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";

const SESSION = { userId: "user-1" };

const PARENT_DESCRIPTOR = { entityCode: "purchase_invoice", capabilities: { canRead: true } };
const CHILD_DESCRIPTOR = { entityCode: "purchase_invoice_line", capabilities: { canRead: true } };

const FK_BINDING_ROW = {
  binding_code: "pi_lines",
  parent_entity_code: "purchase_invoice",
  child_entity_code: "purchase_invoice_line",
  binding_kind: "fk",
  fk_field: "purchase_invoice_id",
  status: "active",
};

function params(binding = "pi_lines", parent = "inv-1") {
  return { params: Promise.resolve({ binding_code: binding, parent_id: parent }) };
}

describe("GET /api/runtime/v1/bindings/[binding_code]/records/[parent_id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((entityCode: string) => {
      if (entityCode === "purchase_invoice") return Promise.resolve(PARENT_DESCRIPTOR as never);
      if (entityCode === "purchase_invoice_line") return Promise.resolve(CHILD_DESCRIPTOR as never);
      return Promise.resolve(null as never);
    });
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "available" },
      record: { id: "inv-1" },
    } as never);
  });

  // Gate 1: session
  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Gate 2: binding active
  it("returns 404 BINDING_NOT_FOUND when the binding row is missing", async () => {
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "BINDING_NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(new Request("http://localhost"), params("nope", "inv-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("BINDING_NOT_FOUND");
  });

  // Gate 3: parent entity registered
  it("returns 404 PARENT_ENTITY_NOT_FOUND when parent descriptor is missing", async () => {
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(FK_BINDING_ROW), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation(() => Promise.resolve(null as never));
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("PARENT_ENTITY_NOT_FOUND");
  });

  // Gate 4: parent record accessible
  it("returns 404 PARENT_NOT_ACCESSIBLE when the parent record is out of scope", async () => {
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(FK_BINDING_ROW), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValueOnce({
      state: { status: "unavailable", message: "out of scope" },
      record: null,
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("PARENT_NOT_ACCESSIBLE");
  });

  // Gate 5: child entity readable
  it("returns 403 CHILD_READ_DENIED when the child descriptor disallows read", async () => {
    fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(FK_BINDING_ROW), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((entityCode: string) => {
      if (entityCode === "purchase_invoice") return Promise.resolve(PARENT_DESCRIPTOR as never);
      if (entityCode === "purchase_invoice_line") {
        return Promise.resolve({ entityCode: "purchase_invoice_line", capabilities: { canRead: false } } as never);
      }
      return Promise.resolve(null as never);
    });
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CHILD_READ_DENIED");
  });

  // Happy path: confirms FK filter is applied + records canonical URL is hit
  it("applies the FK filter and fetches child records via the canonical runtime URL", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(FK_BINDING_ROW), { status: 200, headers: { "Content-Type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "line-1" }], pagination: { total: 1 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://localhost"), params("pi_lines", "inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toEqual([{ id: "line-1" }]);

    const [recordsUrl] = fetchMock.mock.calls[1]!;
    const u = new URL(recordsUrl as string);
    expect(u.pathname).toBe("/api/runtime/v1/entities/purchase_invoice_line");
    expect(u.searchParams.get("filter.purchase_invoice_id")).toBe("inv-1");
  });
});
