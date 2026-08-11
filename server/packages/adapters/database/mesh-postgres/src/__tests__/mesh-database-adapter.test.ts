import type { TransactionRunner } from "@athyper/server-foundation/transaction";
import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";

import { createMeshAdapterRuntime } from "../mesh-database-adapter.js";

interface TestDatabase {
  network: { id: string };
}

describe("Mesh database adapter", () => {
  it("stamps authenticated tenant work", async () => {
    const actor = { tenantId: "11111111-1111-4111-8111-111111111111", principalId: "principal-1" };
    const { adapter, runner } = createTestAdapter(() => actor);
    await adapter.withTenantTransaction(async () => "tenant-result");
    expect(runner.run).toHaveBeenCalledWith(expect.any(Function), actor);
  });
  it("runs Mesh system work without Neon tenant stamping", async () => {
    const { adapter, runner, transaction } = createTestAdapter();

    await expect(
      adapter.withSystemTransaction(async (received) => {
        expect(received).toBe(transaction);
        return "mesh-result";
      }),
    ).resolves.toBe("mesh-result");
    expect(runner.run).toHaveBeenCalledWith(expect.any(Function));
  });

  it("propagates transaction failures", async () => {
    const { adapter } = createTestAdapter();

    await expect(
      adapter.withSystemTransaction(async () => {
        throw new Error("mesh mutation failed");
      }),
    ).rejects.toThrow("mesh mutation failed");
  });

  it("reports health and configured pool capacity", async () => {
    const { adapter, pool } = createTestAdapter();

    await expect(adapter.health()).resolves.toEqual({ healthy: true });
    expect(pool.query).toHaveBeenCalledWith("select 1");
    expect(adapter.poolStats()).toEqual({
      totalCount: 6,
      idleCount: 4,
      waitingCount: 1,
      max: 10,
    });
  });

  it("closes its Kysely-owned pool exactly once", async () => {
    const { adapter, destroy } = createTestAdapter();

    await Promise.all([adapter.close(), adapter.close()]);

    expect(destroy).toHaveBeenCalledOnce();
  });
});

function createTestAdapter(actorProvider?: () => { tenantId: string; principalId: string }) {
  const transaction = {} as Transaction<TestDatabase>;
  const run = vi.fn(
    async <Result>(
      work: (value: Transaction<TestDatabase>) => Promise<Result>,
    ): Promise<Result> => work(transaction),
  );
  const runner = { run } as unknown as TransactionRunner<Transaction<TestDatabase>> & {
    run: typeof run;
  };
  const destroy = vi.fn().mockResolvedValue(undefined);
  const database = { destroy } as unknown as Kysely<TestDatabase>;
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    totalCount: 6,
    idleCount: 4,
    waitingCount: 1,
  };
  const adapter = createMeshAdapterRuntime({
    database,
    pool: pool as never,
    poolMax: 10,
    runner,
    actorProvider,
  });

  return { adapter, destroy, pool, runner, transaction };
}
