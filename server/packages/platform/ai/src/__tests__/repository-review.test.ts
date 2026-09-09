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
import { describe, expect, it, vi } from "vitest";
import { KyselyAtlasPolicyAdministration } from "../policy-administration.js";
import {
  AtlasKnowledgeService,
  KyselyAtlasKnowledgeRepository,
} from "../knowledge.js";
import { AtlasThreadService } from "../thread-service.js";
import { context } from "./review-fixture.js";

function database(
  respond: (query: CompiledQuery) => Record<string, unknown>[],
) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery) {
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
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  const transactions = {
    run: async (_plane, _actor, work) =>
      work(db as unknown as Transaction<Record<string, never>>),
  } as PlaneTransactionCoordinator<Transaction<Record<string, never>>>;
  return { queries, transactions, db };
}
const at = "2026-09-06T00:00:00.000Z";
const action = {
  actionCode: "invoice.post",
  docClass: null,
  autonomyLevel: "assist" as const,
  minConfidenceForAuto: null,
  requiresHumanConfirmation: true,
};
const threshold = {
  actionCode: "invoice.post",
  docClass: null,
  modelId: null,
  minForSuggest: 0.3,
  minForAssist: 0.6,
  minForAuto: 0.9,
  driftAlertBelow: null,
  driftWindowHours: 24,
};
describe("Atlas repository review", () => {
  it.each(["action", "threshold"] as const)(
    "locks the %s natural key before reading and rejects stale revisions without writing",
    async (kind) => {
      let row: Record<string, unknown> | undefined;
      const f = database((query) => {
        if (query.sql.startsWith("SELECT *,xmin")) return row ? [row] : [];
        if (
          query.sql.startsWith("INSERT INTO ai.ai_action_policy") ||
          query.sql.startsWith("INSERT INTO ai.ai_confidence_threshold")
        ) {
          row = {
            id: "id",
            tenant_id: context.tenantId,
            action_code: "invoice.post",
            doc_class: null,
            autonomy_level: "assist",
            min_confidence_for_auto: null,
            requires_human_confirmation: true,
            model_id: null,
            min_for_suggest: 0.3,
            min_for_assist: 0.6,
            min_for_auto: 0.9,
            drift_alert_below: null,
            drift_window_hours: 24,
            created_at: at,
            updated_at: at,
            row_revision: row ? "102" : "101",
          };
          return [row];
        }
        return [];
      });
      const invalidation = { publish: vi.fn(async () => undefined) };
      const admin = new KyselyAtlasPolicyAdministration({
        transactions: f.transactions,
        invalidation,
        now: () => new Date(at),
      });
      const put = (expectedRevision?: string) =>
        kind === "action"
          ? admin.putActionPolicy({ context, policy: action, expectedRevision })
          : admin.putConfidenceThreshold({
              context,
              threshold,
              expectedRevision,
            });
      try {
        const first = await put();
        const second = await put(first.revision);
        expect(first.revision).not.toBe(second.revision); // Even when timestamps match.
        f.queries.length = 0;
        await expect(put(first.revision)).rejects.toMatchObject({
          code: "VERSION_CONFLICT",
        });
        expect(f.queries).toHaveLength(2);
        expect(f.queries[0]?.sql).toContain("pg_advisory_xact_lock");
        expect(f.queries[0]?.parameters).toContain(
          JSON.stringify([
            context.tenantId,
            "atlas-policy",
            kind,
            "invoice.post",
            null,
            ...(kind === "threshold" ? [null] : []),
          ]),
        );
        expect(f.queries[1]?.sql).toContain("xmin::text AS row_revision");
        expect(invalidation.publish).toHaveBeenCalledTimes(2);
      } finally {
        await f.db.destroy();
      }
    },
  );
  it("retries index removal using already deleted knowledge revisions", async () => {
    const revisionId = "10000000-0000-4000-8000-000000000010";
    let deleted = false;
    const f = database((query) => {
      if (query.sql.startsWith("SELECT id FROM ai.atlas_knowledge_source"))
        return [{ id: "10000000-0000-4000-8000-000000000011" }];
      if (query.sql.startsWith("SELECT r.id"))
        return deleted && query.sql.includes("r.status<>'deleted'")
          ? []
          : [{ id: revisionId }];
      if (query.sql.startsWith("UPDATE ai.atlas_knowledge_revision"))
        deleted = true;
      return [];
    });
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("index offline"))
      .mockResolvedValue(undefined);
    const service = new AtlasKnowledgeService({
      repository: new KyselyAtlasKnowledgeRepository(f.transactions),
      index: { remove } as never,
    });
    try {
      await expect(
        service.retract({ context, sourceId: "doc" }),
      ).rejects.toThrow("index offline");
      await service.retract({ context, sourceId: "doc" });
      expect(remove).toHaveBeenNthCalledWith(2, {
        tenantId: context.tenantId,
        revisionIds: [revisionId],
      });
    } finally {
      await f.db.destroy();
    }
  });
  it("filters knowledge hits when an allowed permission is explicitly denied", async () => {
    const service = new AtlasKnowledgeService({
      repository: {} as never,
      index: {
        search: async () => [
          { permissionCode: "documents.read", citation: {}, score: 1 },
        ],
      } as never,
    });
    const denied = {
      ...context,
      permissions: {
        ...context.permissions,
        allowed: ["documents.read"],
        denied: ["documents.read"],
      },
    };
    await expect(
      service.search({ context: denied, query: "doc" }),
    ).resolves.toEqual([]);
  });
  it("rejects owner demotion without changing participants", async () => {
    const repository = {
      get: async () => ({
        tenantId: context.tenantId,
        planeKey: context.planeKey,
        ownerPrincipalId: context.principalId,
      }),
      putParticipant: vi.fn(),
    };
    const service = new AtlasThreadService({
      repository: repository as never,
      authorizer: { authorize: async () => true },
      retention: {} as never,
      maxHistoryMessages: 10,
      maxHistoryBytes: 1000,
      maxExportMessages: 10,
    });
    await expect(
      service.putParticipant(
        context,
        "thread",
        context.principalId,
        "observer",
        1,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(repository.putParticipant).not.toHaveBeenCalled();
  });
});

it("refuses ambiguous source IDs and scopes retraction to the selected source kind", async () => {
  const sourceId = "10000000-0000-4000-8000-000000000020";
  const f = database((query) =>
    query.sql.startsWith("SELECT id FROM ai.atlas_knowledge_source")
      ? query.parameters.includes("document")
        ? [{ id: sourceId }]
        : [{ id: sourceId }, { id: "other-source" }]
      : [],
  );
  const repo = new KyselyAtlasKnowledgeRepository(f.transactions);
  try {
    await expect(
      repo.retract({
        context,
        sourceId: "shared-external-id",
        delete: true,
        at,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(f.queries).toHaveLength(1);
    f.queries.length = 0;
    await repo.retract({
      context,
      sourceId: "shared-external-id",
      sourceKind: "document",
      delete: true,
      at,
    });
    const update = f.queries.find((q) =>
      q.sql.startsWith("UPDATE ai.atlas_knowledge_source"),
    );
    expect(update?.sql).toContain("AND id=");
    expect(update?.parameters).toContain(sourceId);
    expect(update?.parameters).not.toContain("shared-external-id");
  } finally {
    await f.db.destroy();
  }
});

it.each([true, false])("completes a zero-model answer only with a matching durable read (present=%s)", async present => {
  const row = {id: "run", status: "started", started_at: at, generation_config: {}, conversation_id: "thread"};
  const f = database(query => {
    if (query.sql.includes("FROM ai.atlas_run")) return [row];
    if (query.sql.includes("SELECT EXISTS")) return [{present}];
    if (query.sql.includes("clock_timestamp() AS at")) return [{at: new Date(at)}];
    if (query.sql.startsWith("UPDATE ai.atlas_run")) return [{...row, status: "completed"}];
    return [];
  });
  const {KyselyAtlasRunRepository} = await import("../kysely-run-repository.js");
  const repo = new KyselyAtlasRunRepository(f.transactions);
  const promise = repo.complete({context, runId: "run", completedAt: at, assistantContent: [
    {type: "tool_use", callId: "call", toolName: "read_section", input: {}},
    {type: "tool_result", callId: "call", toolName: "read_section", result: {}},
    {type: "text", text: "Saved section data"},
  ]});
  if (present) {
    expect((await promise)?.status).toBe("completed");
    expect(f.queries.some(q => q.sql.includes("INSERT INTO ai.ai_agent_call"))).toBe(false);
    const usage = f.queries.find(q => q.sql.includes("INSERT INTO ai.ai_agent_run"))!;
    const columns = usage.sql.slice(usage.sql.indexOf("(") + 1, usage.sql.indexOf(")")).split(",");
    expect(usage.parameters[columns.indexOf("model_call_count")]).toBe(0);
    expect(usage.parameters[columns.indexOf("tool_call_count")]).toBe(1);
    expect(usage.parameters[columns.indexOf("usage_source")]).toBe("unavailable");

  } else {
    await expect(promise).rejects.toThrow("Completion requires recorded provider usage");
    expect(f.queries.some(q => q.sql.startsWith("UPDATE ai.atlas_message"))).toBe(false);
  }
  const check = f.queries.find(q => q.sql.includes("SELECT EXISTS"))!;
  expect(check.sql).toContain("operation_class='read' AND status='completed'");
  expect(check.parameters).toEqual([context.tenantId, "run", context.principalId, context.planeKey, "call", "read_section"]);
  await f.db.destroy();
});
