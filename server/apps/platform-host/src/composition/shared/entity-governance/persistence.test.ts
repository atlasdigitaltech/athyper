import { expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import {
  createGovernancePersistence,
  type GovernancePersistenceOptions,
} from "./persistence.js";

function dependencies(): Omit<GovernancePersistenceOptions, "databases"> {
  return {
    transactions: { run: vi.fn() },
    audit: { record: vi.fn() },
    outbox: { append: vi.fn() },
  };
}
it.each(["studio", "neon", "mesh"] as const)(
  "governance persistence for %s has no cross-plane fallback",
  async (plane) => {
    const ports = dependencies();
    const database = {} as Kysely<Record<string, never>>;
    const input = { [plane]: database };
    const result = createGovernancePersistence({ ...ports, databases: input });
    expect(result.consent).toBeDefined();
    expect(result.moderation).toBeDefined();
    expect(result.governanceDatabases.require(plane)).toBe(database);
    for (const excluded of (["studio", "neon", "mesh"] as const).filter(
      (p) => p !== plane,
    )) {
      for (const provider of [
        result.governanceDatabases,
        result.executionRepositories,
        result.legalHoldRepositories,
        result.reportPackRepositories,
      ]) {
        expect(() => provider.require(excluded)).toThrow();
        expect((await provider.health(excluded)).status).toBe("unavailable");
      }
    }
    expect(ports.transactions.run).not.toHaveBeenCalled();
  },
);
it("does not construct consent or moderation without a database", () => {
  const result = createGovernancePersistence({
    ...dependencies(),
    databases: {},
  });
  expect(result.hasGovernanceDatabase).toBe(false);
  expect(result.consent).toBeUndefined();
  expect(result.moderation).toBeUndefined();
});
