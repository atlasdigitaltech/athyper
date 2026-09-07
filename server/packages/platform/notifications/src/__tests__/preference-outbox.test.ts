import { describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction,
} from "kysely";
import { createKyselyNotificationPreferenceStore } from "../kysely-notification-preferences.js";

const scope = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  principalId: "33333333-3333-4333-8333-333333333333",
  planeKey: "neon" as const,
};

async function fixture(failOutbox = false) {
  const queries: string[] = [];
  let reads = 0;
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [
      {
        transformQuery(args) {
          const compiled = new PostgresQueryCompiler().compileQuery(args.node, args.queryId);
          queries.push(compiled.sql);
          if (failOutbox && compiled.sql.includes("INSERT INTO event.outbox"))
            throw new Error("outbox unavailable");
          return args.node;
        },
        async transformResult(args) {
          if (queries.at(-1)?.startsWith("SELECT event_code")) {
            reads++;
            return {
              ...args.result,
              rows:
                reads === 1
                  ? []
                  : [
                      {
                        event_code: "platform.preferences.version",
                        channel: "in_app",
                        status: "inactive",
                        is_enabled: false,
                        version: 42,
                      },
                    ],
            };
          }
          return args.result;
        },
      },
    ],
  });
  const run = vi.fn(
    async (
      _plane,
      _actor,
      callback: (tx: Transaction<Record<string, never>>) => Promise<unknown>,
    ) => callback(db as unknown as Transaction<Record<string, never>>),
  );
  const store = createKyselyNotificationPreferenceStore({ run } as never);
  return { db, run, store, queries };
}

describe("preference transactional invalidation", () => {
  it("writes invalidation in the same transaction even for an empty replacement", async () => {
    const f = await fixture();
    try {
      await expect(f.store.replace(scope, [], 0)).resolves.toEqual({
        preferences: [],
        version: 42,
      });
      expect(f.run).toHaveBeenCalledOnce();
      expect(f.run).toHaveBeenCalledWith("neon", scope, expect.any(Function));
      expect(f.queries.at(-1)).toContain("INSERT INTO event.outbox");
    } finally {
      await f.db.destroy();
    }
  });
  it("propagates outbox failures to the transaction coordinator for rollback", async () => {
    const f = await fixture(true);
    try {
      await expect(f.store.replace(scope, [], 0)).rejects.toThrow(
        "outbox unavailable",
      );
    } finally {
      await f.db.destroy();
    }
  });
  it("does not mutate preferences or emit an event on a version conflict", async () => {
    const f = await fixture();
    try {
      await expect(f.store.replace(scope, [], 9)).resolves.toBeUndefined();
      expect(f.queries.every((query) => query.startsWith("SELECT"))).toBe(true);
    } finally {
      await f.db.destroy();
    }
  });
});
