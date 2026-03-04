/**
 * Audit Feature Flags Tests
 */
import { describe, it, expect, vi } from "vitest";

import {
  AuditFeatureFlagResolver,
  createAuditFeatureFlagResolver,
} from "../domain/audit-feature-flags.js";

import type { AuditFeatureFlags } from "../domain/audit-feature-flags.js";

const DEFAULTS: AuditFeatureFlags = {
  writeMode: "outbox",
  hashChainEnabled: true,
  timelineEnabled: true,
  encryptionEnabled: false,
};

function createResolver(
  dbRows: Array<{ flag_key: string; is_enabled: boolean; config: any }> = [],
  opts?: { cacheTtlMs?: number },
) {
  const mockDb = {
    selectFrom: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue(dbRows),
          }),
        }),
      }),
    }),
  } as any;

  return createAuditFeatureFlagResolver(mockDb, {
    defaults: { ...DEFAULTS },
    cacheTtlMs: opts?.cacheTtlMs,
  });
}

describe("AuditFeatureFlagResolver", () => {
  describe("resolve", () => {
    it("should return defaults when no DB overrides exist", async () => {
      const resolver = createResolver([]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("outbox");
      expect(flags.hashChainEnabled).toBe(true);
      expect(flags.timelineEnabled).toBe(true);
      expect(flags.encryptionEnabled).toBe(false);
    });

    it("should return defaults when DB is null", async () => {
      const resolver = createAuditFeatureFlagResolver(null, {
        defaults: { ...DEFAULTS },
      });
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("outbox");
      expect(flags.hashChainEnabled).toBe(true);
    });

    it("should override writeMode from DB", async () => {
      const resolver = createResolver([
        {
          flag_key: "AUDIT_WRITE_MODE",
          is_enabled: true,
          config: JSON.stringify({ mode: "sync" }),
        },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("sync");
    });

    it("should override writeMode to off when is_enabled is false", async () => {
      const resolver = createResolver([
        {
          flag_key: "AUDIT_WRITE_MODE",
          is_enabled: false,
          config: JSON.stringify({}),
        },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("off");
    });

    it("should override hashChainEnabled from DB", async () => {
      const resolver = createResolver([
        { flag_key: "AUDIT_HASHCHAIN", is_enabled: false, config: null },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.hashChainEnabled).toBe(false);
    });

    it("should override timelineEnabled from DB", async () => {
      const resolver = createResolver([
        { flag_key: "AUDIT_TIMELINE", is_enabled: false, config: null },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.timelineEnabled).toBe(false);
    });

    it("should override encryptionEnabled from DB", async () => {
      const resolver = createResolver([
        { flag_key: "AUDIT_ENCRYPTION", is_enabled: true, config: null },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.encryptionEnabled).toBe(true);
    });

    it("should apply multiple DB overrides", async () => {
      const resolver = createResolver([
        {
          flag_key: "AUDIT_WRITE_MODE",
          is_enabled: true,
          config: JSON.stringify({ mode: "off" }),
        },
        { flag_key: "AUDIT_HASHCHAIN", is_enabled: false, config: null },
        { flag_key: "AUDIT_TIMELINE", is_enabled: false, config: null },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("off");
      expect(flags.hashChainEnabled).toBe(false);
      expect(flags.timelineEnabled).toBe(false);
    });

    it("should ignore invalid writeMode values", async () => {
      const resolver = createResolver([
        {
          flag_key: "AUDIT_WRITE_MODE",
          is_enabled: true,
          config: JSON.stringify({ mode: "invalid" }),
        },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("outbox"); // keeps default
    });
  });

  describe("caching", () => {
    it("should cache results within TTL", async () => {
      const dbRows = [
        { flag_key: "AUDIT_HASHCHAIN", is_enabled: false, config: null },
      ];

      const mockExecute = vi.fn().mockResolvedValue(dbRows);
      const mockDb = {
        selectFrom: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                execute: mockExecute,
              }),
            }),
          }),
        }),
      } as any;

      const resolver = new AuditFeatureFlagResolver(mockDb, {
        defaults: { ...DEFAULTS },
        cacheTtlMs: 60_000, // 60s
      });

      const flags1 = await resolver.resolve("tenant-1");
      const flags2 = await resolver.resolve("tenant-1");

      expect(flags1.hashChainEnabled).toBe(false);
      expect(flags2.hashChainEnabled).toBe(false);
      // DB should only be queried once due to caching
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it("should invalidate cache for specific tenant", async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockDb = {
        selectFrom: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                execute: mockExecute,
              }),
            }),
          }),
        }),
      } as any;

      const resolver = new AuditFeatureFlagResolver(mockDb, {
        defaults: { ...DEFAULTS },
        cacheTtlMs: 60_000,
      });

      await resolver.resolve("tenant-1");
      expect(mockExecute).toHaveBeenCalledTimes(1);

      resolver.invalidateCache("tenant-1");
      await resolver.resolve("tenant-1");
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it("should invalidate all cached entries", async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockDb = {
        selectFrom: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                execute: mockExecute,
              }),
            }),
          }),
        }),
      } as any;

      const resolver = new AuditFeatureFlagResolver(mockDb, {
        defaults: { ...DEFAULTS },
        cacheTtlMs: 60_000,
      });

      await resolver.resolve("tenant-1");
      await resolver.resolve("tenant-2");
      expect(mockExecute).toHaveBeenCalledTimes(2);

      resolver.invalidateAll();
      await resolver.resolve("tenant-1");
      await resolver.resolve("tenant-2");
      expect(mockExecute).toHaveBeenCalledTimes(4);
    });
  });

  describe("error handling", () => {
    it("should fall back to defaults on DB error", async () => {
      const mockDb = {
        selectFrom: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                execute: vi.fn().mockRejectedValue(new Error("DB down")),
              }),
            }),
          }),
        }),
      } as any;

      const resolver = new AuditFeatureFlagResolver(mockDb, {
        defaults: { ...DEFAULTS },
      });

      const flags = await resolver.resolve("tenant-1");
      expect(flags.writeMode).toBe("outbox");
      expect(flags.hashChainEnabled).toBe(true);
    });

    it("should handle config as already-parsed JSON object", async () => {
      const resolver = createResolver([
        {
          flag_key: "AUDIT_WRITE_MODE",
          is_enabled: true,
          config: { mode: "sync" },
        },
      ]);
      const flags = await resolver.resolve("tenant-1");

      expect(flags.writeMode).toBe("sync");
    });
  });

  describe("getDefaults", () => {
    it("should return a copy of defaults", () => {
      const resolver = createAuditFeatureFlagResolver(null, {
        defaults: { ...DEFAULTS },
      });
      const d1 = resolver.getDefaults();
      const d2 = resolver.getDefaults();

      expect(d1).toEqual(DEFAULTS);
      expect(d1).not.toBe(d2); // different object references
    });
  });
});
