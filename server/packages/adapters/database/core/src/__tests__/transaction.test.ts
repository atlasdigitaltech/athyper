import { PostgresDialect, Kysely, type Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";

import {
  KyselyTransactionRunner,
  createTransactionActorStampQuery,
} from "../transaction.js";

interface TestDatabase {
  example: { id: string };
}

describe("KyselyTransactionRunner", () => {
  it("stamps the actor before invoking work", async () => {
    const transaction = {} as Transaction<TestDatabase>;
    const order: string[] = [];
    const database = fakeDatabase(transaction);
    const stamp = vi.fn(async () => {
      order.push("stamp");
    });
    const runner = new KyselyTransactionRunner(database, stamp);

    const result = await runner.run(
      async (received) => {
        order.push("work");
        expect(received).toBe(transaction);
        return "done";
      },
      { tenantId: "tenant-a", principalId: "principal-a" },
    );

    expect(result).toBe("done");
    expect(order).toEqual(["stamp", "work"]);
  });

  it("does not stamp a system transaction", async () => {
    const transaction = {} as Transaction<TestDatabase>;
    const stamp = vi.fn();
    const runner = new KyselyTransactionRunner(fakeDatabase(transaction), stamp);

    await runner.run(async () => undefined);

    expect(stamp).not.toHaveBeenCalled();
  });

  it("propagates work failures to Kysely's transaction boundary", async () => {
    const transaction = {} as Transaction<TestDatabase>;
    const runner = new KyselyTransactionRunner(fakeDatabase(transaction), vi.fn());

    await expect(
      runner.run(async () => {
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");
  });

  it("compiles actor values as bound parameters", () => {
    const compilerDatabase = new Kysely<TestDatabase>({
      dialect: new PostgresDialect({ pool: {} as never }),
    });
    const query = createTransactionActorStampQuery({
      tenantId: "tenant-value",
      principalId: "principal-value",
    }).compile(compilerDatabase);

    expect(query.sql).toContain("set_config('app.current_tenant_id', $1, true)");
    expect(query.sql).toContain("set_config('app.current_principal_id', $2, true)");
    expect(query.parameters).toEqual(["tenant-value", "principal-value"]);
  });
});

function fakeDatabase(
  transaction: Transaction<TestDatabase>,
): Kysely<TestDatabase> {
  return {
    transaction: () => ({
      execute: async <Result>(
        work: (value: Transaction<TestDatabase>) => Promise<Result>,
      ) => work(transaction),
    }),
  } as unknown as Kysely<TestDatabase>;
}
