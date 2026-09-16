import { describe, expect, it } from "vitest";
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler,
  type CompiledQuery, type DatabaseConnection, type Transaction } from "kysely";
import { createSupplierProcessTasks } from "./supplier-process-tasks.js";

describe("supplier task case authority", () => {
  it.each(["return", "reject"] as const)("denies ungranted %s before any business mutation", async action => {
    const tenant = "44444444-4444-4444-8444-444444444444";
    const actor = "645b6a55-3355-526a-9643-3900425bde47";
    const queries: string[] = [];
    const connection: DatabaseConnection = {
      async executeQuery<R>(q: CompiledQuery) {
        queries.push(q.sql);
        let rows: unknown[];
        if (q.sql.includes("pg_advisory_xact_lock")) rows = [];
        else if (q.sql.includes("SELECT e.evidence")) rows = [{
          created_by: "maker", status: "in_review", row_version: "2", submitted_snapshot_id: "snapshot",
          evidence: { coordinate: { attemptId: "attempt", submissionSnapshot: { id: "snapshot" },
            scope: { tenantId: tenant, operatingOrganizationId: "org", companyCodeId: null } },
            executionManifest: { tasks: [{ taskTemplateId: "template", executionKind: "review", outcomeScope: "task",
              caseAuthority: { schema: "athyper.task-case-authority/1", returnForChanges: false, rejectProposal: false } }] } },
        }];
        else if (q.sql.includes("FROM document.work_item")) rows = [{ row_version: "1", status: "open",
          assignee_principal_id: actor, claimant_principal_id: null, outcome: null,
          payload: { attemptId: "attempt", workflowRequestId: "workflow", workflowStageId: "stage", taskTemplateId: "template", action: "accept_review" } }];
        else if (q.sql.includes("FROM governance.process_document_job")) rows = [{ id: "pack" }];
        else throw new Error(`Unexpected query after denied authority: ${q.sql}`);
        return { rows: rows as R[] };
      },
      async *streamQuery<R>() { yield { rows: [] as R[] }; },
    };
    class Driver extends DummyDriver { override async acquireConnection() { return connection; } }
    const db = new Kysely<Record<string, never>>({ dialect: {
      createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(),
      createIntrospector: database => new PostgresIntrospector(database), createQueryCompiler: () => new PostgresQueryCompiler(),
    } });
    try {
      const service = createSupplierProcessTasks({ authorizer: { authorize: async () => ({ allowed: true }) } });
      await expect(service.decide({ planeKey: "neon", tenantId: tenant, principalId: actor } as never, "case", {
        attemptId: "attempt", cycleTaskId: "task", workflowRequestId: "workflow", workflowStageId: "stage",
        workItemId: "item", expectedWorkItemVersion: 1, idempotencyKey: "authority-test-key", reason: "Valid reason", action,
      }, db as unknown as Transaction<Record<string, never>>)).rejects.toMatchObject({ code: "PROCESS_TASK_ACTION_FORBIDDEN", statusCode: 403 });
      expect(queries.some(q => /^(UPDATE|INSERT|DELETE)/.test(q))).toBe(false);
    } finally { await db.destroy(); }
  });
});
