/**
 * Reference-label enricher — unit tests.
 *
 * Exercises the row-projection behavior with injected discovery + fetch
 * stubs (no DB). The DB-backed paths (discoverReferenceFields,
 * resolveTargetTable, fetchTargetLabels) are covered by integration
 * tests in Phase 6.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  enrichSingleReferenceLabels,
  enrichWithReferenceLabels,
  isReferenceLabelEnrichmentEnabled,
  referenceBaseName,
  specFromDiscoveredRow,
  type ReferenceFieldSpec,
  type ResolvedTargetLabels,
  type TargetTableInfo,
} from "../enrich-reference-labels.js";

const GL_ACCOUNT_SPEC: ReferenceFieldSpec = {
  fieldName:        "gl_account_id",
  columnName:       "gl_account_id",
  targetEntity:     "gl_account",
  targetField:      "id",
  labelField:       "name",
  codeField:        "code",
  descriptionField: null,
};

const COST_CENTER_SPEC: ReferenceFieldSpec = {
  fieldName:        "cost_center_id",
  columnName:       "cost_center_id",
  targetEntity:     "cost_center",
  targetField:      "id",
  labelField:       "name",
  codeField:        "code",
  descriptionField: null,
};

const ASSET_SPEC: ReferenceFieldSpec = {
  fieldName:        "asset_id",
  columnName:       "asset_id",
  targetEntity:     "asset",
  targetField:      "id",
  labelField:       "name",
  codeField:        "asset_number", // descriptor-overridden code field
  descriptionField: null,
};

const NO_CODE_SPEC: ReferenceFieldSpec = {
  fieldName:        "approver_id",
  columnName:       "approver_id",
  targetEntity:     "principal",
  targetField:      "id",
  labelField:       "display_name",
  codeField:        null, // descriptor declares no code field
  descriptionField: null,
};

const SUPPLIER_SPEC: ReferenceFieldSpec = {
  fieldName:        "supplier_id",
  columnName:       "supplier_id",
  targetEntity:     "supplier",
  targetField:      "id",
  labelField:       "name",
  codeField:        "supplier_code",
  descriptionField: null,
};

const BILLTO_ADDRESS_SPEC: ReferenceFieldSpec = {
  fieldName:        "billto_address_id",
  columnName:       "billto_address_id",
  targetEntity:     "v_company_code_address",
  targetField:      "address_id",
  labelField:       "name",
  codeField:        "code",
  descriptionField: "formatted_address",
};

const SHARED_TARGET: TargetTableInfo = { schema: "master", table: "gl_account", hasTenant: true };
const SHARED_NO_TENANT: TargetTableInfo = { schema: "shared", table: "principal", hasTenant: false };

const TENANT_A = "019f0000-0000-0000-0000-00000000aaaa";
const GL_A     = "019f0ad1-932a-7321-8833-56fec7b61f25";
const CC_A     = "019f0ad1-9426-7812-94e3-828cb6a18044";
const ASSET_A  = "019f0ad1-aaaa-bbbb-cccc-dddd00000001";

function ignoreDb(): never {
  throw new Error("db should not be used when overrides are provided");
}

describe("enrichWithReferenceLabels — projection", () => {
  it("attaches label + code on both companion key shapes", async () => {
    const rows = [{ gl_account_id: GL_A, amount: 100 }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:     [GL_ACCOUNT_SPEC],
        resolveTargetTable:  async () => SHARED_TARGET,
        fetchTargetLabels:   async () => new Map<string, ResolvedTargetLabels>([
          [GL_A, { label: "HR & Payroll", code: "5100", formattedValue: null, jurisdictionId: null }],
        ]),
      },
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      gl_account_id:       GL_A,
      gl_account_id_label: "HR & Payroll",
      gl_account_label:    "HR & Payroll",
      gl_account_id_code:  "5100",
      gl_account_code:     "5100",
      amount:              100,
    });
  });

  it("does not overwrite pre-existing non-blank companion keys", async () => {
    const rows = [
      { gl_account_id: GL_A, gl_account_label: "SnapshottedLabel", gl_account_code: "" },
    ];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:     [GL_ACCOUNT_SPEC],
        resolveTargetTable:  async () => SHARED_TARGET,
        fetchTargetLabels:   async () => new Map([
          [GL_A, { label: "FreshLabel", code: "5100", formattedValue: null, jurisdictionId: null }],
        ]),
      },
    });

    // Pre-existing snapshot label survives.
    expect(out[0]!["gl_account_label"]).toBe("SnapshottedLabel");
    // Mirror companion still gets the fresh value.
    expect(out[0]!["gl_account_id_label"]).toBe("FreshLabel");
    // Blank pre-existing code is treated as missing and filled.
    expect(out[0]!["gl_account_code"]).toBe("5100");
  });

  it("does not write companion keys when target row is missing (preserves client-side picker fallback)", async () => {
    const rows = [{ gl_account_id: GL_A }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:     [GL_ACCOUNT_SPEC],
        resolveTargetTable:  async () => SHARED_TARGET,
        fetchTargetLabels:   async () => new Map(), // no target rows
      },
    });

    // Pickers that resolve labels client-side (via /api/lookup) must see an
    // undefined companion when the server-side resolution misses — writing
    // `null` short-circuits their fallback and the UUID leaks to the UI.
    expect(out[0]).not.toHaveProperty("gl_account_label");
    expect(out[0]).not.toHaveProperty("gl_account_id_label");
    expect(out[0]).not.toHaveProperty("gl_account_code");
    expect(out[0]).not.toHaveProperty("gl_account_id_code");
  });

  it("skips code companion when descriptor declares no code field", async () => {
    const rows = [{ approver_id: GL_A }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "workflow_request",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:     [NO_CODE_SPEC],
        resolveTargetTable:  async () => SHARED_NO_TENANT,
        fetchTargetLabels:   async () => new Map([
          [GL_A, { label: "Jane Approver", code: null, formattedValue: null, jurisdictionId: null }],
        ]),
      },
    });

    expect(out[0]!["approver_id_label"]).toBe("Jane Approver");
    expect(out[0]!["approver_label"]).toBe("Jane Approver");
    expect(out[0]).not.toHaveProperty("approver_id_code");
    expect(out[0]).not.toHaveProperty("approver_code");
  });

  it("batches across multiple specs and rows; one fetch per target", async () => {
    const rows = [
      { gl_account_id: GL_A, cost_center_id: CC_A, asset_id: ASSET_A },
      { gl_account_id: GL_A, cost_center_id: CC_A, asset_id: null }, // null FK
      { gl_account_id: null, cost_center_id: CC_A, asset_id: ASSET_A },
    ];

    const fetchCalls: { entity: string; ids: string[] }[] = [];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields: [GL_ACCOUNT_SPEC, COST_CENTER_SPEC, ASSET_SPEC],
        resolveTargetTable: async (entity) => ({
          schema: "master", table: entity, hasTenant: true,
        }),
        fetchTargetLabels: async (target, spec, ids) => {
          fetchCalls.push({ entity: spec.targetEntity, ids: [...ids].sort() });
          const map = new Map<string, ResolvedTargetLabels>();
          map.set(ids[0]!, { label: `${target.table}-name`, code: "X", formattedValue: null, jurisdictionId: null });
          return map;
        },
      },
    });

    expect(fetchCalls).toHaveLength(3);
    // Distinct GL_A passed once, CC_A once, ASSET_A once.
    expect(fetchCalls.find(c => c.entity === "gl_account")!.ids).toEqual([GL_A]);
    expect(fetchCalls.find(c => c.entity === "cost_center")!.ids).toEqual([CC_A]);
    expect(fetchCalls.find(c => c.entity === "asset")!.ids).toEqual([ASSET_A]);
    expect(out[1]!["asset_id_label"]).toBeUndefined(); // null FK never resolved
    expect(out[2]!["gl_account_id_label"]).toBeUndefined();
  });

  it("returns rows unchanged when no reference fields are discovered", async () => {
    const rows = [{ id: "x", value: 1 }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "some_entity",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields: [],
      },
    });
    expect(out).toEqual(rows);
  });

  it("returns empty rows untouched", async () => {
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows: [],
      overrides: {
        referenceFields: [GL_ACCOUNT_SPEC],
        resolveTargetTable: async () => { throw new Error("should not resolve when no rows"); },
      },
    });
    expect(out).toEqual([]);
  });

  it("skips a spec whose target entity cannot be resolved", async () => {
    const rows = [{ gl_account_id: GL_A }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:    [GL_ACCOUNT_SPEC],
        resolveTargetTable: async () => null, // unknown target
        fetchTargetLabels:  async () => { throw new Error("should not fetch"); },
      },
    });
    expect(out[0]).toEqual({ gl_account_id: GL_A });
  });

  it("adds identity aliases for party fields consumed by the identity panel", async () => {
    const rows = [{ supplier_id: GL_A }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "purchase_invoice",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:    [SUPPLIER_SPEC],
        resolveTargetTable: async () => ({ schema: "master", table: "supplier", hasTenant: true }),
        fetchTargetLabels:  async () => new Map([
          [GL_A, { label: "Acme Supplies", code: "ACME", formattedValue: null, jurisdictionId: null }],
        ]),
      },
    });

    expect(out[0]).toMatchObject({
      supplier_id_label: "Acme Supplies",
      supplier_label:    "Acme Supplies",
      supplier_id_code:  "ACME",
      supplier_code:     "ACME",
      supplier_name:     "Acme Supplies",
    });
  });

  it("adds formatted address and jurisdiction companions for address references", async () => {
    const jurisdictionId = "019f0ad1-aaaa-bbbb-cccc-dddd00000002";
    const rows = [{ billto_address_id: ASSET_A }];
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "purchase_invoice",
      tenantId:   TENANT_A,
      rows,
      overrides: {
        referenceFields:    [BILLTO_ADDRESS_SPEC],
        resolveTargetTable: async () => ({ schema: "master", table: "v_company_code_address", hasTenant: true }),
        fetchTargetLabels:  async () => new Map([
          [ASSET_A, {
            label:          "HQ Billing",
            code:           "BILL-HQ",
            formattedValue: "1 Main Street",
            jurisdictionId,
          }],
        ]),
      },
    });

    expect(out[0]).toMatchObject({
      billto_address_id_label:             "HQ Billing",
      billto_address_label:                "HQ Billing",
      billto_address_id_code:              "BILL-HQ",
      billto_address_code:                 "BILL-HQ",
      billto_address_id_formatted_address: "1 Main Street",
      billto_address_formatted_address:    "1 Main Street",
      billto_address_id_jurisdiction_id:   jurisdictionId,
      billto_address_jurisdiction_id:      jurisdictionId,
    });
  });
});

describe("enrichSingleReferenceLabels — single-row wrapper", () => {
  it("enriches a single row using the same companion-key convention", async () => {
    const row = { gl_account_id: GL_A, amount: 50 };
    const out = await enrichSingleReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      row,
      overrides: {
        referenceFields:    [GL_ACCOUNT_SPEC],
        resolveTargetTable: async () => SHARED_TARGET,
        fetchTargetLabels:  async () => new Map([
          [GL_A, { label: "Office Supplies", code: "6200", formattedValue: null, jurisdictionId: null }],
        ]),
      },
    });
    expect(out).toMatchObject({
      gl_account_id:       GL_A,
      gl_account_id_label: "Office Supplies",
      gl_account_label:    "Office Supplies",
      gl_account_id_code:  "6200",
      gl_account_code:     "6200",
      amount:              50,
    });
  });

  it("returns null/undefined input unchanged", async () => {
    const outNull = await enrichSingleReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      row:        null,
      overrides:  { referenceFields: [GL_ACCOUNT_SPEC] },
    });
    expect(outNull).toBeNull();

    const outUndef = await enrichSingleReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      row:        undefined,
      overrides:  { referenceFields: [GL_ACCOUNT_SPEC] },
    });
    expect(outUndef).toBeUndefined();
  });
});

describe("isReferenceLabelEnrichmentEnabled — rollout kill-switch", () => {
  const SAVED = process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"];

  afterEach(() => {
    if (SAVED === undefined) {
      delete process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"];
    } else {
      process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"] = SAVED;
    }
  });

  it("defaults enabled when env var is unset", () => {
    delete process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"];
    expect(isReferenceLabelEnrichmentEnabled()).toBe(true);
  });

  for (const value of ["0", "false", "FALSE", "off", "OFF", " 0 ", "False"]) {
    it(`disables when env var is ${JSON.stringify(value)}`, () => {
      process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"] = value;
      expect(isReferenceLabelEnrichmentEnabled()).toBe(false);
    });
  }

  for (const value of ["1", "true", "on", "yes", "anything-else"]) {
    it(`stays enabled for ${JSON.stringify(value)}`, () => {
      process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"] = value;
      expect(isReferenceLabelEnrichmentEnabled()).toBe(true);
    });
  }

  it("bypasses enrichment when kill-switch is off (no overrides)", async () => {
    process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"] = "0";
    const rows = [{ gl_account_id: GL_A }];
    // No overrides → enricher should hit the kill-switch and return rows unchanged.
    // We pass a db sentinel that would throw if touched.
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows,
    });
    expect(out).toEqual(rows);
    expect(out[0]).not.toHaveProperty("gl_account_label");
  });

  it("kill-switch does NOT bypass when overrides are present (tests stay deterministic)", async () => {
    process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"] = "0";
    const out = await enrichWithReferenceLabels(ignoreDb as never, {
      entityCode: "accounting_distribution",
      tenantId:   TENANT_A,
      rows:       [{ gl_account_id: GL_A }],
      overrides: {
        referenceFields:    [GL_ACCOUNT_SPEC],
        resolveTargetTable: async () => SHARED_TARGET,
        fetchTargetLabels:  async () => new Map([[GL_A, { label: "GLA", code: "5100", formattedValue: null, jurisdictionId: null }]]),
      },
    });
    expect(out[0]!["gl_account_label"]).toBe("GLA");
  });
});

describe("referenceBaseName", () => {
  it("strips _id suffix", () => {
    expect(referenceBaseName("gl_account_id")).toBe("gl_account");
  });
  it("returns name unchanged when no _id suffix", () => {
    expect(referenceBaseName("approver")).toBe("approver");
  });
  it("strips only the trailing _id", () => {
    expect(referenceBaseName("source_line_id")).toBe("source_line");
  });
});

describe("specFromDiscoveredRow — descriptor parsing", () => {
  it("parses target_entity / display_field / picker.code_field", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "asset_id",
      column_name:      "asset_id",
      reference_config: {
        target_entity: "asset",
        target_field:  "id",
        display_field: "name",
        picker:        { code_field: "asset_number", show_code: true },
      },
      validation: null,
    });
    expect(spec).toEqual({
      fieldName:    "asset_id",
      columnName:   "asset_id",
      targetEntity: "asset",
      targetField:  "id",
      labelField:   "name",
      codeField:    "asset_number",
      descriptionField: null,
    });
  });

  it("prefers reference_config.label_field over display_field", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "approver_id",
      column_name:      "approver_id",
      reference_config: {
        target_entity: "principal",
        label_field:   "full_name",
        display_field: "name",
      },
      validation: null,
    });
    expect(spec?.labelField).toBe("full_name");
  });

  it("accepts legacy validation.ref_entity plus reference_config value/display fields", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "billto_address_id",
      column_name:      "billto_address_id",
      reference_config: {
        label_field:       "name",
        code_field:        "code",
        description_field: "formatted_address",
        value_field:       "address_id",
      },
      validation: { ref_entity: "v_company_code_address" },
    });
    expect(spec).toEqual({
      fieldName:        "billto_address_id",
      columnName:       "billto_address_id",
      targetEntity:     "v_company_code_address",
      targetField:      "address_id",
      labelField:       "name",
      codeField:        "code",
      descriptionField: "formatted_address",
    });
  });

  it("defaults label_field to 'name' and code_field to 'code'", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "cost_center_id",
      column_name:      "cost_center_id",
      reference_config: { target_entity: "cost_center" },
      validation:       null,
    });
    expect(spec?.labelField).toBe("name");
    expect(spec?.codeField).toBe("code");
    expect(spec?.targetField).toBe("id");
  });

  it("rejects polymorphic reference fields", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "source_line_id",
      column_name:      "source_line_id",
      reference_config: { target_entity: "purchase_invoice_line" },
      validation:       { polymorphic: true },
    });
    expect(spec).toBeNull();
  });

  it("rejects rows missing target_entity", () => {
    const spec = specFromDiscoveredRow({
      field_name:       "x_id",
      column_name:      "x_id",
      reference_config: { display_field: "name" },
      validation:       null,
    });
    expect(spec).toBeNull();
  });
});
