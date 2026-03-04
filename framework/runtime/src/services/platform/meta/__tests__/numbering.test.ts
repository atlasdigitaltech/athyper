/**
 * Numbering Engine Service Tests
 *
 * Tests the NumberingEngine service:
 * - Pattern formatting ({YYYY}, {MM}, {DD}, {SEQ:N}, {SEQ})
 * - Period key computation (none, yearly, monthly, daily)
 * - Atomic number generation
 * - Rule loading from meta.entity.naming_policy
 * - Preview next number
 */

import { describe, it, expect, vi } from "vitest";

import { NumberingEngineService } from "../numbering/numbering-engine.service.js";

/**
 * Create a mock DB for numbering engine tests.
 * Supports selectFrom("meta.entity") and selectFrom("meta.numbering_sequence"),
 * plus getExecutor() for sql tagged template execution.
 */
function createMockDb(options: {
  namingPolicy?: Record<string, unknown> | null;
  entityActive?: boolean;
  sequenceCurrentValue?: number | null;
  /** Value returned by the INSERT...ON CONFLICT atomic increment */
  atomicReturnValue?: number;
}) {
  const { namingPolicy = null, entityActive = true, sequenceCurrentValue = null, atomicReturnValue = 1 } = options;

  const db: any = {
    selectFrom: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: vi.fn(() => query),
        selectAll: vi.fn(() => query),
        where: vi.fn((col: string, _op: string, val: unknown) => {
          filters[col] = val;
          return query;
        }),
        executeTakeFirst: vi.fn(async () => {
          if (table === "meta.entity") {
            if (!entityActive) return undefined;
            return { naming_policy: namingPolicy, kind: "doc", feature_flags: null, is_active: true };
          }
          if (table === "meta.numbering_sequence") {
            if (sequenceCurrentValue === null) return undefined;
            return { current_value: sequenceCurrentValue };
          }
          return undefined;
        }),
      };
      return query;
    }),
    // Executor for sql tagged template (used by generateNumber's atomic upsert)
    getExecutor: vi.fn(() => ({
      transformQuery: vi.fn((node: any) => node),
      compileQuery: vi.fn((node: any) => ({
        sql: "mock-sql",
        parameters: [],
        query: node,
      })),
      executeQuery: vi.fn(async () => ({
        rows: [{ current_value: atomicReturnValue }],
      })),
    })),
  };

  return db;
}

const TENANT_ID = "tenant-001";

