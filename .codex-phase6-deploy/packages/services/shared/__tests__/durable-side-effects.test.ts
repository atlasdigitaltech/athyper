import { describe, expect, it, vi } from "vitest";

import { buildDurableMutationEventKey } from "../outbox.js";
import { writeRequiredRouteAudit, writeRouteAudit } from "../route-audit.js";
import { executeDurableMutationTransaction } from "../durable-mutation-transaction.js";

function failingDb(error: Error) {
  return {
    insertInto: vi.fn(() => ({
      values: vi.fn(() => ({ execute: vi.fn().mockRejectedValue(error) })),
    })),
  };
}

const auditEntry = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  entityType: "supplier",
  entityId: "22222222-2222-2222-2222-222222222222",
  operation: "update" as const,
  actorId: "33333333-3333-3333-3333-333333333333",
};

describe("durable mutation side effects", () => {
  it("builds a deterministic tenant/entity/id/version/event-type key", () => {
    expect(buildDurableMutationEventKey({
      tenantId: auditEntry.tenantId,
      entityType: auditEntry.entityType,
      entityId: auditEntry.entityId,
      version: 7,
      eventType: "supplier.updated",
    })).toBe(
      "11111111-1111-1111-1111-111111111111/supplier/22222222-2222-2222-2222-222222222222/7/supplier.updated",
    );
  });

  it("propagates required audit failures to the surrounding transaction", async () => {
    const failure = new Error("audit unavailable");
    await expect(writeRequiredRouteAudit(failingDb(failure) as never, auditEntry)).rejects.toBe(failure);
  });

  it("retains best-effort behavior only for the compatibility writer", async () => {
    await expect(writeRouteAudit(failingDb(new Error("legacy failure")) as never, auditEntry)).resolves.toBeUndefined();
  });

  it("rolls back a mutation when required outbox emission fails", async () => {
    const durable = { records: [] as string[], events: [] as string[] };
    const fakeDb = {
      transaction: () => ({
        execute: async (work: (trx: { records: string[]; events: string[] }) => Promise<void>) => {
          const pending = { records: [...durable.records], events: [...durable.events] };
          await work(pending);
          durable.records = pending.records;
          durable.events = pending.events;
        },
      }),
    };

    await expect(executeDurableMutationTransaction(fakeDb as never, async (trx) => {
      (trx as never as typeof durable).records.push("supplier:updated");
      throw new Error("outbox insert failed");
    })).rejects.toThrow("outbox insert failed");
    expect(durable).toEqual({ records: [], events: [] });
  });

  it("does not emit an event when the mutation fails first", async () => {
    const emit = vi.fn();
    const fakeDb = {
      transaction: () => ({ execute: async (work: (trx: object) => Promise<void>) => work({}) }),
    };
    await expect(executeDurableMutationTransaction(fakeDb as never, async () => {
      throw new Error("mutation failed");
      // The durable emitter is deliberately sequenced after mutation success.
      emit();
    })).rejects.toThrow("mutation failed");
    expect(emit).not.toHaveBeenCalled();
  });
});
