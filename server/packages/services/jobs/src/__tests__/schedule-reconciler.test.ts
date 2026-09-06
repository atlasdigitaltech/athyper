import type { GovernedScheduleRecord, JobScheduler } from "@athyper/server-contract-jobs";
import { describe, expect, it, vi } from "vitest";

import { createJobDefinitionCatalog, createJobScheduleReconciler } from "../index.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const catalog = createJobDefinitionCatalog([{
  code: "reports.generate",
  owner: "reports",
  queue: "reports",
  name: "generate",
  scope: "plane",
  payloadSchema: { name: "reports.generate", version: 1 },
}]);

function record(id: string, overrides: Partial<GovernedScheduleRecord> = {}): GovernedScheduleRecord {
  return {
    id,
    planeKey: "neon",
    tenantId: `tenant-${id}`,
    code: "daily",
    handlerType: "reports.generate",
    definition: {
      // A legacy repository's ID must not determine the canonical identity.
      scheduleId: "daily",
      queue: "reports",
      name: "generate",
      data: { tenantId: `tenant-${id}` },
      pattern: { kind: "interval", everyMs: 60_000 },
    },
    ...overrides,
  };
}

function harness(initial: GovernedScheduleRecord[]) {
  let records = initial;
  const registered = new Map<string, string>([["neon:daily", "old-reports"]]);
  const upsert = vi.fn<JobScheduler["upsert"]>(async (definition) => {
    registered.set(definition.scheduleId, definition.queue);
  });
  const remove = vi.fn<JobScheduler["remove"]>(async (id) => registered.delete(id));
  const markReconciled = vi.fn(async () => undefined);
  const options = {
    planes: ["neon", "mesh"] as const,
    catalog,
    scheduler: { upsert, remove, listScheduleIds: async () => [...registered.keys()] },
    repository: {
      listActive: async (planeKey: string) => records.filter((value) => value.planeKey === planeKey),
      markReconciled,
    },
  };
  return {
    registered, upsert, remove, markReconciled,
    setRecords: (value: GovernedScheduleRecord[]) => { records = value; },
    restart: () => createJobScheduleReconciler(options),
  };
}

describe("governed schedule identity migration", () => {
  it("keeps same-code tenants and planes distinct and removes their shared legacy ID once", async () => {
    const test = harness([record(firstId), record(secondId), record(firstId, { planeKey: "mesh" })]);
    test.registered.set("mesh:daily", "reports");
    test.registered.set("code-owned-maintenance", "maintenance");
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 3, removed: 2 });
    expect([...test.registered.keys()].sort()).toEqual([
      "code-owned-maintenance", `mesh:${firstId}`, `neon:${firstId}`, `neon:${secondId}`,
    ].sort());
    expect(test.upsert.mock.calls[0]?.[0].data).toEqual({ tenantId: `tenant-${firstId}` });
    expect(test.upsert.mock.calls[1]?.[0].data).toEqual({ tenantId: `tenant-${secondId}` });
    expect(test.remove.mock.calls.filter(([id]) => id === "neon:daily")).toHaveLength(1);
    expect(Math.max(...test.upsert.mock.invocationCallOrder)).toBeLessThan(Math.min(...test.remove.mock.invocationCallOrder));
    expect(test.markReconciled).toHaveBeenCalledTimes(3);
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 3, removed: 0 });
  });

  it("keeps identity on rename and removes only the deactivated tenant's registration", async () => {
    const test = harness([record(firstId), record(secondId)]);
    const reconciler = test.restart();
    await reconciler.reconcile();
    test.setRecords([record(firstId, { code: "renamed" }), record(secondId)]);
    await expect(reconciler.reconcile()).resolves.toEqual({ upserted: 2, removed: 0 });
    expect([...test.registered.keys()].sort()).toEqual([`neon:${firstId}`, `neon:${secondId}`]);
    test.setRecords([record(secondId)]);
    await expect(reconciler.reconcile()).resolves.toEqual({ upserted: 1, removed: 1 });
    expect([...test.registered.keys()]).toEqual([`neon:${secondId}`]);
  });

  it("preserves the legacy registration when a replacement fails and retries after restart", async () => {
    const test = harness([record(firstId), record(secondId)]);
    test.upsert.mockImplementationOnce(async (definition) => { test.registered.set(definition.scheduleId, definition.queue); });
    test.upsert.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(test.restart().reconcile()).rejects.toThrow("Redis unavailable");
    expect(test.registered.get("neon:daily")).toBe("old-reports");
    expect(test.remove).not.toHaveBeenCalled();
    expect(test.markReconciled).not.toHaveBeenCalled();
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 2, removed: 1 });
    expect([...test.registered.keys()].sort()).toEqual([`neon:${firstId}`, `neon:${secondId}`]);
  });

  it("retries failed legacy cleanup after restart before marking migration reconciled", async () => {
    const test = harness([record(firstId)]);
    test.remove.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(test.restart().reconcile()).rejects.toThrow("Redis unavailable");
    expect(test.registered.has("neon:daily")).toBe(true);
    expect(test.markReconciled).not.toHaveBeenCalled();
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 1, removed: 1 });
    expect([...test.registered.keys()]).toEqual([`neon:${firstId}`]);
  });

  it("removes a schedule deactivated while the reconciler was stopped", async () => {
    const test = harness([record(firstId), record(secondId)]);
    await test.restart().reconcile();
    test.setRecords([record(secondId)]);
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 1, removed: 1 });
    expect([...test.registered.keys()]).toEqual([`neon:${secondId}`]);
  });

  it("cleans renamed legacy IDs and inactive UUIDs without touching other planes or code-owned jobs", async () => {
    const test = harness([]);
    test.registered.set("neon:old-name", "old-queue");
    test.registered.set(`neon:${firstId}`, "reports");
    test.registered.set(`studio:${firstId}`, "reports");
    test.registered.set("code-owned-maintenance", "maintenance");
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 0, removed: 3 });
    expect([...test.registered.keys()].sort()).toEqual(["code-owned-maintenance", `studio:${firstId}`]);
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 0, removed: 0 });
  });

  it("rediscovers failed stale removals from the durable inventory after restart", async () => {
    const test = harness([]);
    test.remove.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(test.restart().reconcile()).rejects.toThrow("Redis unavailable");
    expect(test.registered.has("neon:daily")).toBe(true);
    await expect(test.restart().reconcile()).resolves.toEqual({ upserted: 0, removed: 1 });
    expect(test.registered.size).toBe(0);
  });

  it("does not delete registrations when the database inventory cannot be read", async () => {
    const remove = vi.fn();
    const reconciler = createJobScheduleReconciler({
      planes: ["neon"], catalog,
      scheduler: { upsert: vi.fn(), remove, listScheduleIds: async () => [`neon:${firstId}`] },
      repository: { listActive: async () => { throw new Error("Database unavailable"); }, markReconciled: vi.fn() },
    });
    await expect(reconciler.reconcile()).rejects.toThrow("Database unavailable");
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects duplicate database identities before mutating any registration", async () => {
    const test = harness([record(firstId), record(firstId)]);
    await expect(test.restart().reconcile()).rejects.toThrow(`Duplicate governed schedule: neon:${firstId}`);
    expect(test.upsert).not.toHaveBeenCalled();
    expect(test.remove).not.toHaveBeenCalled();
  });
});
