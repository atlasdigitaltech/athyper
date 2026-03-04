/**
 * Entity Classification Service Tests
 *
 * Tests the EntityClassificationService which resolves entity classes and feature flags
 * from the meta.entity table.
 *
 * Key behaviors tested:
 * 1. Kind → class mapping (ref/mdm → MASTER, ent → CONTROL, doc → DOCUMENT)
 * 2. Feature flag parsing with defaults
 * 3. Missing entity returns undefined class + all-false flags
 * 4. getClassification returns both class + flags in a single query
 * 5. Only active entities are resolved
 */

import { describe, it, expect, vi } from "vitest";

import { EntityClassificationServiceImpl } from "../classification/entity-classification.service.js";

/**
 * Mock Kysely database for classification tests
 *
 * Simulates meta.entity table queries with support for:
 * - name, tenant_id, is_active filtering
 * - kind, feature_flags column selection
 */
function createMockDb(
  entities: Array<{
    name: string;
    kind: string | null;
    feature_flags: unknown;
    is_active: boolean;
    tenant_id: string;
  }>,
) {
  const selectQuery = {
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn(function (this: any, col: string, _op: string, val: any) {
      this._filters = this._filters || {};
      this._filters[col] = val;
      return this;
    }),
    executeTakeFirst: vi.fn(async function (this: any) {
      const filters = this._filters || {};
      return (
        entities.find(
          (e) =>
            e.name === filters.name &&
            e.tenant_id === filters.tenant_id &&
            e.is_active === filters.is_active,
        ) ?? undefined
      );
    }),
  };

  return {
    selectFrom: vi.fn(() => {
      // Reset filters for each query
      const query = { ...selectQuery, _filters: {} };
      query.select = vi.fn().mockReturnValue(query);
      query.selectAll = vi.fn().mockReturnValue(query);
      query.where = vi.fn(function (col: string, _op: string, val: any) {
        query._filters[col] = val;
        return query;
      });
      query.executeTakeFirst = vi.fn(async () => {
        return (
          entities.find(
            (e) =>
              e.name === query._filters.name &&
              e.tenant_id === query._filters.tenant_id &&
              e.is_active === query._filters.is_active,
          ) ?? undefined
        );
      });
      return query;
    }),
  } as any;
}

