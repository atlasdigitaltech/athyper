/**
 * DDL Generator Classification Tests
 *
 * Tests the DDL Generator's class-specific column generation for entity classifications:
 * - DOCUMENT entities with document_number and posting_date
 * - MASTER entities with effective dating
 * - CONTROL entities with common columns only
 * - Legacy entities without entityClass
 * - Column nullability and default values
 * - Class-specific index generation
 */

import { describe, it, expect } from "vitest";

import { DdlGeneratorService } from "../schema/ddl-generator.service.js";

import type { CompiledModel } from "@athyper/core/meta";

/**
 * Helper to create a minimal CompiledModel for testing
 */
function createModel(overrides: Partial<CompiledModel> = {}): CompiledModel {
  return {
    entityName: "test_entity",
    version: "1.0.0",
    tableName: "test_entity",
    fields: [],
    policies: [],
    selectFragment: "id",
    fromFragment: "test_entity",
    tenantFilterFragment: "tenant_id = ?",
    indexes: [],
    compiledAt: new Date(),
    compiledBy: "test",
    hash: "test-hash",
    ...overrides,
  } as CompiledModel;
}

describe("DdlGeneratorService - Entity Classification", () => {
  const service = new DdlGeneratorService();

  describe("DOCUMENT entity", () => {
    it("should include document_number and posting_date columns", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // Verify DDL includes DOCUMENT-specific columns
      expect(result.createTableSql).toContain("document_number TEXT");
      expect(result.createTableSql).toContain("posting_date TIMESTAMPTZ");
    });

    it("should include common classification columns", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // Verify common columns for all classified entities
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).toContain("source_system TEXT NOT NULL DEFAULT 'internal'");
      expect(result.createTableSql).toContain("metadata JSONB DEFAULT '{}'::jsonb");
    });

    it("should include effective dating columns when flag is enabled", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).toContain("effective_from TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_to TIMESTAMPTZ");
    });

    it("should not include effective dating columns when flag is disabled", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
        featureFlags: {
          effective_dating_enabled: false,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");
    });

    it("should not include effective dating columns when flag is undefined", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");
    });

    it("should create unique index on document_number", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // Verify document_number index exists
      const docNumberIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_invoice_document_number")
      );
      expect(docNumberIndex).toBeDefined();
      expect(docNumberIndex).toContain("CREATE UNIQUE INDEX");
      expect(docNumberIndex).toContain("(tenant_id, document_number)");
      expect(docNumberIndex).toContain("WHERE document_number IS NOT NULL");
    });

    it("should create status index", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      const statusIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_invoice_status")
      );
      expect(statusIndex).toBeDefined();
      expect(statusIndex).toContain("(tenant_id, status)");
    });

    it("should create effective_range index when effective dating enabled", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      const effectiveIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_invoice_effective_range")
      );
      expect(effectiveIndex).toBeDefined();
      expect(effectiveIndex).toContain("(tenant_id, effective_from, effective_to)");
    });

    it("should not create effective_range index when flag is disabled", () => {
      const model = createModel({
        entityName: "invoice",
        tableName: "invoice",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      const effectiveIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_invoice_effective_range")
      );
      expect(effectiveIndex).toBeUndefined();
    });
  });

  describe("MASTER entity", () => {
    it("should include common classification columns", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
      });

      const result = service.generateDdl(model);

      // Verify common columns
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).toContain("source_system TEXT NOT NULL DEFAULT 'internal'");
      expect(result.createTableSql).toContain("metadata JSONB DEFAULT '{}'::jsonb");
    });

    it("should NOT include document_number or posting_date", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("posting_date");
    });

    it("should include effective dating columns when flag is enabled", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).toContain("effective_from TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_to TIMESTAMPTZ");
    });

    it("should not include effective dating columns when flag is disabled", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: false,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");
    });

    it("should create status index", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
      });

      const result = service.generateDdl(model);

      const statusIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_customer_status")
      );
      expect(statusIndex).toBeDefined();
      expect(statusIndex).toContain("(tenant_id, status)");
    });

    it("should NOT create document_number index", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
      });

      const result = service.generateDdl(model);

      const docNumberIndex = result.createIndexSql.find(sql =>
        sql.includes("document_number")
      );
      expect(docNumberIndex).toBeUndefined();
    });

    it("should create effective_range index when effective dating enabled", () => {
      const model = createModel({
        entityName: "customer",
        tableName: "customer",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      const effectiveIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_customer_effective_range")
      );
      expect(effectiveIndex).toBeDefined();
      expect(effectiveIndex).toContain("(tenant_id, effective_from, effective_to)");
    });
  });

  describe("CONTROL entity", () => {
    it("should include common classification columns", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      // Verify common columns
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).toContain("source_system TEXT NOT NULL DEFAULT 'internal'");
      expect(result.createTableSql).toContain("metadata JSONB DEFAULT '{}'::jsonb");
    });

    it("should NOT include document_number or posting_date", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("posting_date");
    });

    it("should NOT include effective dating columns by default", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");
    });

    it("should include effective dating columns when flag is enabled", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).toContain("effective_from TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_to TIMESTAMPTZ");
    });

    it("should create status index", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      const statusIndex = result.createIndexSql.find(sql =>
        sql.includes("idx_workflow_state_status")
      );
      expect(statusIndex).toBeDefined();
      expect(statusIndex).toContain("(tenant_id, status)");
    });

    it("should NOT create document_number index", () => {
      const model = createModel({
        entityName: "workflow_state",
        tableName: "workflow_state",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      const docNumberIndex = result.createIndexSql.find(sql =>
        sql.includes("document_number")
      );
      expect(docNumberIndex).toBeUndefined();
    });
  });

  describe("Legacy entity (undefined entityClass)", () => {
    it("should include original system columns only", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      // Verify original system columns
      expect(result.createTableSql).toContain("id UUID NOT NULL");
      expect(result.createTableSql).toContain("tenant_id UUID NOT NULL");
      expect(result.createTableSql).toContain("realm_id TEXT NOT NULL");
      expect(result.createTableSql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(result.createTableSql).toContain("created_by TEXT");
      expect(result.createTableSql).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(result.createTableSql).toContain("updated_by TEXT");
      expect(result.createTableSql).toContain("deleted_at TIMESTAMPTZ");
      expect(result.createTableSql).toContain("deleted_by TEXT");
      expect(result.createTableSql).toContain("version INT NOT NULL DEFAULT 1");
    });

    it("should NOT include entity_type_code", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("entity_type_code");
    });

    it("should NOT include status", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      // Note: "status" might appear in other contexts, so check for the column definition
      expect(result.createTableSql).not.toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
    });

    it("should NOT include source_system", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("source_system");
    });

    it("should NOT include metadata JSONB", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("metadata JSONB");
    });

    it("should NOT include document_number or posting_date", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("posting_date");
    });

    it("should NOT include effective dating columns even if flag is enabled", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");
    });

    it("should NOT create status index", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      const statusIndex = result.createIndexSql.find(sql =>
        sql.includes("_status")
      );
      expect(statusIndex).toBeUndefined();
    });

    it("should create standard indexes (tenant_id, tenant_deleted, version)", () => {
      const model = createModel({
        entityName: "legacy_entity",
        tableName: "legacy_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      // Verify standard indexes exist
      expect(result.createIndexSql.some(sql =>
        sql.includes("idx_legacy_entity_tenant_id")
      )).toBe(true);

      expect(result.createIndexSql.some(sql =>
        sql.includes("idx_legacy_entity_tenant_deleted")
      )).toBe(true);

      expect(result.createIndexSql.some(sql =>
        sql.includes("idx_legacy_entity_version")
      )).toBe(true);
    });
  });

  describe("Column nullability and defaults", () => {
    it("should ensure entity_type_code is nullable with DEFAULT", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // entity_type_code should have DEFAULT but no NOT NULL
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      // Verify it doesn't have NOT NULL after entity_type_code
      const lines = result.createTableSql.split('\n');
      const etcLine = lines.find(l => l.includes("entity_type_code"));
      expect(etcLine).toBeDefined();
      expect(etcLine).not.toContain("NOT NULL");
    });

    it("should ensure status has NOT NULL with DEFAULT", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
    });

    it("should ensure source_system has NOT NULL with DEFAULT", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      expect(result.createTableSql).toContain("source_system TEXT NOT NULL DEFAULT 'internal'");
    });

    it("should ensure metadata is nullable with DEFAULT", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // metadata should have DEFAULT but no NOT NULL
      expect(result.createTableSql).toContain("metadata JSONB DEFAULT '{}'::jsonb");
      const lines = result.createTableSql.split('\n');
      const metadataLine = lines.find(l => l.includes("metadata JSONB"));
      expect(metadataLine).toBeDefined();
      expect(metadataLine).not.toContain("NOT NULL");
    });

    it("should ensure document_number is nullable (no NOT NULL, no DEFAULT)", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // document_number should be nullable (just "document_number TEXT")
      const lines = result.createTableSql.split('\n');
      const docNumberLine = lines.find(l => l.includes("document_number TEXT"));
      expect(docNumberLine).toBeDefined();
      expect(docNumberLine).not.toContain("NOT NULL");
      expect(docNumberLine).not.toContain("DEFAULT");
    });

    it("should ensure posting_date is nullable (no NOT NULL, no DEFAULT)", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "DOCUMENT",
      });

      const result = service.generateDdl(model);

      // posting_date should be nullable
      const lines = result.createTableSql.split('\n');
      const postingDateLine = lines.find(l => l.includes("posting_date TIMESTAMPTZ"));
      expect(postingDateLine).toBeDefined();
      expect(postingDateLine).not.toContain("NOT NULL");
      expect(postingDateLine).not.toContain("DEFAULT");
    });

    it("should ensure effective_from is nullable (no NOT NULL, no DEFAULT)", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      // effective_from should be nullable
      const lines = result.createTableSql.split('\n');
      const effectiveFromLine = lines.find(l => l.includes("effective_from TIMESTAMPTZ"));
      expect(effectiveFromLine).toBeDefined();
      expect(effectiveFromLine).not.toContain("NOT NULL");
      expect(effectiveFromLine).not.toContain("DEFAULT");
    });

    it("should ensure effective_to is nullable (no NOT NULL, no DEFAULT)", () => {
      const model = createModel({
        entityName: "test",
        tableName: "test",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      // effective_to should be nullable
      const lines = result.createTableSql.split('\n');
      const effectiveToLine = lines.find(l => l.includes("effective_to TIMESTAMPTZ"));
      expect(effectiveToLine).toBeDefined();
      expect(effectiveToLine).not.toContain("NOT NULL");
      expect(effectiveToLine).not.toContain("DEFAULT");
    });
  });

  describe("Full DDL structure validation", () => {
    it("should generate valid DDL for DOCUMENT entity with all features", () => {
      const model = createModel({
        entityName: "sales_order",
        tableName: "sales_order",
        entityClass: "DOCUMENT",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      // Verify structure
      expect(result.createTableSql).toContain("CREATE TABLE IF NOT EXISTS ent.sales_order");
      expect(result.createTableSql).toContain("CONSTRAINT sales_order_pkey PRIMARY KEY (id)");
      expect(result.createTableSql).toMatch(/CREATE TABLE.*\([\s\S]*\);/);

      // Verify all expected columns are present
      expect(result.createTableSql).toContain("id UUID NOT NULL");
      expect(result.createTableSql).toContain("tenant_id UUID NOT NULL");
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).toContain("document_number TEXT");
      expect(result.createTableSql).toContain("posting_date TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_from TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_to TIMESTAMPTZ");

      // Verify indexes
      expect(result.createIndexSql.length).toBeGreaterThan(0);
      expect(result.createIndexSql.some(sql => sql.includes("idx_sales_order_status"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("idx_sales_order_document_number"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("idx_sales_order_effective_range"))).toBe(true);
    });

    it("should generate valid DDL for MASTER entity with effective dating", () => {
      const model = createModel({
        entityName: "product",
        tableName: "product",
        entityClass: "MASTER",
        featureFlags: {
          effective_dating_enabled: true,
        },
      });

      const result = service.generateDdl(model);

      // Verify structure
      expect(result.createTableSql).toContain("CREATE TABLE IF NOT EXISTS ent.product");
      expect(result.createTableSql).toContain("CONSTRAINT product_pkey PRIMARY KEY (id)");

      // Verify column presence
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).toContain("effective_from TIMESTAMPTZ");
      expect(result.createTableSql).toContain("effective_to TIMESTAMPTZ");

      // Verify columns NOT present
      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("posting_date");

      // Verify indexes
      expect(result.createIndexSql.some(sql => sql.includes("idx_product_status"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("idx_product_effective_range"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("document_number"))).toBe(false);
    });

    it("should generate valid DDL for CONTROL entity without extra features", () => {
      const model = createModel({
        entityName: "approval_step",
        tableName: "approval_step",
        entityClass: "CONTROL",
      });

      const result = service.generateDdl(model);

      // Verify structure
      expect(result.createTableSql).toContain("CREATE TABLE IF NOT EXISTS ent.approval_step");
      expect(result.createTableSql).toContain("CONSTRAINT approval_step_pkey PRIMARY KEY (id)");

      // Verify column presence
      expect(result.createTableSql).toContain("entity_type_code TEXT DEFAULT ''");
      expect(result.createTableSql).toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");

      // Verify columns NOT present
      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("posting_date");
      expect(result.createTableSql).not.toContain("effective_from");
      expect(result.createTableSql).not.toContain("effective_to");

      // Verify indexes
      expect(result.createIndexSql.some(sql => sql.includes("idx_approval_step_status"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("document_number"))).toBe(false);
      expect(result.createIndexSql.some(sql => sql.includes("effective_range"))).toBe(false);
    });

    it("should generate valid DDL for legacy entity", () => {
      const model = createModel({
        entityName: "old_entity",
        tableName: "old_entity",
        entityClass: undefined,
      });

      const result = service.generateDdl(model);

      // Verify structure
      expect(result.createTableSql).toContain("CREATE TABLE IF NOT EXISTS ent.old_entity");
      expect(result.createTableSql).toContain("CONSTRAINT old_entity_pkey PRIMARY KEY (id)");

      // Verify only legacy columns present
      expect(result.createTableSql).toContain("id UUID NOT NULL");
      expect(result.createTableSql).toContain("tenant_id UUID NOT NULL");
      expect(result.createTableSql).toContain("version INT NOT NULL DEFAULT 1");

      // Verify new columns NOT present
      expect(result.createTableSql).not.toContain("entity_type_code");
      expect(result.createTableSql).not.toContain("status TEXT NOT NULL DEFAULT 'DRAFT'");
      expect(result.createTableSql).not.toContain("document_number");
      expect(result.createTableSql).not.toContain("effective_from");

      // Verify only legacy indexes
      expect(result.createIndexSql.some(sql => sql.includes("idx_old_entity_tenant_id"))).toBe(true);
      expect(result.createIndexSql.some(sql => sql.includes("idx_old_entity_status"))).toBe(false);
      expect(result.createIndexSql.some(sql => sql.includes("document_number"))).toBe(false);
    });
  });
});
