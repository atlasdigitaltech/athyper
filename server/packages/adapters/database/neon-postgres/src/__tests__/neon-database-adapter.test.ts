import type { TransactionRunner } from "@athyper/server-foundation/transaction";
import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";

import { createNeonAdapterRuntime } from "../neon-database-adapter.js";

interface TestDatabase {
  record: { id: string };
}

const TENANT_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("Neon database adapter", () => {
  it("requires a configured actor for tenant transactions", async () => {
    const { adapter, runner } = createTestAdapter();

    await expect(
      adapter.withTenantTransaction(async () => "unreachable"),
    ).rejects.toThrow("actor provider");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("rejects missing and malformed tenant context before opening a transaction", async () => {
    const missing = createTestAdapter({ actorProvider: () => undefined });
    const malformed = createTestAdapter({
      actorProvider: () => ({ tenantId: "wrong", principalId: "user-1" }),
    });

    await expect(
      missing.adapter.withTenantTransaction(async () => undefined),
    ).rejects.toThrow("authenticated actor");
    await expect(
      malformed.adapter.withTenantTransaction(async () => undefined),
    ).rejects.toThrow("valid tenant ID");
    expect(missing.runner.run).not.toHaveBeenCalled();
    expect(malformed.runner.run).not.toHaveBeenCalled();
  });

  it("stamps tenant transactions with the current actor", async () => {
    const actor = { tenantId: TENANT_ID, principalId: "user-1" };
    const { adapter, runner, transaction } = createTestAdapter({
      actorProvider: () => actor,
    });

    await expect(
      adapter.withTenantTransaction(async (received) => {
        expect(received).toBe(transaction);
        return "saved";
      }),
    ).resolves.toBe("saved");
    expect(runner.run).toHaveBeenCalledWith(expect.any(Function), actor);
  });

  it("keeps actor providers isolated between adapter instances", async () => {
    const firstActor = { tenantId: TENANT_ID, principalId: "first" };
    const secondActor = {
      tenantId: "223e4567-e89b-42d3-a456-426614174000",
      principalId: "second",
    };
    const first = createTestAdapter({ actorProvider: () => firstActor });
    const second = createTestAdapter({ actorProvider: () => secondActor });

    await Promise.all([
      first.adapter.withTenantTransaction(async () => undefined),
      second.adapter.withTenantTransaction(async () => undefined),
    ]);

    expect(first.runner.run).toHaveBeenCalledWith(expect.any(Function), firstActor);
    expect(second.runner.run).toHaveBeenCalledWith(expect.any(Function), secondActor);
  });

  it("opens system transactions without actor stamping", async () => {
    const { adapter, runner } = createTestAdapter();

    await adapter.withSystemTransaction(async () => "system-result");

    expect(runner.run).toHaveBeenCalledWith(expect.any(Function));
  });

  it("reports health and pool counters through the public adapter", async () => {
    const { adapter, pool } = createTestAdapter();

    await expect(adapter.health()).resolves.toEqual({ healthy: true });
    expect(pool.query).toHaveBeenCalledWith("select 1");
    expect(adapter.poolStats()).toEqual({
      totalCount: 4,
      idleCount: 2,
      waitingCount: 1,
      max: 8,
    });
  });

  it("closes the Kysely driver exactly once", async () => {
    const { adapter, destroy } = createTestAdapter();

    await Promise.all([adapter.close(), adapter.close()]);

    expect(destroy).toHaveBeenCalledOnce();
  });
});

function createTestAdapter(options: {
  actorProvider?: () =>
    | { tenantId: string; principalId: string }
    | null
    | undefined;
} = {}) {
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
    totalCount: 4,
    idleCount: 2,
    waitingCount: 1,
  };
  const adapter = createNeonAdapterRuntime({
    database,
    pool: pool as never,
    poolMax: 8,
    runner,
    ...(options.actorProvider ? { actorProvider: options.actorProvider } : {}),
  });

  return { adapter, destroy, pool, runner, transaction };
}
