import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../route";
import { getNeonServerSession } from "@/lib/server/session";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getMetaEntityRecordList } from "@/lib/server/meta-entity-records";

const SESSION = { userId: "user-1" };

function params(entity = "purchase-invoice") {
  return { params: Promise.resolve({ entity }) };
}

describe("POST /api/runtime/v1/entities/[entity]/defaults/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeonServerSession).mockResolvedValue(SESSION as never);
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "purchase_invoice") return Promise.resolve(purchaseInvoiceDescriptor() as never);
      if (code === "address") return Promise.resolve(addressDescriptor() as never);
      return Promise.resolve(null as never);
    });
    vi.mocked(getMetaEntityRecordList).mockResolvedValue({
      state: { status: "available" },
      records: [
        { id: "row-secondary", data: { address_id: "addr-secondary", name: "Secondary", code: "B", is_primary: false } },
        { id: "row-primary", data: { address_id: "addr-primary", name: "Primary", code: "A", is_primary: true } },
      ],
    } as never);
  });

  it("infers picker.first_option from dependent picker metadata when explicit defaults are absent", async () => {
    const response = await POST(
      new Request("http://localhost/api/runtime/v1/entities/purchase-invoice/defaults/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: "pi-1",
          changedFields: ["supplier_id"],
          oldValues: { supplier_id: "sup-old" },
          newValues: { supplier_id: "sup-new", billfrom_address_id: "" },
          provenance: { supplier_id: "user_input" },
        }),
      }) as never,
      params(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valueUpdates).toMatchObject({ billfrom_address_id: "addr-primary" });
    expect(body.derivedFields).toContain("billfrom_address_id");
    expect(body.intents).toEqual([
      expect.objectContaining({
        target: "billfrom_address_id",
        action: "rederive",
        resolver: "picker.first_option",
        sources: ["supplier_id"],
      }),
    ]);
    expect(getMetaEntityRecordList).toHaveBeenCalledWith(
      "address",
      expect.objectContaining({
        "filter.supplier_id": "sup-new",
        "filter.purpose": "bill_from,default",
      }),
      expect.any(Object),
    );
  });

  it("infers picker.first_option from lookup scope source_field metadata", async () => {
    vi.mocked(getMetaEntityRuntimeDescriptor).mockImplementation((code: string) => {
      if (code === "commitment_line") return Promise.resolve(commitmentLineDescriptor() as never);
      if (code === "warehouse") return Promise.resolve(warehouseDescriptor() as never);
      return Promise.resolve(null as never);
    });
    vi.mocked(getMetaEntityRecordList).mockResolvedValue({
      state: { status: "available" },
      records: [
        { id: "wh-1", data: { id: "wh-1", name: "Main Warehouse", code: "WH1", site_id: "site-new" } },
      ],
    } as never);

    const response = await POST(
      new Request("http://localhost/api/runtime/v1/entities/commitment-line/defaults/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: "line-1",
          changedFields: ["site_id"],
          oldValues: { site_id: "site-old", warehouse_id: "" },
          newValues: { site_id: "site-new", warehouse_id: "" },
          provenance: { site_id: "user_input" },
        }),
      }) as never,
      params("commitment-line"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valueUpdates).toMatchObject({ warehouse_id: "wh-1" });
    expect(body.derivedFields).toContain("warehouse_id");
    expect(body.intents).toEqual([
      expect.objectContaining({
        target: "warehouse_id",
        action: "rederive",
        resolver: "picker.first_option",
        sources: ["site_id"],
      }),
    ]);
    expect(getMetaEntityRecordList).toHaveBeenCalledWith(
      "warehouse",
      expect.objectContaining({
        "filter.site_id": "site-new",
      }),
      expect.any(Object),
    );
  });
});

function purchaseInvoiceDescriptor() {
  return {
    entityCode: "purchase_invoice",
    source: { tableSchema: "document" },
    capabilities: { canRead: true },
    fields: [
      { name: "supplier_id", columnName: "supplier_id", dataType: "reference" },
      {
        name: "billfrom_address_id",
        columnName: "billfrom_address_id",
        dataType: "reference",
        referenceEntity: "address",
        referenceConfig: {
          value_field: "address_id",
          label_field: "name",
          code_field: "code",
        },
        lookupConfig: {
          filters: { purpose: "bill_from,default" },
          dependent_filter: {
            source_field: "supplier_id",
            target_field: "supplier_id",
            empty_behavior: "none",
          },
          default_order: ["-is_primary", "code", "id"],
        },
        optionSource: {
          kind: "reference",
          entity: "address",
          valueField: "address_id",
          labelField: "name",
          codeField: "code",
        },
      },
    ],
  };
}

function addressDescriptor() {
  return {
    entityCode: "address",
    source: { tableSchema: "master" },
    capabilities: { canRead: true },
    fields: [
      { name: "address_id", columnName: "address_id", dataType: "uuid" },
      { name: "name", columnName: "name", dataType: "string" },
      { name: "code", columnName: "code", dataType: "string" },
      { name: "is_primary", columnName: "is_primary", dataType: "boolean" },
    ],
  };
}

function commitmentLineDescriptor() {
  return {
    entityCode: "commitment_line",
    source: { tableSchema: "document" },
    capabilities: { canRead: true },
    fields: [
      { name: "site_id", columnName: "site_id", dataType: "reference" },
      {
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
          default_order: ["code", "id"],
        },
        optionSource: {
          kind: "reference",
          entity: "warehouse",
          valueField: "id",
          labelField: "name",
          codeField: "code",
        },
      },
    ],
  };
}

function warehouseDescriptor() {
  return {
    entityCode: "warehouse",
    source: { tableSchema: "master" },
    capabilities: { canRead: true },
    fields: [
      { name: "id", columnName: "id", dataType: "uuid" },
      { name: "name", columnName: "name", dataType: "string" },
      { name: "code", columnName: "code", dataType: "string" },
      { name: "site_id", columnName: "site_id", dataType: "uuid" },
    ],
  };
}
