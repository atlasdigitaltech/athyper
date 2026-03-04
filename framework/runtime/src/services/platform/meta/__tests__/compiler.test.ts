/**
 * META Compiler Service Tests
 *
 * Tests schema validation, compilation pipeline, Redis caching,
 * compilation diagnostics, and health checks.
 */

import { describe, it, expect, vi } from "vitest";

import { MetaCompilerService } from "../core/compiler.service.js";

import type { EntitySchema, FieldDefinition } from "@athyper/core/meta";

// ============================================================================
// Test Helpers
// ============================================================================

/** System fields every entity must include (hard invariant). */
const SYSTEM_FIELDS: FieldDefinition[] = [
  { name: "id", type: "uuid", required: true },
  { name: "tenant_id", type: "uuid", required: true },
  { name: "realm_id", type: "string", required: true },
  { name: "created_at", type: "datetime", required: true },
  { name: "created_by", type: "string", required: true },
  { name: "updated_at", type: "datetime", required: true },
  { name: "updated_by", type: "string", required: true },
  { name: "deleted_at", type: "datetime", required: false },
  { name: "deleted_by", type: "string", required: false },
  { name: "version", type: "number", required: true },
];

function makeSchema(
  userFields: Partial<FieldDefinition>[] = [],
  policies: EntitySchema["policies"] = [],
): EntitySchema {
  const fields: FieldDefinition[] = [
    ...SYSTEM_FIELDS,
    ...userFields.map((f) => ({
      name: f.name ?? "untitled",
      type: f.type ?? "string",
      required: f.required ?? false,
      ...f,
    })),
  ] as FieldDefinition[];

  return {
    fields,
    policies: policies ?? [],
    metadata: { description: "test entity" },
  } as EntitySchema;
}

function createMockCache() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    ping: vi.fn(async () => "PONG"),
    _store: store,
  };
}

function createMockRegistry(versionData?: { schema: EntitySchema; createdBy: string }) {
  return {
    getVersion: vi.fn(async () => versionData ?? null),
    listEntities: vi.fn(async () => ({ data: [] })),
  };
}

function buildCompiler(
  opts: {
    versionData?: { schema: EntitySchema; createdBy: string };
    enableCache?: boolean;
  } = {},
) {
  const cache = createMockCache();
  const registry = createMockRegistry(opts.versionData);
  const compiler = new MetaCompilerService(registry as any, {
    cache: cache as any,
    cacheTTL: 300,
    enableCache: opts.enableCache ?? true,
  });
  return { compiler, cache, registry };
}

// ============================================================================
// Tests
// ============================================================================

