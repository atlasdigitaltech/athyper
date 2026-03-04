import { describe, it, expect } from "vitest";

import {
  calculateShard,
  storageKeyForDocument,
  parseStorageKey,
  type DocumentKind,
} from "./storage-key-builder.js";

describe("storage-key-builder", () => {
  describe("calculateShard", () => {
    it("calculates deterministic shard from fileId", () => {
      const fileId = "550e8400-e29b-41d4-a716-446655440000";
      const shard1 = calculateShard(fileId);
      const shard2 = calculateShard(fileId);

      expect(shard1).toBe(shard2);
      expect(shard1).toBeGreaterThanOrEqual(0);
      expect(shard1).toBeLessThan(1000);
    });

    it("returns different shards for different fileIds", () => {
      const shards = new Set<number>();

      // Generate 1000 unique file IDs and calculate shards
      for (let i = 0; i < 1000; i++) {
        const fileId = `file-${i}-${Date.now()}-${Math.random()}`;
        const shard = calculateShard(fileId);
        shards.add(shard);
      }

      // Expect reasonable distribution (at least 50% unique shards)
      expect(shards.size).toBeGreaterThan(500);
    });

    it("pads shard to 3 digits in storage key", () => {
      const fileId = "test-file-id";
      const key = storageKeyForDocument({
        tenantId: "tenant-123",
        entity: "invoice",
        entityId: "inv-456",
        kind: "attachment",
        createdAt: new Date("2026-02-13T10:30:00Z"),
        fileId,
      });

      // Extract shard from key (8th segment)
      const shard = key.split("/")[7];
      expect(shard).toMatch(/^\d{3}$/);
    });
  });

  describe("storageKeyForDocument", () => {
    it("builds correct storage key with all components", () => {
      const key = storageKeyForDocument({
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        entity: "invoice",
        entityId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        kind: "attachment",
        createdAt: new Date("2026-02-13T10:30:00Z"),
        fileId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      });

      expect(key).toMatch(
        /^tenants\/550e8400-e29b-41d4-a716-446655440000\/invoice\/7c9e6679-7425-40de-944b-e07fc1f90ae7\/attachment\/2026\/02\/\d{3}\/a1b2c3d4-e5f6-7890-abcd-ef1234567890$/,
      );
    });

    it("formats month with leading zero", () => {
      const key = storageKeyForDocument({
        tenantId: "tenant-123",
        entity: "customer",
        entityId: "cust-456",
        kind: "avatar",
        createdAt: new Date("2026-01-15T00:00:00Z"), // January
        fileId: "file-789",
      });

      expect(key).toContain("/2026/01/");
    });

    it("handles different document kinds correctly", () => {
      const kinds: DocumentKind[] = [
        "attachment",
        "generated",
        "export",
        "template",
        "letterhead",
        "avatar",
      ];

      kinds.forEach((kind) => {
        const key = storageKeyForDocument({
          tenantId: "tenant-123",
          entity: "entity-type",
          entityId: "entity-id",
          kind,
          createdAt: new Date("2026-02-13"),
          fileId: "file-id",
        });

        expect(key).toContain(`/${kind}/`);
      });
    });

    it("maintains tenant isolation in path structure", () => {
      const tenantId1 = "tenant-aaa";
      const tenantId2 = "tenant-bbb";

      const key1 = storageKeyForDocument({
        tenantId: tenantId1,
        entity: "invoice",
        entityId: "inv-123",
        kind: "attachment",
        createdAt: new Date("2026-02-13"),
        fileId: "file-id",
      });

      const key2 = storageKeyForDocument({
        tenantId: tenantId2,
        entity: "invoice",
        entityId: "inv-123",
        kind: "attachment",
        createdAt: new Date("2026-02-13"),
        fileId: "file-id",
      });

      expect(key1).toContain(`tenants/${tenantId1}/`);
      expect(key2).toContain(`tenants/${tenantId2}/`);
      expect(key1).not.toBe(key2);
    });
  });

  describe("parseStorageKey", () => {
    it("correctly parses valid storage key", () => {
      const originalParams = {
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        entity: "invoice",
        entityId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        kind: "attachment" as DocumentKind,
        createdAt: new Date("2026-02-13T00:00:00Z"),
        fileId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      };

      const key = storageKeyForDocument(originalParams);
      const parsed = parseStorageKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.tenantId).toBe(originalParams.tenantId);
      expect(parsed?.entity).toBe(originalParams.entity);
      expect(parsed?.entityId).toBe(originalParams.entityId);
      expect(parsed?.kind).toBe(originalParams.kind);
      expect(parsed?.fileId).toBe(originalParams.fileId);
      // createdAt will be normalized to first day of month
      expect(parsed?.createdAt.getUTCFullYear()).toBe(2026);
      expect(parsed?.createdAt.getUTCMonth()).toBe(1); // February (0-indexed)
    });

    it("returns null for invalid key with wrong segment count", () => {
      const invalidKey = "tenants/tenant-123/invoice";
      const parsed = parseStorageKey(invalidKey);

      expect(parsed).toBeNull();
    });

    it("returns null for key not starting with 'tenants'", () => {
      const invalidKey =
        "files/tenant-123/invoice/inv-123/attachment/2026/02/123/file-id";
      const parsed = parseStorageKey(invalidKey);

      expect(parsed).toBeNull();
    });

    it("returns null for invalid document kind", () => {
      const invalidKey =
        "tenants/tenant-123/invoice/inv-123/invalid_kind/2026/02/123/file-id";
      const parsed = parseStorageKey(invalidKey);

      expect(parsed).toBeNull();
    });

    it("handles all valid document kinds", () => {
      const kinds: DocumentKind[] = [
        "attachment",
        "generated",
        "export",
        "template",
        "letterhead",
        "avatar",
        "signature",
        "certificate",
        "invoice",
        "receipt",
        "contract",
        "report",
      ];

      kinds.forEach((kind) => {
        const key = `tenants/tenant-123/entity/entity-id/${kind}/2026/02/123/file-id`;
        const parsed = parseStorageKey(key);

        expect(parsed).not.toBeNull();
        expect(parsed?.kind).toBe(kind);
      });
    });
  });
});
