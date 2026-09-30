import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type CompiledQuery,
} from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyIntegrationRepository } from "../kysely-integration-repository.js";

const input = {
  tenantId: "tenant",
  subscriptionId: "subscription",
  deliveryKey: "delivery",
  timestamp: "123",
  bodyHash: "a".repeat(64),
  rawBody: Buffer.from("{}"),
  headers: {},
};
function fixture(results: Record<string, unknown>[][]) {
  const queries: CompiledQuery[] = [];
  class Driver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return {
        executeQuery: async <R>(query: CompiledQuery) => {
          queries.push(query);
          return { rows: (results.shift() ?? []) as R[] };
        },
        streamQuery: async function* <R>() {
          yield { rows: [] as R[] };
        },
      };
    }
  }
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createDriver: () => new Driver(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db, queries, repository: new KyselyIntegrationRepository(db) };
}
describe("inbound receipt persistence", () => {
  it.each([false, true])(
    "returns a real receipt for duplicate=%s",
    async (duplicate) => {
      const f = fixture(
        duplicate
          ? [[], [{ id: "receipt", body_hash: input.bodyHash }]]
          : [[{ id: "receipt" }]],
      );
      try {
        expect(await f.repository.admitInbound(input)).toEqual({
          id: "receipt",
          duplicate,
        });
        expect(f.queries[0]?.sql).toContain(
          "ON CONFLICT(tenant_id,subscription_id,delivery_key) DO NOTHING",
        );
        if (duplicate)
          expect(f.queries[1]?.parameters).toEqual([
            input.tenantId,
            input.subscriptionId,
            input.deliveryKey,
          ]);
      } finally {
        await f.db.destroy();
      }
    },
  );
  it("rejects a delivery key reused with changed content", async () => {
    const f = fixture([[], [{ id: "receipt", body_hash: "b".repeat(64) }]]);
    try {
      await expect(f.repository.admitInbound(input)).rejects.toMatchObject({
        status: 409,
        code: "INTEGRATION_WEBHOOK_IDEMPOTENCY_CONFLICT",
      });
    } finally {
      await f.db.destroy();
    }
  });
  it("does not acknowledge an unavailable receipt with an undefined ID", async () => {
    const f = fixture([[], []]);
    try {
      await expect(f.repository.admitInbound(input)).rejects.toThrow(
        "receipt missing",
      );
    } finally {
      await f.db.destroy();
    }
  });
});