describe("MetaCompilerService", () => {
  // --------------------------------------------------------------------------
  // validate()
  // --------------------------------------------------------------------------

  describe("validate()", () => {
    it("should pass validation for a valid schema", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([{ name: "title", type: "string" }]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject schema with no fields", async () => {
      const { compiler } = buildCompiler();
      const schema = { fields: [], policies: [], metadata: {} } as any;
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "SCHEMA_NO_FIELDS" }),
        ]),
      );
    });

    it("should reject missing system fields", async () => {
      const { compiler } = buildCompiler();
      const schema = {
        fields: [{ name: "title", type: "string", required: false }],
        policies: [],
        metadata: {},
      } as any;
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      const codes = (result.errors ?? []).map((e: any) => e.code);
      expect(codes).toContain("MISSING_SYSTEM_FIELD");
    });

    it("should reject invalid field name", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([{ name: "123bad", type: "string" }]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_FIELD_NAME" }),
        ]),
      );
    });

    it("should reject invalid field type", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([{ name: "foo", type: "invalid_type" as any }]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_FIELD_TYPE" }),
        ]),
      );
    });

    it("should reject reference field without referenceTo", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([{ name: "parentId", type: "reference" }]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "MISSING_REFERENCE_TO" }),
        ]),
      );
    });

    it("should reject enum field without values", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([{ name: "status", type: "enum" }]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "MISSING_ENUM_VALUES" }),
        ]),
      );
    });

    it("should reject string minLength > maxLength", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([
        { name: "code", type: "string", minLength: 10, maxLength: 5 } as any,
      ]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_LENGTH_RANGE" }),
        ]),
      );
    });

    it("should reject number min > max", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([
        { name: "score", type: "number", min: 100, max: 10 } as any,
      ]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_NUMBER_RANGE" }),
        ]),
      );
    });

    it("should reject duplicate field names", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema([
        { name: "title", type: "string" },
        { name: "title", type: "string" },
      ]);
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_FIELD_NAME" }),
        ]),
      );
    });

    it("should reject policy with missing name", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema(
        [{ name: "title", type: "string" }],
        [{ name: "", effect: "allow", action: "read" } as any],
      );
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "MISSING_POLICY_NAME" }),
        ]),
      );
    });

    it("should reject policy with invalid effect", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema(
        [{ name: "title", type: "string" }],
        [{ name: "p1", effect: "maybe" as any, action: "read" } as any],
      );
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_POLICY_EFFECT" }),
        ]),
      );
    });

    it("should reject policy with invalid action", async () => {
      const { compiler } = buildCompiler();
      const schema = makeSchema(
        [{ name: "title", type: "string" }],
        [{ name: "p1", effect: "allow", action: "execute" as any } as any],
      );
      const result = await compiler.validate(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_POLICY_ACTION" }),
        ]),
      );
    });
  });

  // --------------------------------------------------------------------------
  // compile() + caching
  // --------------------------------------------------------------------------

  describe("compile()", () => {
    const validSchema = makeSchema(
      [{ name: "title", type: "string" }],
      [{ name: "readAll", effect: "allow", action: "read", resource: "test_entity" }],
    );

    it("should compile and cache on cache miss", async () => {
      const { compiler, cache } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
      });

      const result = await compiler.compile("test_entity", "v1");

      expect(result.entityName).toBe("test_entity");
      expect(result.version).toBe("v1");
      expect(result.tableName).toBe("ent_test_entity");
      expect(result.fields.length).toBeGreaterThan(0);
      expect(cache.setex).toHaveBeenCalled();
    });

    it("should return cached model on cache hit", async () => {
      const { compiler, cache, registry } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
      });

      // First call — populates cache
      await compiler.compile("test_entity", "v1");
      registry.getVersion.mockClear();

      // Second call — should use cache
      const result = await compiler.compile("test_entity", "v1");

      expect(result.entityName).toBe("test_entity");
      // Registry should NOT be called again (cache hit)
      expect(registry.getVersion).not.toHaveBeenCalled();
    });

    it("should skip cache when enableCache is false", async () => {
      const { compiler, cache } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
        enableCache: false,
      });

      await compiler.compile("test_entity", "v1");

      expect(cache.get).not.toHaveBeenCalled();
      // Still compiles, just doesn't cache
      expect(cache.setex).not.toHaveBeenCalled();
    });

    it("should throw when entity version not found", async () => {
      const { compiler } = buildCompiler(); // no versionData → returns null

      await expect(compiler.compile("missing", "v1")).rejects.toThrow(
        "Entity version not found",
      );
    });

    it("should throw when schema validation fails", async () => {
      const badSchema = { fields: [], policies: [], metadata: {} } as any;
      const { compiler } = buildCompiler({
        versionData: { schema: badSchema, createdBy: "admin" },
      });

      await expect(compiler.compile("bad", "v1")).rejects.toThrow(
        "Schema validation failed",
      );
    });
  });

  // --------------------------------------------------------------------------
  // recompile()
  // --------------------------------------------------------------------------

  describe("recompile()", () => {
    it("should invalidate cache then compile fresh", async () => {
      const validSchema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler, cache } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
      });

      const result = await compiler.recompile("test_entity", "v1");

      expect(cache.del).toHaveBeenCalledWith("meta:compiled:test_entity:v1");
      expect(result.entityName).toBe("test_entity");
    });
  });

  // --------------------------------------------------------------------------
  // invalidateCache()
  // --------------------------------------------------------------------------

  describe("invalidateCache()", () => {
    it("should delete the cache key", async () => {
      const { compiler, cache } = buildCompiler();

      await compiler.invalidateCache("my_entity", "v2");

      expect(cache.del).toHaveBeenCalledWith("meta:compiled:my_entity:v2");
    });
  });

  // --------------------------------------------------------------------------
  // getCached()
  // --------------------------------------------------------------------------

  describe("getCached()", () => {
    it("should return undefined on cache miss", async () => {
      const { compiler } = buildCompiler();

      const result = await compiler.getCached("missing", "v1");
      expect(result).toBeUndefined();
    });

    it("should handle corrupt cache data gracefully", async () => {
      const { compiler, cache } = buildCompiler();
      cache._store.set("meta:compiled:bad:v1", "not-valid-json{{{");

      const result = await compiler.getCached("bad", "v1");

      expect(result).toBeUndefined();
      // Should delete corrupt entry
      expect(cache.del).toHaveBeenCalledWith("meta:compiled:bad:v1");
    });

    it("should return undefined when cache disabled", async () => {
      const { compiler } = buildCompiler({ enableCache: false });

      const result = await compiler.getCached("any", "v1");
      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // healthCheck()
  // --------------------------------------------------------------------------

  describe("healthCheck()", () => {
    it("should return healthy when Redis responds", async () => {
      const { compiler } = buildCompiler();

      const result = await compiler.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.message).toContain("healthy");
    });

    it("should return unhealthy when Redis fails", async () => {
      const { compiler, cache } = buildCompiler();
      cache.ping.mockRejectedValue(new Error("Connection refused"));

      const result = await compiler.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.message).toContain("unhealthy");
    });
  });

  // --------------------------------------------------------------------------
  // precompileAll()
  // --------------------------------------------------------------------------

  describe("precompileAll()", () => {
    it("should compile all active entities", async () => {
      const validSchema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler, registry } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
      });

      registry.listEntities.mockResolvedValue({
        data: [
          { name: "entity_a", activeVersion: "v1" },
          { name: "entity_b", activeVersion: "v1" },
        ],
      });

      const results = await compiler.precompileAll();

      expect(results.length).toBe(2);
    });

    it("should skip entities without active version", async () => {
      const validSchema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler, registry } = buildCompiler({
        versionData: { schema: validSchema, createdBy: "admin" },
      });

      registry.listEntities.mockResolvedValue({
        data: [
          { name: "entity_a", activeVersion: "v1" },
          { name: "entity_b", activeVersion: null },
        ],
      });

      const results = await compiler.precompileAll();

      expect(results.length).toBe(1);
    });

    it("should skip entities that fail compilation", async () => {
      const { compiler, registry } = buildCompiler();

      registry.listEntities.mockResolvedValue({
        data: [
          { name: "broken", activeVersion: "v1" },
        ],
      });
      // getVersion returns null → throws "not found"

      const results = await compiler.precompileAll();

      expect(results.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Compiled model structure
  // --------------------------------------------------------------------------

  describe("compiled model structure", () => {
    it("should produce correct table name (snake_case with ent_ prefix)", async () => {
      const schema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler } = buildCompiler({
        versionData: { schema, createdBy: "admin" },
      });

      const result = await compiler.compile("purchaseOrder", "v1");

      expect(result.tableName).toBe("ent_purchase_order");
    });

    it("should compile fields with column names in snake_case", async () => {
      const schema = makeSchema([
        { name: "firstName", type: "string" },
        { name: "emailAddress", type: "string" },
      ]);
      const { compiler } = buildCompiler({
        versionData: { schema, createdBy: "admin" },
      });

      const result = await compiler.compile("user", "v1");

      const firstNameField = result.fields.find((f) => f.name === "firstName");
      expect(firstNameField).toBeDefined();
      expect(firstNameField!.columnName).toBe("first_name");

      const emailField = result.fields.find((f) => f.name === "emailAddress");
      expect(emailField).toBeDefined();
      expect(emailField!.columnName).toBe("email_address");
    });

    it("should include inputHash and outputHash", async () => {
      const schema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler } = buildCompiler({
        versionData: { schema, createdBy: "admin" },
      });

      const result = await compiler.compile("test", "v1");

      expect(result.inputHash).toBeDefined();
      expect(result.inputHash.length).toBe(64); // SHA-256 hex
      expect(result.outputHash).toBeDefined();
      expect(result.outputHash!.length).toBe(64);
    });

    it("should produce deterministic hashes for same input", async () => {
      const schema = makeSchema([{ name: "title", type: "string" }]);
      const { compiler } = buildCompiler({
        versionData: { schema, createdBy: "admin" },
        enableCache: false,
      });

      const r1 = await compiler.compile("test", "v1");
      const r2 = await compiler.compile("test", "v1");

      expect(r1.inputHash).toBe(r2.inputHash);
    });

    it("should compile policies with evaluate function", async () => {
      const schema = makeSchema(
        [{ name: "title", type: "string" }],
        [{ name: "readAll", effect: "allow", action: "read", resource: "test" }],
      );
      const { compiler } = buildCompiler({
        versionData: { schema, createdBy: "admin" },
      });

      const result = await compiler.compile("test", "v1");

      expect(result.policies.length).toBe(1);
      expect(result.policies[0].name).toBe("readAll");
      expect(typeof result.policies[0].evaluate).toBe("function");
      expect(
        result.policies[0].evaluate({ action: "read", resource: "test" }),
      ).toBe(true);
      expect(
        result.policies[0].evaluate({ action: "delete", resource: "test" }),
      ).toBe(false);
    });
  });
});
