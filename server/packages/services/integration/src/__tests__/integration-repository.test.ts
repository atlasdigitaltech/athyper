import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { expect, it } from "vitest";
import { KyselyIntegrationRepository } from "../kysely-integration-repository.js";
function database(rows: Record<string, unknown>[] = []) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery) => {
      queries.push(query);
      return { rows: rows as R[] };
    },
    async *streamQuery<R>() {
      yield { rows: [] as R[] };
    },
  };
  class Driver extends DummyDriver {
    override async acquireConnection() {
      return connection;
    }
  }
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createDriver: () => new Driver(),
      createAdapter: () => new PostgresAdapter(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  return { db, queries, repository: new KyselyIntegrationRepository(db) };
}
it("atomically rejects an idempotency key reused with a different payload", async () => {
  const t = database();
  try {
    await expect(
      t.repository.createDelivery(
        {
          tenantId: "tenant",
          endpointId: "endpoint",
          plan: {} as never,
          payload: {},
          payloadHash: "hash",
          idempotencyKey: "key",
        },
        "actor",
      ),
    ).rejects.toMatchObject({
      code: "INTEGRATION_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(t.queries[0]!.sql).toContain(
      "WHERE event.integration_delivery.payload_hash=EXCLUDED.payload_hash",
    );
  } finally {
    await t.db.destroy();
  }
});
it("preserves immutable attempt coordinates on replay and creates a valid queue ID", async () => {
  const t = database([
    {
      id: "dlq",
      delivery_status: "dead_letter",
      invocation_plan: { retryPolicy: { maxAttempts: 3 } },
    },
  ]);
  try {
    const result = await t.repository.prepareDlqReplay({
      tenantId: "tenant",
      deliveryId: "delivery",
      principalId: "actor",
      requestId: "request",
    });
    expect(result.jobId).not.toContain(":");
    expect(result.maxAttempts).toBe(3);
    const update = t.queries.find((q) =>
      q.sql.startsWith("UPDATE event.integration_delivery"),
    )!;
    expect(update.sql).not.toContain("attempt_count=0");
    expect(update.sql).toContain("status='pending'");
  } finally {
    await t.db.destroy();
  }
});
