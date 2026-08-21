import { describe, expect, it, vi } from "vitest";

import { KyselyEntityDescriptorRepository } from "../repositories/entity-descriptor.repository.js";

function queryReturning(row: Record<string, unknown> | undefined) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "where"]) chain[method] = vi.fn(() => chain);
  chain["executeTakeFirst"] = vi.fn(async () => row);
  return chain;
}

describe("descriptor-native record identity resolution", () => {
  it("resolves UUID-shaped values through the declared primary key and scope", async () => {
    const get = vi.fn(async () => ({
      descriptor: {
        identity: { entityCode: "supplier" },
        storage: { schema: "master", table: "supplier", primaryKey: "supplier_id", tenantColumn: "tenant_id" },
        read: { naturalKeyFields: [] },
        fields: new Map(),
      },
    }));
    const query = queryReturning({ supplier_id: "11111111-1111-4111-8111-111111111111" });
    const db = { selectFrom: vi.fn(() => query) };
    const repository = new KyselyEntityDescriptorRepository(db as never, { get } as never);

    await expect(repository.resolveRecordId(
      "supplier", "11111111-1111-4111-8111-111111111111", "tenant-1", "neon",
    )).resolves.toBe("11111111-1111-4111-8111-111111111111");
    expect(get).toHaveBeenCalledOnce();
    expect(query["where"]).toHaveBeenCalledWith("tenant_id", "=", "tenant-1");
  });

  it("uses the execution descriptor for natural keys without control-plane SQL", async () => {
    const get = vi.fn(async () => ({
      descriptor: {
        identity: { entityCode: "supplier" },
        storage: { schema: "master", table: "supplier", primaryKey: "supplier_id", tenantColumn: "tenant_id" },
        read: { naturalKeyFields: ["supplier_code"] },
        fields: new Map([["supplier_code", { column: "code" }]]),
      },
    }));
    const query = queryReturning({ supplier_id: "record-1" });
    const db = { selectFrom: vi.fn(() => query) };
    const repository = new KyselyEntityDescriptorRepository(db as never, { get } as never);

    await expect(repository.resolveRecordId("supplier", "SUP-001", "tenant-1", "neon"))
      .resolves.toBe("record-1");
    expect(get).toHaveBeenCalledOnce();
    expect(db.selectFrom).toHaveBeenCalledWith("master.supplier");
    expect(query["select"]).toHaveBeenCalledWith("supplier_id");
    expect(query["where"]).toHaveBeenCalledWith("tenant_id", "=", "tenant-1");
  });
});
