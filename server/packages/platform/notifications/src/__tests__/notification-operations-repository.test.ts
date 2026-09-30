import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Transaction,
} from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it } from "vitest";
import { createKyselyNotificationOperationsRepository } from "../notification-operations.js";

const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
} as VerifiedRequestContext;
const deliveryId = "abcdefab-3333-4333-8333-333333333333";
const delivery = {
  id: deliveryId,
  message_id: "44444444-4444-4444-8444-444444444444",
  tenant_id: context.tenantId,
  recipient_id: context.principalId,
  channel: "email",
  status: "failed",
  attempt_count: 3,
  max_attempts: 3,
  created_at: "2026-09-01T00:00:00Z",
  sent_at: "2026-09-01T00:01:00Z",
  next_retry_at: "2026-09-01T00:03:00Z",
};
function database(
  respond: (query: CompiledQuery) => readonly Record<string, unknown>[],
) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery) => {
      queries.push(query);
      return { rows: respond(query) as R[] };
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
      createIntrospector: (value) => new PostgresIntrospector(value),
    },
  });
  const transactions = {
    run: async (_plane, _context, work) =>
      work(db as unknown as Transaction<Record<string, never>>),
  } as PlaneTransactionCoordinator<Transaction<Record<string, never>>>;
  return {
    queries,
    db,
    repository: createKyselyNotificationOperationsRepository(transactions),
  };
}

describe("notification operations SQL repository", () => {
  it("checks delivery visibility before looking up a replay receipt", async () => {
    const f = database((query) =>
      query.sql.includes("FROM event.outbox") ? [{ payload: {} }] : [],
    );
    try {
      expect(
        await f.repository.replay({
          context,
          deliveryId,
          replayKey: "incident",
        }),
      ).toBeNull();
      expect(f.queries).toHaveLength(1);
      expect(f.queries[0]?.parameters).toEqual([
        context.tenantId,
        deliveryId,
        context.planeKey,
      ]);
    } finally {
      await f.db.destroy();
    }
  });
  it("reads a duplicate receipt after acquiring the delivery lock even when it is now pending", async () => {
    const f = database((query) =>
      query.sql.includes("FROM event.outbox")
        ? [{ payload: {} }]
        : [{ ...delivery, status: "pending" }],
    );
    try {
      expect(
        await f.repository.replay({
          context,
          deliveryId: deliveryId.toUpperCase(),
          replayKey: "incident",
        }),
      ).toMatchObject({ replayed: true });
      expect(f.queries).toHaveLength(2);
      expect(f.queries[0]?.sql).toContain("FOR UPDATE OF d");
      expect(f.queries[1]?.parameters).toContain(
        `notification-replay:${deliveryId}:incident`,
      );
    } finally {
      await f.db.destroy();
    }
  });
  it.each(["failed", "bounced", "cancelled"])(
    "requeues %s and clears old provider correlation",
    async (status) => {
      const f = database((query) =>
        query.sql.includes("SELECT d.id") ? [{ ...delivery, status }] : [],
      );
      try {
        expect(
          await f.repository.replay({
            context,
            deliveryId,
            replayKey: "incident",
          }),
        ).toMatchObject({ replayed: false, status: "pending" });
        const update = f.queries.find((query) =>
          query.sql.includes("UPDATE event.notification_delivery"),
        );
        expect(update?.sql).toContain("external_id=NULL");
        expect(update?.sql).toContain("attempt_count=0");
        expect(
          f.queries.findIndex((query) =>
            query.sql.includes("INSERT INTO event.outbox"),
          ),
        ).toBeLessThan(f.queries.indexOf(update!));
      } finally {
        await f.db.destroy();
      }
    },
  );
  it.each(["pending", "queued", "sending", "sent", "delivered"])(
    "rejects a fresh replay of %s",
    async (status) => {
      const f = database((query) =>
        query.sql.includes("SELECT d.id") ? [{ ...delivery, status }] : [],
      );
      try {
        await expect(
          f.repository.replay({ context, deliveryId, replayKey: "new" }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(f.queries).toHaveLength(2);
      } finally {
        await f.db.destroy();
      }
    },
  );
  it.each([2, 3])(
    "includes sent history and only schedules retries with attempts remaining (%s)",
    async (attemptCount) => {
      const f = database((query) =>
        query.sql.includes("SELECT d.id")
          ? [{ ...delivery, attempt_count: attemptCount }]
          : [
              {
                created_at: "2026-09-01T00:02:00Z",
                is_success: false,
                duration_ms: 50,
                response_status: 503,
                error: "provider unavailable",
              },
            ],
      );
      try {
        const timeline = await f.repository.timeline({ context, deliveryId });
        expect(timeline?.events.map((event) => event.type)).toEqual([
          "created",
          "sent",
          "attempt_failed",
          ...(attemptCount < 3 ? ["retry_scheduled"] : []),
        ]);
        expect(timeline?.events[2]?.detail).toMatchObject({
          error: "provider unavailable",
          responseStatus: 503,
        });
        expect(f.queries[0]?.parameters).toEqual([
          context.tenantId,
          deliveryId,
          context.planeKey,
        ]);
      } finally {
        await f.db.destroy();
      }
    },
  );
  it("keeps provider errors out of subscriber timelines", async () => {
    const f = database((query) =>
      query.sql.includes("SELECT d.id")
        ? [delivery]
        : [
            {
              created_at: "2026-09-01T00:02:00Z",
              is_success: false,
              duration_ms: 50,
              error: "secret",
              response_status: 503,
            },
          ],
    );
    try {
      const timeline = await f.repository.timeline({
        context,
        deliveryId,
        recipientId: context.principalId,
      });
      expect(timeline?.events[2]?.detail).toEqual({ durationMs: 50 });
      expect(f.queries[0]?.parameters).toContain(context.principalId);
    } finally {
      await f.db.destroy();
    }
  });
});