describe("EntityClassificationService", () => {
  const tenantId = "test-tenant-123";

  describe("1. Kind → Class Mapping", () => {
    it("should map 'ref' kind to MASTER class", async () => {
      const db = createMockDb([
        {
          name: "ReferenceData",
          kind: "ref",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("ReferenceData", tenantId);

      expect(result).toBe("MASTER");
    });

    it("should map 'mdm' kind to MASTER class", async () => {
      const db = createMockDb([
        {
          name: "MasterData",
          kind: "mdm",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("MasterData", tenantId);

      expect(result).toBe("MASTER");
    });

    it("should map 'ent' kind to CONTROL class", async () => {
      const db = createMockDb([
        {
          name: "PurchaseOrder",
          kind: "ent",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("PurchaseOrder", tenantId);

      expect(result).toBe("CONTROL");
    });

    it("should map 'doc' kind to DOCUMENT class", async () => {
      const db = createMockDb([
        {
          name: "Invoice",
          kind: "doc",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("Invoice", tenantId);

      expect(result).toBe("DOCUMENT");
    });

    it("should return undefined for unknown kind", async () => {
      const db = createMockDb([
        {
          name: "UnknownEntity",
          kind: "unknown",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("UnknownEntity", tenantId);

      expect(result).toBeUndefined();
    });

    it("should return undefined for null kind", async () => {
      const db = createMockDb([
        {
          name: "NullKind",
          kind: null,
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("NullKind", tenantId);

      expect(result).toBeUndefined();
    });
  });

  describe("2. Feature Flag Parsing with Defaults", () => {
    it("should parse complete feature flags correctly", async () => {
      const db = createMockDb([
        {
          name: "CompleteFlags",
          kind: "ent",
          feature_flags: {
            approval_required: true,
            numbering_enabled: true,
            effective_dating_enabled: true,
            versioning_mode: "major_minor",
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags(
        "CompleteFlags",
        tenantId,
      );

      expect(result).toEqual({
        entity_class: "CONTROL",
        approval_required: true,
        numbering_enabled: true,
        effective_dating_enabled: true,
        versioning_mode: "major_minor",
      });
    });

    it("should fill in defaults for partial feature flags", async () => {
      const db = createMockDb([
        {
          name: "PartialFlags",
          kind: "doc",
          feature_flags: {
            approval_required: true,
            // Other flags missing - should use defaults
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags(
        "PartialFlags",
        tenantId,
      );

      expect(result).toEqual({
        entity_class: "DOCUMENT",
        approval_required: true,
        numbering_enabled: false, // default
        effective_dating_enabled: false, // default
        versioning_mode: "none", // default
      });
    });

    it("should use defaults for null feature_flags", async () => {
      const db = createMockDb([
        {
          name: "NullFlags",
          kind: "ref",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags("NullFlags", tenantId);

      expect(result).toEqual({
        entity_class: "MASTER",
        approval_required: false,
        numbering_enabled: false,
        effective_dating_enabled: false,
        versioning_mode: "none",
      });
    });

    it("should use defaults for empty object feature_flags", async () => {
      const db = createMockDb([
        {
          name: "EmptyFlags",
          kind: "mdm",
          feature_flags: {},
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags("EmptyFlags", tenantId);

      expect(result).toEqual({
        entity_class: "MASTER",
        approval_required: false,
        numbering_enabled: false,
        effective_dating_enabled: false,
        versioning_mode: "none",
      });
    });

    it("should validate versioning_mode enum values", async () => {
      const db = createMockDb([
        {
          name: "InvalidVersioning",
          kind: "ent",
          feature_flags: {
            versioning_mode: "invalid_mode", // Invalid value
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags(
        "InvalidVersioning",
        tenantId,
      );

      // Should use default "none" for invalid versioning_mode
      expect(result.versioning_mode).toBe("none");
    });

    it("should handle non-boolean flag values by using defaults", async () => {
      const db = createMockDb([
        {
          name: "InvalidTypes",
          kind: "doc",
          feature_flags: {
            approval_required: "true", // String instead of boolean
            numbering_enabled: 1, // Number instead of boolean
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags(
        "InvalidTypes",
        tenantId,
      );

      // Should use defaults for non-boolean values
      expect(result.approval_required).toBe(false);
      expect(result.numbering_enabled).toBe(false);
    });

    it("should parse sequential versioning mode", async () => {
      const db = createMockDb([
        {
          name: "SequentialVersion",
          kind: "doc",
          feature_flags: {
            versioning_mode: "sequential",
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags(
        "SequentialVersion",
        tenantId,
      );

      expect(result.versioning_mode).toBe("sequential");
    });
  });

  describe("3. Missing Entity Returns Undefined Class + All-False Flags", () => {
    it("should return undefined class when entity not found", async () => {
      const db = createMockDb([]); // Empty database

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("NonExistent", tenantId);

      expect(result).toBeUndefined();
    });

    it("should return all-false defaults when entity not found", async () => {
      const db = createMockDb([]); // Empty database

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveFeatureFlags("NonExistent", tenantId);

      expect(result).toEqual({
        entity_class: undefined,
        approval_required: false,
        numbering_enabled: false,
        effective_dating_enabled: false,
        versioning_mode: "none",
      });
    });

    it("should return undefined for wrong tenant_id", async () => {
      const db = createMockDb([
        {
          name: "Entity1",
          kind: "ent",
          feature_flags: null,
          is_active: true,
          tenant_id: "different-tenant",
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("Entity1", tenantId);

      expect(result).toBeUndefined();
    });
  });

  describe("4. getClassification Returns Both Class + Flags", () => {
    it("should return both class and flags in single query", async () => {
      const db = createMockDb([
        {
          name: "CombinedEntity",
          kind: "doc",
          feature_flags: {
            approval_required: true,
            numbering_enabled: true,
            effective_dating_enabled: false,
            versioning_mode: "sequential",
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.getClassification(
        "CombinedEntity",
        tenantId,
      );

      expect(result.entityClass).toBe("DOCUMENT");
      expect(result.featureFlags).toEqual({
        entity_class: "DOCUMENT",
        approval_required: true,
        numbering_enabled: true,
        effective_dating_enabled: false,
        versioning_mode: "sequential",
      });
    });

    it("should handle missing entity in getClassification", async () => {
      const db = createMockDb([]); // Empty database

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.getClassification("NonExistent", tenantId);

      expect(result.entityClass).toBeUndefined();
      expect(result.featureFlags).toEqual({
        entity_class: undefined,
        approval_required: false,
        numbering_enabled: false,
        effective_dating_enabled: false,
        versioning_mode: "none",
      });
    });

    it("should handle entity with null kind in getClassification", async () => {
      const db = createMockDb([
        {
          name: "NullKindEntity",
          kind: null,
          feature_flags: { approval_required: true },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.getClassification(
        "NullKindEntity",
        tenantId,
      );

      expect(result.entityClass).toBeUndefined();
      expect(result.featureFlags.entity_class).toBeUndefined();
      expect(result.featureFlags.approval_required).toBe(true);
    });

    it("should call database only once for getClassification", async () => {
      const entities = [
        {
          name: "SingleQuery",
          kind: "ent",
          feature_flags: { approval_required: true },
          is_active: true,
          tenant_id: tenantId,
        },
      ];

      const db = createMockDb(entities);
      const selectFromSpy = vi.spyOn(db, "selectFrom");

      const service = new EntityClassificationServiceImpl(db);
      await service.getClassification("SingleQuery", tenantId);

      // Should call selectFrom only once
      expect(selectFromSpy).toHaveBeenCalledTimes(1);
      expect(selectFromSpy).toHaveBeenCalledWith("meta.entity");
    });
  });

  describe("5. Only Active Entities Are Resolved", () => {
    it("should not resolve inactive entities", async () => {
      const db = createMockDb([
        {
          name: "InactiveEntity",
          kind: "ent",
          feature_flags: null,
          is_active: false, // Inactive
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("InactiveEntity", tenantId);

      expect(result).toBeUndefined();
    });

    it("should not resolve inactive entities in getClassification", async () => {
      const db = createMockDb([
        {
          name: "InactiveEntity",
          kind: "doc",
          feature_flags: { approval_required: true },
          is_active: false, // Inactive
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.getClassification(
        "InactiveEntity",
        tenantId,
      );

      expect(result.entityClass).toBeUndefined();
      expect(result.featureFlags.entity_class).toBeUndefined();
      expect(result.featureFlags.approval_required).toBe(false); // Defaults
    });

    it("should resolve only active entities when multiple exist", async () => {
      const db = createMockDb([
        {
          name: "MultiEntity",
          kind: "ref",
          feature_flags: null,
          is_active: false, // Inactive
          tenant_id: tenantId,
        },
        {
          name: "MultiEntity",
          kind: "ent",
          feature_flags: { approval_required: true },
          is_active: true, // Active
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const result = await service.resolveClass("MultiEntity", tenantId);

      // Should resolve the active entity (ent → CONTROL)
      expect(result).toBe("CONTROL");
    });

    it("should filter by is_active=true in WHERE clause", async () => {
      const entities = [
        {
          name: "TestEntity",
          kind: "ent",
          feature_flags: null,
          is_active: true,
          tenant_id: tenantId,
        },
      ];

      const db = createMockDb(entities);
      const selectFromSpy = vi.spyOn(db, "selectFrom");

      const service = new EntityClassificationServiceImpl(db);
      await service.resolveClass("TestEntity", tenantId);

      // Verify selectFrom was called
      expect(selectFromSpy).toHaveBeenCalledWith("meta.entity");

      // Verify the query builder's where method was called with is_active = true
      const queryBuilder = selectFromSpy.mock.results[0].value;
      expect(queryBuilder.where).toHaveBeenCalledWith("is_active", "=", true);
    });
  });

  describe("6. Integration Scenarios", () => {
    it("should handle master data with full feature set", async () => {
      const db = createMockDb([
        {
          name: "Customer",
          kind: "mdm",
          feature_flags: {
            approval_required: true,
            numbering_enabled: false,
            effective_dating_enabled: true,
            versioning_mode: "major_minor",
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const { entityClass, featureFlags } = await service.getClassification(
        "Customer",
        tenantId,
      );

      expect(entityClass).toBe("MASTER");
      expect(featureFlags.entity_class).toBe("MASTER");
      expect(featureFlags.approval_required).toBe(true);
      expect(featureFlags.effective_dating_enabled).toBe(true);
      expect(featureFlags.versioning_mode).toBe("major_minor");
    });

    it("should handle control entity with minimal flags", async () => {
      const db = createMockDb([
        {
          name: "WorkflowTask",
          kind: "ent",
          feature_flags: {},
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const { entityClass, featureFlags } = await service.getClassification(
        "WorkflowTask",
        tenantId,
      );

      expect(entityClass).toBe("CONTROL");
      expect(featureFlags.entity_class).toBe("CONTROL");
      expect(featureFlags.approval_required).toBe(false);
      expect(featureFlags.numbering_enabled).toBe(false);
      expect(featureFlags.effective_dating_enabled).toBe(false);
      expect(featureFlags.versioning_mode).toBe("none");
    });

    it("should handle document with numbering enabled", async () => {
      const db = createMockDb([
        {
          name: "Invoice",
          kind: "doc",
          feature_flags: {
            approval_required: true,
            numbering_enabled: true,
            versioning_mode: "sequential",
          },
          is_active: true,
          tenant_id: tenantId,
        },
      ]);

      const service = new EntityClassificationServiceImpl(db);
      const { entityClass, featureFlags } = await service.getClassification(
        "Invoice",
        tenantId,
      );

      expect(entityClass).toBe("DOCUMENT");
      expect(featureFlags.numbering_enabled).toBe(true);
      expect(featureFlags.approval_required).toBe(true);
      expect(featureFlags.versioning_mode).toBe("sequential");
    });
  });
});