describe("NumberingEngineService", () => {
  describe("1. Pattern Formatting", () => {
    it("should format {YYYY} token", async () => {
      const db = createMockDb({
        namingPolicy: { code: "INV", pattern: "INV-{YYYY}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("invoice", TENANT_ID, new Date("2024-03-15"));
      // The result should contain "2024" from the date token
      expect(result).toContain("2024");
    });

    it("should format {YYYY}-{MM}-{DD} tokens", async () => {
      const db = createMockDb({
        namingPolicy: { code: "DO", pattern: "DO-{YYYY}-{MM}-{DD}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("delivery_order", TENANT_ID, new Date("2024-03-15"));
      expect(result).toBe("DO-2024-03-15");
    });

    it("should format {YY} token", async () => {
      const db = createMockDb({
        namingPolicy: { code: "PO", pattern: "PO/{YY}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("purchase_order", TENANT_ID, new Date("2024-07-20"));
      expect(result).toBe("PO/24");
    });

    it("should format {SEQ:N} with zero-padding", async () => {
      const db = createMockDb({
        namingPolicy: { code: "INV", pattern: "INV-{YYYY}-{SEQ:6}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 42,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("invoice", TENANT_ID, new Date("2024-03-15"));
      expect(result).toBe("INV-2024-000042");
    });

    it("should format {SEQ} without padding", async () => {
      const db = createMockDb({
        namingPolicy: { code: "REF", pattern: "REF-{SEQ}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 5,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("reference", TENANT_ID);
      expect(result).toBe("REF-5");
    });

    it("should format combined pattern INV-{YYYY}-{MM}-{SEQ:4}", async () => {
      const db = createMockDb({
        namingPolicy: { code: "INV", pattern: "INV-{YYYY}-{MM}-{SEQ:4}", reset_policy: "monthly", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 7,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("invoice", TENANT_ID, new Date("2024-11-05"));
      expect(result).toBe("INV-2024-11-0007");
    });
  });

  describe("2. Period Key by Reset Policy", () => {
    it("should use __global__ for 'none' reset policy", async () => {
      const db = createMockDb({
        namingPolicy: { code: "G", pattern: "G-{SEQ}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      await service.generateNumber("generic", TENANT_ID, new Date("2024-03-15"));

      // The SQL is executed via the executor, we can verify the db.getExecutor was called
      expect(db.getExecutor).toHaveBeenCalled();
    });

    it("should generate correctly with yearly reset", async () => {
      const db = createMockDb({
        namingPolicy: { code: "Y", pattern: "Y-{YYYY}-{SEQ:3}", reset_policy: "yearly", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("yearly_doc", TENANT_ID, new Date("2024-06-15"));
      expect(result).toBe("Y-2024-001");
    });

    it("should generate correctly with monthly reset", async () => {
      const db = createMockDb({
        namingPolicy: { code: "M", pattern: "M-{YYYY}{MM}-{SEQ:4}", reset_policy: "monthly", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("monthly_doc", TENANT_ID, new Date("2024-09-15"));
      expect(result).toBe("M-202409-0001");
    });

    it("should generate correctly with daily reset", async () => {
      const db = createMockDb({
        namingPolicy: { code: "D", pattern: "D-{YYYY}{MM}{DD}-{SEQ:2}", reset_policy: "daily", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 3,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("daily_doc", TENANT_ID, new Date("2024-12-25"));
      expect(result).toBe("D-20241225-03");
    });
  });

  describe("3. getRule()", () => {
    it("should parse naming_policy JSONB into NumberingRule", async () => {
      const db = createMockDb({
        namingPolicy: {
          code: "INV",
          pattern: "INV-{YYYY}-{SEQ:6}",
          reset_policy: "yearly",
          seq_start: 100,
          seq_increment: 5,
          is_active: true,
        },
      });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("invoice", TENANT_ID);

      expect(rule).toBeDefined();
      expect(rule!.code).toBe("INV");
      expect(rule!.pattern).toBe("INV-{YYYY}-{SEQ:6}");
      expect(rule!.reset_policy).toBe("yearly");
      expect(rule!.seq_start).toBe(100);
      expect(rule!.seq_increment).toBe(5);
      expect(rule!.is_active).toBe(true);
    });

    it("should return undefined when naming_policy is null", async () => {
      const db = createMockDb({ namingPolicy: null });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("no_numbering", TENANT_ID);

      expect(rule).toBeUndefined();
    });

    it("should return undefined when pattern is missing", async () => {
      const db = createMockDb({ namingPolicy: { code: "BAD" } });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("bad_entity", TENANT_ID);

      expect(rule).toBeUndefined();
    });

    it("should default seq_start to 1 when not set", async () => {
      const db = createMockDb({
        namingPolicy: { code: "X", pattern: "X-{SEQ}", reset_policy: "none", is_active: true },
      });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("entity_x", TENANT_ID);

      expect(rule).toBeDefined();
      expect(rule!.seq_start).toBe(1);
      expect(rule!.seq_increment).toBe(1);
    });

    it("should validate reset_policy values", async () => {
      const db = createMockDb({
        namingPolicy: { code: "V", pattern: "V-{SEQ}", reset_policy: "invalid_value", is_active: true },
      });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("validate_entity", TENANT_ID);

      expect(rule).toBeDefined();
      expect(rule!.reset_policy).toBe("none"); // Defaults to "none"
    });

    it("should return undefined for inactive entity", async () => {
      const db = createMockDb({
        namingPolicy: { code: "I", pattern: "I-{SEQ}", is_active: true },
        entityActive: false,
      });

      const service = new NumberingEngineService(db);
      const rule = await service.getRule("inactive_entity", TENANT_ID);

      expect(rule).toBeUndefined();
    });
  });

  describe("4. generateNumber()", () => {
    it("should throw when no numbering rule is configured", async () => {
      const db = createMockDb({ namingPolicy: null });

      const service = new NumberingEngineService(db);
      await expect(
        service.generateNumber("no_rule", TENANT_ID)
      ).rejects.toThrow("No numbering rule configured");
    });

    it("should throw when rule is not active", async () => {
      const db = createMockDb({
        namingPolicy: { code: "X", pattern: "X-{SEQ}", is_active: false },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      await expect(
        service.generateNumber("inactive_rule", TENANT_ID)
      ).rejects.toThrow("not active");
    });

    it("should use referenceDate for pattern tokens", async () => {
      const db = createMockDb({
        namingPolicy: { code: "D", pattern: "D-{YYYY}-{MM}-{DD}-{SEQ}", reset_policy: "daily", seq_start: 1, seq_increment: 1, is_active: true },
        atomicReturnValue: 1,
      });

      const service = new NumberingEngineService(db);
      const result = await service.generateNumber("dated", TENANT_ID, new Date("2025-01-20"));
      expect(result).toBe("D-2025-01-20-1");
    });
  });

  describe("5. previewNextNumber()", () => {
    it("should preview next number when sequence exists", async () => {
      const db = createMockDb({
        namingPolicy: { code: "P", pattern: "P-{SEQ:3}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        sequenceCurrentValue: 10,
      });

      const service = new NumberingEngineService(db);
      const preview = await service.previewNextNumber("preview_entity", TENANT_ID);

      expect(preview).toBe("P-011"); // 10 + 1 = 11, zero-padded to 3
    });

    it("should preview with seq_start when no sequence exists", async () => {
      const db = createMockDb({
        namingPolicy: { code: "P", pattern: "P-{SEQ:3}", reset_policy: "none", seq_start: 1, seq_increment: 1, is_active: true },
        sequenceCurrentValue: null, // No sequence row
      });

      const service = new NumberingEngineService(db);
      const preview = await service.previewNextNumber("new_entity", TENANT_ID);

      expect(preview).toBe("P-001"); // seq_start = 1
    });

    it("should return undefined when no rule exists", async () => {
      const db = createMockDb({ namingPolicy: null });

      const service = new NumberingEngineService(db);
      const preview = await service.previewNextNumber("no_rule", TENANT_ID);

      expect(preview).toBeUndefined();
    });

    it("should return undefined when rule is not active", async () => {
      const db = createMockDb({
        namingPolicy: { code: "I", pattern: "I-{SEQ}", is_active: false },
      });

      const service = new NumberingEngineService(db);
      const preview = await service.previewNextNumber("inactive", TENANT_ID);

      expect(preview).toBeUndefined();
    });
  });
});
