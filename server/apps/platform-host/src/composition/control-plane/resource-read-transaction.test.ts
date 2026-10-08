import { expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
const state = vi.hoisted(() => ({
  execute: vi.fn(),
  calls: [] as unknown[][],
}));
vi.mock("kysely", () => ({
  sql: (_parts: TemplateStringsArray, ...values: unknown[]) => {
    state.calls.push(values);
    return { execute: state.execute };
  },
}));
import { resourceReadTransaction } from "./resource-read-transaction.js";
it("reuses the worker transaction and restores its actor instead of borrowing a pool connection", async () => {
  state.calls.length = 0;
  state.execute.mockResolvedValue({
    rows: [{ tenant: "tenant", principal: "worker", plane: "studio" }],
  });
  const transaction = vi.fn(() => {
    throw Error("NESTED_TRANSACTION");
  });
  const database = { isTransaction: true, transaction } as unknown as Kysely<
    Record<string, never>
  >;
  const result = await resourceReadTransaction(database, async (tx) => {
    expect(tx).toBe(database);
    return "qualified";
  });
  expect(result).toBe("qualified");
  expect(transaction).not.toHaveBeenCalled();
  expect(state.calls.at(-1)).toEqual(["tenant", "worker", "studio"]);
});
