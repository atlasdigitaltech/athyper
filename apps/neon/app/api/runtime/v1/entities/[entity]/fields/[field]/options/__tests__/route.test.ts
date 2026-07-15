// BFF route tests — GET /api/runtime/v1/entities/[entity]/fields/[field]/options
// Covers the three resolution branches: static, lookup-domain, reference.
// The handler itself is 587 lines of branching; these tests cover the entry-point
// branch selector + the URL contracts on the two upstream-fetching branches.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-runtime", () => ({
  getMetaEntityRuntimeDescriptor: vi.fn(),
}));
vi.mock("@/lib/server/meta-entity-records", () => ({
  getMetaEntityRecordList: vi.fn(),
  getMetaEntityRecordDetail: vi.fn(),
}));
vi.mock("@/lib/server/runtime-headers", () => ({
  buildRuntimeHeaders: vi.fn(() => ({ Authorization: "Bearer t" })),
  buildRuntimeUrl: (path: string) => `http://runtime.test${path}`,
}));

import { GET } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";

const SESSION = { userId: "user-1" };

// Minimal field shapes — only the properties the handler reads.
function staticField() {
  return {
    name: "currency",
    columnName: "currency",
    dataType: "string",
    optionSource: {
      kind: "static",
      options: [
        { value: "USD", label: "US Dollar" },
        { value: "EUR", label: "Euro" },
        { value: "GBP", label: "British Pound" },
      ],
    },
  };
}

function lookupField() {
  return {
    name: "status",
    columnName: "status",
    dataType: "enum",
    optionSource: { kind: "lookup", domainCode: "tenant.purchase_invoice_status" },
  };
}

function referenceField() {
  return {
    name: "supplier_id",
    columnName: "supplier_id",
    dataType: "reference",
    referenceEntity: "supplier",
    referenceConfig: {},
    optionSource: { kind: "reference", entity: "supplier", valueField: "id", labelField: "name" },
  };
}

function scopedWarehouseField() {
  return {
    name: "warehouse_id",
    columnName: "warehouse_id",
    dataType: "reference",
    referenceEntity: "warehouse",
    referenceConfig: {
      value_field: "id",
      label_field: "name",
      code_field: "code",
    },
    lookupConfig: {
      scope: {
        kind: "field_equal",
        source_field: "site_id",
        target_field: "site_id",
      },
    },
    optionSource: { kind: "reference", entity: "warehouse", valueField: "id", labelField: "name", codeField: "code" },
  };
}

function descriptor(field: ReturnType<typeof staticField | typeof lookupField | typeof referenceField>) {
  return {
    entityCode: "purchase_invoice",
    source: { tableSchema: "tenant" },
    capabilities: { canRead: true },
    fields: [field],
  };
}

function params(entity = "purchase_invoice", field = "currency") {
  return { params: Promise.resolve({ entity, field }) };
}

describe("GET /api/runtime/v1/entities/[entity]/fields/[field]/options — entry gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
  });

  it("returns 404 FIELD_NOT_FOUND when entity descriptor is missing", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("FIELD_NOT_FOUND");
  });

  it("returns 401 UNAUTHENTICATED before resolving options", async () => {
    vi.mocked(getNeonServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(getMetaEntityRuntimeDescriptor).not.toHaveBeenCalled();
  });

  it("returns 404 FIELD_NOT_FOUND when the field is not on the descriptor", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor(staticField()) as never);
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "not_a_field"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("FIELD_NOT_FOUND");
  });

  it("matches a field by columnName when name does not match", async () => {
    const f = staticField();
    f.columnName = "currency_code";
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(descriptor(f) as never);
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "currency_code"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/runtime/v1/entities/[entity]/fields/[field]/options — static branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor(staticField()) as never);
  });

  it("returns all declared options with source.kind=static", async () => {
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toEqual({ kind: "static" });
    expect(body.options).toHaveLength(3);
    expect(body.options[0]).toMatchObject({ value: "USD", label: "US Dollar" });
  });

  it("filters by ?q= (case-insensitive substring across value, label, description)", async () => {
    const res = await GET(new Request("http://localhost?q=dollar"), params());
    const body = await res.json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0].value).toBe("USD");
  });

  it("prepends a disabled current-value entry when ?value= is not in the option set", async () => {
    const res = await GET(new Request("http://localhost?value=ZZZ"), params());
    const body = await res.json();
    expect(body.options[0]).toMatchObject({ value: "ZZZ", disabled: true });
  });
});

