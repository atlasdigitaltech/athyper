// BFF route tests — GET /api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]
// 4-gate authz chain: session, parent descriptor, relation lookup, parent record access (+ child capability gate).
// Critical: confirms the upstream URL is canonical /api/runtime/v1/entities/<target>, NOT legacy /api/records/* —
// same class of bug we caught in the bindings handler.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-records", () => ({
  getMetaEntityRecordDetail: vi.fn(),
  hydrateMetaEntityRecordRows: vi.fn(async (records: unknown[]) => records),
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

const FK_RELATION = {
  name: "lines",
  runtimeRole: "lines",
  key: "lines",
  targetEntity: "purchase_invoice_line",
  resolutionKind: "fk" as const,
  fkField: "purchase_invoice_id",
  recordFilter: {},
};

const SCHEDULE_RELATION = {
  name: "schedules",
  runtimeRole: "schedules",
  key: "schedules",
  targetEntity: "schedule_line",
  resolutionKind: "polymorphic" as const,
  sourceTypeField: "source_doc_type",
  sourceTypeValue: "commitment_line",
  sourceIdField: "source_doc_id",
  sourceLineField: "source_line_id",
  recordFilter: { is_current_version: true },
};

const PARENT_DESCRIPTOR = {
  entityCode: "purchase_invoice",
  capabilities: { canRead: true },
  relations: [FK_RELATION],
};

const CHILD_DESCRIPTOR = {
  entityCode: "purchase_invoice_line",
  capabilities: { canRead: true },
  fields: [],
};

const PO_DESCRIPTOR = {
  entityCode: "purchase_order",
  capabilities: { canRead: true },
  relations: [SCHEDULE_RELATION],
};

const SCHEDULE_DESCRIPTOR = {
  entityCode: "schedule_line",
  capabilities: { canRead: true },
  fields: [
    { name: "source_doc_type", isComputed: false },
    { name: "source_doc_id", isComputed: false },
    { name: "is_current_version", isComputed: true },
  ],
};

function params(entity = "purchase_invoice", relation = "lines", parent = "inv-1") {
  return { params: Promise.resolve({ entity, relation, parent_id: parent }) };
}

describe("GET /api/runtime/v1/entities/[entity]/relations/[relation]/records/[parent_id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(PARENT_DESCRIPTOR as never);
      if (code === "purchase_invoice_line") return Promise.resolve(CHILD_DESCRIPTOR as never);
      if (code === "purchase_order") return Promise.resolve(PO_DESCRIPTOR as never);
      if (code === "schedule_line") return Promise.resolve(SCHEDULE_DESCRIPTOR as never);
      return Promise.resolve(null as never);
    });
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValue({
      state: { status: "available" },
      record: { id: "inv-1" },
    } as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "line-1" }, { id: "line-2" }], pagination: { total: 2 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  // Gate 1: session
  it("returns 401 when no session", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Gate 2: parent entity registered
  it("returns 404 PARENT_ENTITY_NOT_FOUND when parent descriptor is missing", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation(() => Promise.resolve(null as never));
    const res = await GET(new Request("http://localhost"), params("not_a_thing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("PARENT_ENTITY_NOT_FOUND");
  });

  // Gate 3: relation found in descriptor.relations
  it("returns 404 RELATION_NOT_FOUND when the relation name is not on the descriptor", async () => {
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "phantom"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("RELATION_NOT_FOUND");
  });

  // Gate 4: parent record visible
  it("returns 404 PARENT_NOT_ACCESSIBLE when the parent record is out of scope", async () => {
    vi.mocked(getMetaEntityRecordDetail).mockResolvedValueOnce({
      state: { status: "unavailable", message: "scoped out" },
      record: null,
    } as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("PARENT_NOT_ACCESSIBLE");
  });

  // Gate 5: child entity readable (soft-allow when descriptor missing)
  it("returns 403 CHILD_READ_DENIED when child descriptor disallows read", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(PARENT_DESCRIPTOR as never);
      if (code === "purchase_invoice_line") {
        return Promise.resolve({ entityCode: "purchase_invoice_line", capabilities: { canRead: false } } as never);
      }
      return Promise.resolve(null as never);
    });
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CHILD_READ_DENIED");
  });

  // Soft-allow: child descriptor missing entirely (polymorphic child like pricing_component)
  it("allows the fetch when child descriptor is missing (polymorphic child case)", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(PARENT_DESCRIPTOR as never);
      return Promise.resolve(null as never);
    });
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
  });

  // Happy path — confirms canonical /api/runtime/v1/entities/<target> URL + FK filter applied
  it("applies the FK filter and fetches via the canonical runtime URL (regression-locks the bindings-class bug)", async () => {
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "lines", "inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toEqual([{ id: "line-1" }, { id: "line-2" }]);
    expect(body.relation).toMatchObject({
      name: "lines",
      targetEntity: "purchase_invoice_line",
      resolutionKind: "fk",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/api/runtime/v1/entities/purchase_invoice_line");
    expect(u.searchParams.get("filter.purchase_invoice_id")).toBe("inv-1");
  });

  // Hyphen-to-underscore slug normalization on entity (matches rules handler behavior)
  it("normalizes hyphenated entity slugs to underscores before relation lookup", async () => {
    const res = await GET(new Request("http://localhost"), params("purchase-invoice", "lines", "inv-1"));
    expect(res.status).toBe(200);
  });

  it("keeps computed relation record filters out of the upstream query and applies them after fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: "sl-current", data: { is_current_version: true } },
          { id: "sl-old", data: { is_current_version: false } },
        ],
        pagination: { total: 2 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      new Request("http://localhost"),
      params("purchase_order", "schedules", "po-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toEqual([{ id: "sl-current", data: { is_current_version: true } }]);

    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.pathname).toBe("/api/runtime/v1/entities/schedule_line");
    expect(u.searchParams.get("filter.source_doc_type")).toBe("commitment_line");
    expect(u.searchParams.get("filter.source_doc_id")).toBe("po-1");
    expect(u.searchParams.has("filter.is_current_version")).toBe(false);
  });
});
