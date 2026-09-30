import {
  JobScheduleConflictError,
  JobScheduleNotFoundError,
} from "@athyper/server-contract-jobs";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { describe, expect, it, vi } from "vitest";
import {
  createKyselyJobGovernanceStore,
  createKyselyJobAdministrationStore,
  createKyselyJobExecutionStore,
  type JobTransaction,
  type JobTransactionCoordinator,
} from "../kysely-job-repositories.js";

const execution = {
  planeKey: "neon",
  scope: "tenant",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
} as const;
const input = {
  execution,
  scheduleId: "33333333-3333-4333-8333-333333333333",
  reason: "Operator change",
  schedule: {
    code: "daily",
    name: "Daily",
    handlerType: "generate",
    targetQueue: "reports",
    cronExpression: "0 * * * *",
    timezone: "UTC",
    payloadTemplate: {},
  },
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
  // SQL is compiled and executed through Kysely; the driver supplies deterministic DB responses.
  const transactions: JobTransactionCoordinator = {
    runTenant: async (_plane, _actor, work) =>
      work(db as unknown as JobTransaction),
    runSystem: async (_plane, work) => work(db as unknown as JobTransaction),
  };
  return { transactions, queries, db };
}

describe("Jobs repository error handling", () => {
  it.each([
    "publication-recovery",
    "governance-report-pack-recovery",
    "00000000-0000-0000-0000-000000000000",
  ])(
    "validates the system job principal %s before SQL",
    async (principalId) => {
      const test = database((query) =>
        query.sql.includes("RETURNING id") ? [{ id: input.scheduleId }] : [],
      );
      const store = createKyselyJobExecutionStore(test.transactions);
      const job = {
        id: "recovery",
        queue: "maintenance",
        name: "recover",
        data: {},
        attempt: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
        execution: { planeKey: "studio", scope: "plane", principalId } as const,
      };
      try {
        const enqueue = store.recordEnqueued({
          jobId: job.id,
          executionKey: job.id,
          planeKey: "studio",
          principalId,
          queue: job.queue,
          name: job.name,
          data: {},
          maxAttempts: 3,
          enqueuedAt: job.enqueuedAt,
        });
        if (principalId.startsWith("00000000")) {
          await expect(enqueue).resolves.toBeDefined();
          await expect(store.recordStarted(job)).resolves.toBeUndefined();
          expect(
            test.queries.filter((query) =>
              query.sql.includes("INSERT INTO ops.job_execution"),
            ),
          ).toHaveLength(2);
        } else {
          await expect(enqueue).rejects.toThrow(
            "Job principalId must be a UUID",
          );
          await expect(store.recordStarted(job)).rejects.toThrow(
            "Job principalId must be a UUID",
          );
          expect(test.queries).toHaveLength(0);
        }
      } finally {
        await test.db.destroy();
      }
    },
  );

  it("returns not found for an update outside the caller's visible schedules", async () => {
    const test = database(() => []);
    try {
      await expect(
        createKyselyJobGovernanceStore(test.transactions).updateSchedule(input),
      ).rejects.toBeInstanceOf(JobScheduleNotFoundError);
      expect(test.queries).toHaveLength(1);
      expect(test.queries[0]?.parameters).toContain(execution.tenantId);
    } finally {
      await test.db.destroy();
    }
  });

  it.each([true, false])(
    "handles repeated deactivation without extra audit evidence, exists=%s",
    async (exists) => {
      const test = database((query) =>
        query.sql.includes("SELECT id") && exists
          ? [{ id: input.scheduleId }]
          : [],
      );
      try {
        const result = createKyselyJobGovernanceStore(
          test.transactions,
        ).deactivateSchedule(input);
        if (exists) await expect(result).resolves.toBeUndefined();
        else
          await expect(result).rejects.toBeInstanceOf(JobScheduleNotFoundError);
        expect(test.queries).toHaveLength(2);
        expect(
          test.queries.every((query) =>
            query.parameters.includes(execution.tenantId),
          ),
        ).toBe(true);
        expect(
          test.queries.some((query) =>
            query.sql.includes("INSERT INTO control.cron_schedule_change_log"),
          ),
        ).toBe(false);
      } finally {
        await test.db.destroy();
      }
    },
  );

  it.each(["createSchedule", "updateSchedule"] as const)(
    "maps only the schedule-code constraint to conflict during %s",
    async (method) => {
      const duplicate = { code: "23505", constraint: "cron_schedule_code_uq" };
      const respond = vi.fn((): Record<string, unknown>[] => {
        throw duplicate;
      });
      const test = database(respond);
      try {
        const store = createKyselyJobGovernanceStore(test.transactions);
        await expect(store[method](input)).rejects.toBeInstanceOf(
          JobScheduleConflictError,
        );
        const failure = { code: "23505", constraint: "unrelated_constraint" };
        respond.mockImplementation(() => {
          throw failure;
        });
        await expect(store[method](input)).rejects.toBe(failure);
      } finally {
        await test.db.destroy();
      }
    },
  );

  it.each(["legacy", "new"])(
    "keeps enqueue and worker evidence on the same %s execution key",
    async (mode) => {
      const expectedKey = mode === "legacy" ? "1" : "reports:1";
      const test = database((query) => {
        if (query.sql.includes("SELECT execution_key"))
          return mode === "legacy" ? [{ execution_key: "1" }] : [];
        if (query.sql.includes("RETURNING id,COALESCE"))
          return [
            { id: input.scheduleId, started_at: new Date(), duration_ms: 1 },
          ];
        if (query.sql.includes("RETURNING id"))
          return [{ id: input.scheduleId }];
        return [];
      });
      try {
        const store = createKyselyJobExecutionStore(test.transactions);
        await expect(
          store.recordEnqueued({
            jobId: "1",
            executionKey: "reports:1",
            planeKey: "neon",
            tenantId: execution.tenantId,
            principalId: execution.principalId,
            queue: "reports",
            name: "generate",
            data: {},
            maxAttempts: 1,
            enqueuedAt: new Date().toISOString(),
          }),
        ).resolves.toMatchObject({ executionKey: expectedKey });
        const job = {
          id: "1",
          executionKey: "reports:1",
          queue: "reports",
          name: "generate",
          data: {},
          attempt: 1,
          maxAttempts: 1,
          enqueuedAt: new Date().toISOString(),
          execution,
        };
        await store.recordStarted(job);
        await store.recordCompleted(job, { status: "completed" });
        const writes = test.queries.filter((query) =>
          /(?:INSERT INTO|UPDATE) ops.job_execution\s/.test(query.sql),
        );
        expect(writes).toHaveLength(3);
        expect(
          writes.every((query) => query.parameters.includes(expectedKey)),
        ).toBe(true);
        const lookups = test.queries.filter((query) =>
          query.sql.includes("SELECT execution_key"),
        );
        expect(lookups).toHaveLength(3);
        expect(
          lookups.every(
            (query) =>
              query.parameters.includes(execution.tenantId) &&
              query.parameters.includes("reports"),
          ),
        ).toBe(true);
      } finally {
        await test.db.destroy();
      }
    },
  );

  it("guards retry command updates with the source attempt so new worker evidence wins", async () => {
    const test = database(() => []);
    try {
      await createKyselyJobAdministrationStore(test.transactions).recordCommand(
        {
          request: {
            execution,
            executionId: input.scheduleId,
            reason: input.reason,
          },
          command: "retry",
          applied: true,
          expectedAttempt: 3,
        },
      );
      const update = test.queries.find((query) =>
        query.sql.includes("UPDATE ops.job_execution"),
      );
      expect(update).toBeDefined();
      const match = update!.sql.match(/AND attempt_no=\$(\d+)/);
      expect(match).not.toBeNull();
      expect(update!.parameters[Number(match![1]) - 1]).toBe(3);
      expect(update!.parameters).toContain(execution.tenantId);
    } finally {
      await test.db.destroy();
    }
  });
});
