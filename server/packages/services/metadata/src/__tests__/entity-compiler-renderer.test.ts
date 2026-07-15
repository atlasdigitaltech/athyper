import { describe, expect, it } from "vitest";
import {
  compileDocumentRuntimePlan,
  hasCompiledDocumentItems,
  resolveCompiledEntityRenderer,
} from "../entity-compiler.service.js";

describe("compiled entity renderer", () => {
  it("honors the explicit renderer before class and schema heuristics", () => {
    expect(resolveCompiledEntityRenderer({
      entityClass: "DOCUMENT",
      tableSchema: "document",
      displayConfig: { detail_renderer: "ledger" },
      featureFlags: { has_workflow: true },
    })).toBe("ledger");
  });

  it("creates an items node only for a declared line collection", () => {
    const relations = [
      { name: "supplier", relation_kind: "belongs_to", target_entity: "supplier" },
      { name: "lines", relation_kind: "has_many", target_entity: "purchase_order_line" },
    ];
    expect(hasCompiledDocumentItems({
      relations,
      displayConfig: { line_entity_code: "purchase_order_line" },
      featureFlags: { has_lines: true },
    })).toBe(true);
    expect(hasCompiledDocumentItems({
      relations,
      displayConfig: { line_entity_code: "purchase_order_line" },
      featureFlags: { has_lines: false },
    })).toBe(false);
    expect(hasCompiledDocumentItems({
      relations: [relations[0]!],
      displayConfig: {},
      featureFlags: { has_lines: true },
    })).toBe(false);
  });

  it("preserves simple entities instead of normalizing them to master", () => {
    expect(resolveCompiledEntityRenderer({
      entityClass: "MASTER",
      tableSchema: "master",
      displayConfig: { detail_renderer: "simple" },
      featureFlags: {},
    })).toBe("simple");
  });

  it("rejects unknown renderer spellings instead of silently using master", () => {
    expect(() => resolveCompiledEntityRenderer({
      entityClass: "MASTER",
      tableSchema: "master",
      displayConfig: { detail_renderer: "documnt" },
      featureFlags: {},
    })).toThrow(/Unsupported detail_renderer/);
  });

  it("does not classify master purchase reference data as a document by name", () => {
    expect(resolveCompiledEntityRenderer({
      entityClass: "MASTER",
      tableSchema: "master",
      displayConfig: {},
      featureFlags: {},
    })).toBe("master");
  });

  it("derives document and ledger renderers from canonical metadata", () => {
    expect(resolveCompiledEntityRenderer({
      entityClass: "MASTER",
      tableSchema: "master",
      displayConfig: {},
      featureFlags: { is_approvable: true },
    })).toBe("document");
    expect(resolveCompiledEntityRenderer({
      entityClass: "LOG",
      tableSchema: "audit",
      displayConfig: {},
      featureFlags: {},
    })).toBe("ledger");
  });

  it("produces stable plan hashes across equivalent tenant metadata ordering", () => {
    const base = {
      renderer: "document" as const,
      versionHash: "purchase-order-v4",
      hasItems: true,
      fields: [],
    };
    const tenantA = compileDocumentRuntimePlan({
      ...base,
      contractMaterial: {
        documentRuntime: { surfaces: [{ key: "lines", order: 20 }] },
        relations: [{ name: "lines", target_entity: "purchase_order_line" }],
      },
    });
    const tenantB = compileDocumentRuntimePlan({
      ...base,
      contractMaterial: {
        relations: [{ target_entity: "purchase_order_line", name: "lines" }],
        documentRuntime: { surfaces: [{ order: 20, key: "lines" }] },
      },
    });
    const purchaseInvoice = compileDocumentRuntimePlan({
      ...base,
      versionHash: "purchase-invoice-v4",
      contractMaterial: {
        documentRuntime: { surfaces: [{ key: "lines", order: 20 }] },
        relations: [{ name: "lines", target_entity: "purchase_invoice_line" }],
      },
    });

    expect(tenantA?.planHash).toBe(tenantB?.planHash);
    expect(tenantA?.planHash).not.toBe(purchaseInvoice?.planHash);
  });
});