describe("GET /api/runtime/v1/entities/[entity]/fields/[field]/options — lookup branch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValue(descriptor(lookupField()) as never);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          values: [
            { code: "draft", name: "Draft", status: "active" },
            { code: "submitted", name: "Submitted", status: "active" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("hits the canonical /api/metadata/lookups/<domain> URL (locked by decision; never moves)", async () => {
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "status"));
    expect(res.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    // Decision locked in runtime-server-paths.ts: lookup-domain endpoint STAYS at /api/metadata/lookups/.
    expect(u.pathname).toBe("/api/metadata/lookups/tenant.purchase_invoice_status");
  });

  it("maps lookup values into options with source.kind=lookup", async () => {
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "status"));
    const body = await res.json();
    expect(body.source).toMatchObject({ kind: "lookup", domainCode: "tenant.purchase_invoice_status" });
    expect(body.options).toHaveLength(2);
    expect(body.options.map((o: { value: string }) => o.value)).toEqual(["draft", "submitted"]);
  });
});

describe("GET /api/runtime/v1/entities/[entity]/fields/[field]/options — reference branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(descriptor(referenceField()) as never);
      if (code === "supplier") {
        return Promise.resolve({
          entityCode: "supplier",
          source: { tableSchema: "master" },
          capabilities: { canRead: true },
          fields: [
            { name: "id", columnName: "id", dataType: "uuid" },
            { name: "name", columnName: "name", dataType: "string" },
          ],
        } as never);
      }
      return Promise.resolve(null as never);
    });
    vi.mocked(getMetaEntityRecordList).mockResolvedValue({
      state: { status: "available" },
      records: [
        { id: "sup-1", data: { name: "Acme" } },
        { id: "sup-2", data: { name: "Globex" } },
      ],
    } as never);
  });

  it("returns 403 REFERENCE_NOT_READABLE when target descriptor disallows read", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(descriptor(referenceField()) as never);
      if (code === "supplier") {
        return Promise.resolve({
          entityCode: "supplier",
          source: { tableSchema: "master" },
          capabilities: { canRead: false },
          fields: [],
        } as never);
      }
      return Promise.resolve(null as never);
    });
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "supplier_id"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("REFERENCE_NOT_READABLE");
  });

  it("invokes getMetaEntityRecordList for the target entity (not a direct fetch)", async () => {
    const res = await GET(new Request("http://localhost?q=Acme"), params("purchase_invoice", "supplier_id"));
    expect(res.status).toBe(200);
    expect(getMetaEntityRecordList).toHaveBeenCalledTimes(1);
    const [targetEntity, queryParams] = vi.mocked(getMetaEntityRecordList).mock.calls[0]!;
    expect(targetEntity).toBe("supplier");
    expect(queryParams).toMatchObject({ q: "Acme" });
  });

  it("returns 503 when reference option records are unavailable", async () => {
    vi.mocked(getMetaEntityRecordList).mockResolvedValueOnce({
      state: { status: "unavailable", message: "Records service is unavailable." },
      records: [],
    } as never);

    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "supplier_id"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("REFERENCE_OPTIONS_UNAVAILABLE");
  });

  it("returns 400 OPTION_SOURCE_NOT_FOUND when no source can be resolved", async () => {
    // A bare field with no optionSource, no referenceEntity, and no inferable shape.
    const bareDescriptor = {
      entityCode: "purchase_invoice",
      source: { tableSchema: "tenant" },
      capabilities: { canRead: true },
      fields: [{ name: "freeform", columnName: "freeform", dataType: "json" }],
    };
    vi.mocked(getMetaEntityRuntimeDescriptor).mockReset();
    vi.mocked(getMetaEntityRuntimeDescriptor).mockResolvedValueOnce(bareDescriptor as never);
    const res = await GET(new Request("http://localhost"), params("purchase_invoice", "freeform"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("OPTION_SOURCE_NOT_FOUND");
  });

  it("applies lookup scope source_field filters to reference options", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "commitment_line") {
        return Promise.resolve({
          entityCode: "commitment_line",
          source: { tableSchema: "document" },
          capabilities: { canRead: true },
          fields: [scopedWarehouseField()],
        } as never);
      }
      if (code === "warehouse") {
        return Promise.resolve({
          entityCode: "warehouse",
          source: { tableSchema: "master" },
          capabilities: { canRead: true },
          fields: [
            { name: "id", columnName: "id", dataType: "uuid" },
            { name: "name", columnName: "name", dataType: "string" },
            { name: "code", columnName: "code", dataType: "string" },
          ],
        } as never);
      }
      return Promise.resolve(null as never);
    });

    const res = await GET(
      new Request("http://localhost?context.site_id=site-1"),
      params("commitment_line", "warehouse_id"),
    );

    expect(res.status).toBe(200);
    expect(getMetaEntityRecordList).toHaveBeenCalledWith(
      "warehouse",
      expect.objectContaining({
        "filter.site_id": "site-1",
      }),
      expect.any(Object),
    );
  });
});
