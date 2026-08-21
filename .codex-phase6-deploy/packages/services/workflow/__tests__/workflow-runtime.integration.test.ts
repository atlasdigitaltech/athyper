import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql, type RawBuilder } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkflowLifecycleRuntime } from "../runtime.js";
import type { ExecuteOperationCommand, WorkflowRuntimeDb, WorkflowRuntimeTransaction } from "../runtime.types.js";

const LIVE_DATABASE_URL = process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"]
  ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface RuntimeScenario {
  tenantId: string;
  principalId: string;
  legalEntityId: string;
  companyCodeId: string;
  lifecycleId: string;
  draftStateId: string;
  pendingStateId: string;
  transitionId: string;
  lifecycleInstanceId: string;
  entityName: "purchase_invoice" | "payment_entry";
  entityId: string;
  workflowRequestId: string;
  idempotencyKey: string;
}

let db: Kysely<unknown> | undefined;

maybeDescribe("WorkflowLifecycleRuntime live database scenarios", () => {
  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool = (pgModule.default as { Pool?: unknown } | undefined)?.Pool
      ?? (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) {
      throw new Error("The pg package is required for workflow runtime integration tests");
    }

    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString: LIVE_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });

    db = new Kysely({
      dialect: new PostgresDialect({ pool }),
    });

    await sql`select 1`.execute(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("executes and replays purchase_invoice submit with real metadata and source rows", async () => {
    const scenario = await seedRuntimeScenario("purchase_invoice");
    try {
      await assertRuntimeScenario(scenario, {
        operationCode: "submit",
        expectedSourceTable: "document.purchase_invoice",
      });
    } finally {
      await cleanupRuntimeScenario(scenario);
    }
  });

  it("executes and replays payment_entry submit_for_approval with real metadata and source rows", async () => {
    const scenario = await seedRuntimeScenario("payment_entry");
    try {
      await assertRuntimeScenario(scenario, {
        operationCode: "submit_for_approval",
        expectedSourceTable: "document.payment_entry",
      });
    } finally {
      await cleanupRuntimeScenario(scenario);
    }
  });
});

async function assertRuntimeScenario(
  scenario: RuntimeScenario,
  args: { operationCode: string; expectedSourceTable: string },
): Promise<void> {
  const runtime = createWorkflowLifecycleRuntime({
    db: mustDb() as WorkflowRuntimeDb,
    featureFlags: {
      bulkCheck: async (codes: string[]) => new Map(codes.map((code) => [code, true])),
    },
    operationAuthorizer: {
      authorize: async () => ({
        permissionCode: "submit",
        handlerType: "API",
        handlerTarget: "submit",
        isRecordRequired: true,
        isEnabled: true,
      }),
    } as never,
    createWorkflowEngineForDb: (trx) => ({
      createRequest: async (request: {
        tenantId: string;
        entityType: string;
        entityId: string;
        requestedBy: string;
        payload: Record<string, unknown>;
        correlationId?: string;
      }) => {
        await (trx as WorkflowRuntimeTransaction)
          .insertInto("document.workflow_request" as never)
          .values({
            id: scenario.workflowRequestId,
            tenant_id: request.tenantId,
            workflow_type: "approval",
            entity_type: request.entityType,
            entity_id: request.entityId,
            entity_snapshot: JSON.stringify(request.payload),
            requested_by: request.requestedBy,
            status: "pending",
            correlation_id: request.correlationId ?? null,
            created_by: request.requestedBy,
          } as never)
          .execute();

        return {
          id: scenario.workflowRequestId,
          isExisting: false,
          status: "pending",
        };
      },
    }) as never,
  });

  const command: ExecuteOperationCommand = {
    tenantId: scenario.tenantId,
    entityName: scenario.entityName,
    entityId: scenario.entityId,
    operationCode: args.operationCode,
    actorId: scenario.principalId,
    idempotencyKey: scenario.idempotencyKey,
    remarks: "integration submit",
  };

  const first = await runtime.executeOperation(command);
  expect(first.ok).toBe(true);
  expect(first.replayed).toBeUndefined();
  expect(first.entityName).toBe(scenario.entityName);
  expect(first.operationCode).toBe("submit");
  expect(first.workflowRequestId).toBe(scenario.workflowRequestId);
  expect(first.lifecycle?.fromState).toBe("draft");
  expect(first.lifecycle?.toState).toBe("pending_approval");

  await expectRuntimeRows(scenario, args.expectedSourceTable);

  const workflowCountBeforeReplay = await countRows("document.workflow_request", scenario);
  const lifecycleLogCountBeforeReplay = await countRows("log.entity_lifecycle_log", scenario);
  const outboxCountBeforeReplay = await countRows("event.outbox", scenario);

  const replay = await runtime.executeOperation(command);
  expect(replay.ok).toBe(true);
  expect(replay.replayed).toBe(true);
  expect(replay.workflowRequestId).toBe(scenario.workflowRequestId);

  expect(await countRows("document.workflow_request", scenario)).toBe(workflowCountBeforeReplay);
  expect(await countRows("log.entity_lifecycle_log", scenario)).toBe(lifecycleLogCountBeforeReplay);
  expect(await countRows("event.outbox", scenario)).toBe(outboxCountBeforeReplay);
}

async function expectRuntimeRows(scenario: RuntimeScenario, sourceTable: string): Promise<void> {
  const source = await executeFirstOrThrow(sql<{
    status: string;
    workflow_request_id: string | null;
    status_changed_by: string | null;
    updated_by: string | null;
  }>`
    select status, workflow_request_id, status_changed_by, updated_by
    from ${sql.raw(sourceTable)}
    where tenant_id = ${scenario.tenantId}::uuid and id = ${scenario.entityId}::uuid
  `);

  expect(source.status).toBe("pending_approval");
  expect(source.workflow_request_id).toBe(scenario.workflowRequestId);
  expect(source.status_changed_by).toBe(scenario.principalId);
  expect(source.updated_by).toBe(scenario.principalId);

  const lifecycle = await executeFirstOrThrow(sql<{ state_id: string }>`
    select state_id
    from master.lifecycle_instance
    where tenant_id = ${scenario.tenantId}::uuid
      and entity_name = ${scenario.entityName}
      and entity_id = ${scenario.entityId}
  `);
  expect(lifecycle.state_id).toBe(scenario.pendingStateId);

  const workflow = await executeFirstOrThrow(sql<{ status: string }>`
    select status
    from document.workflow_request
    where tenant_id = ${scenario.tenantId}::uuid
      and id = ${scenario.workflowRequestId}::uuid
  `);
  expect(workflow.status).toBe("pending");

  const commandLog = await executeFirstOrThrow(sql<{ status: string; result: unknown }>`
    select status, result
    from document.command_log
    where tenant_id = ${scenario.tenantId}::uuid
      and operation = ${`${scenario.entityName}:${scenario.entityId}:submit`}
      and idempotency_key = ${scenario.idempotencyKey}
  `);
  expect(commandLog.status).toBe("done");
  expect(commandLog.result).toEqual(expect.objectContaining({
    ok: true,
    entityName: scenario.entityName,
    workflowRequestId: scenario.workflowRequestId,
  }));

  const lifecycleLog = await executeFirstOrThrow(sql<{ count: string }>`
    select count(*)::text as count
    from log.entity_lifecycle_log
    where tenant_id = ${scenario.tenantId}::uuid
      and entity_type = ${scenario.entityName}
      and entity_id = ${scenario.entityId}::uuid
      and operation_code = 'submit'
      and from_status = 'draft'
      and to_status = 'pending_approval'
  `);
  expect(Number(lifecycleLog.count)).toBeGreaterThanOrEqual(1);

  const outbox = await executeFirstOrThrow(sql<{ count: string }>`
    select count(*)::text as count
    from event.outbox
    where tenant_id = ${scenario.tenantId}::uuid
      and topic = 'lifecycle'
      and event_type = 'state_transitioned'
      and entity_type = ${scenario.entityName}
      and entity_id = ${scenario.entityId}::uuid
  `);
  expect(Number(outbox.count)).toBe(1);
}

async function seedRuntimeScenario(entityName: RuntimeScenario["entityName"]): Promise<RuntimeScenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const scenario: RuntimeScenario = {
    tenantId: randomUUID(),
    principalId: randomUUID(),
    legalEntityId: randomUUID(),
    companyCodeId: randomUUID(),
    lifecycleId: randomUUID(),
    draftStateId: randomUUID(),
    pendingStateId: randomUUID(),
    transitionId: randomUUID(),
    lifecycleInstanceId: randomUUID(),
    entityName,
    entityId: randomUUID(),
    workflowRequestId: randomUUID(),
    idempotencyKey: `wf-int-${suffix}`,
  };

  await seedGlobalReferences();
  await seedTenantGraph(scenario, suffix);
  await seedLifecycleMetadata(scenario, suffix);
  await seedSourceEntity(scenario, suffix);
  return scenario;
}

async function seedGlobalReferences(): Promise<void> {
  await sql`
    insert into shared.country (code, name, created_by)
    values ('US', 'United States', ${SYSTEM_ACTOR}::uuid)
    on conflict (code) do nothing
  `.execute(mustDb());

  await sql`
    insert into shared.currency (code, name, minor_units, created_by)
    values ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid)
    on conflict (code) do nothing
  `.execute(mustDb());
}

async function seedTenantGraph(scenario: RuntimeScenario, suffix: string): Promise<void> {
  await sql`
    insert into master.tenant (
      id, code, name, display_name, realm_key, tenant_type, status, created_by
    )
    values (
      ${scenario.tenantId}::uuid,
      ${`wfint${suffix}`},
      ${`Workflow Runtime Integration ${suffix}`},
      ${`Workflow Runtime Integration ${suffix}`},
      'neon',
      'customer',
      'active',
      ${SYSTEM_ACTOR}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.principal (
      id, tenant_id, code, name, principal_type, status, created_by
    )
    values (
      ${scenario.principalId}::uuid,
      ${scenario.tenantId}::uuid,
      ${`wf_actor_${suffix}`},
      'Workflow Runtime Actor',
      'user',
      'active',
      ${SYSTEM_ACTOR}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.legal_entity (
      id, tenant_id, code, name, entity_type, country_code,
      functional_currency, reporting_currency, status, created_by
    )
    values (
      ${scenario.legalEntityId}::uuid,
      ${scenario.tenantId}::uuid,
      ${`LE${suffix}`},
      'Workflow Runtime Legal Entity',
      'standalone',
      'US',
      'USD',
      'USD',
      'active',
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.company_code (
      id, tenant_id, code, name, legal_entity_id,
      functional_currency, country_code, status, created_by
    )
    values (
      ${scenario.companyCodeId}::uuid,
      ${scenario.tenantId}::uuid,
      ${`CC${suffix}`},
      'Workflow Runtime Company Code',
      ${scenario.legalEntityId}::uuid,
      'USD',
      'US',
      'active',
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());
}

async function seedLifecycleMetadata(scenario: RuntimeScenario, suffix: string): Promise<void> {
  await sql`
    insert into control.lifecycle (
      id, tenant_id, code, name, is_active, config, created_by
    )
    values (
      ${scenario.lifecycleId}::uuid,
      ${scenario.tenantId}::uuid,
      ${`wf_${scenario.entityName}_${suffix}`},
      ${`Workflow Runtime ${scenario.entityName}`},
      true,
      '{}'::jsonb,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into control.lifecycle_state (
      id, tenant_id, lifecycle_id, code, name, is_initial, is_terminal,
      sort_order, config, created_by
    )
    values (
      ${scenario.draftStateId}::uuid,
      ${scenario.tenantId}::uuid,
      ${scenario.lifecycleId}::uuid,
      'draft',
      'Draft',
      true,
      false,
      10,
      '{}'::jsonb,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into control.lifecycle_state (
      id, tenant_id, lifecycle_id, code, name, is_initial, is_terminal,
      sort_order, config, created_by
    )
    values (
      ${scenario.pendingStateId}::uuid,
      ${scenario.tenantId}::uuid,
      ${scenario.lifecycleId}::uuid,
      'pending_approval',
      'Pending Approval',
      false,
      false,
      20,
      '{}'::jsonb,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into control.lifecycle_transition (
      id, tenant_id, lifecycle_id, from_state_id, to_state_id,
      operation_code, is_active, config, created_by
    )
    values (
      ${scenario.transitionId}::uuid,
      ${scenario.tenantId}::uuid,
      ${scenario.lifecycleId}::uuid,
      ${scenario.draftStateId}::uuid,
      ${scenario.pendingStateId}::uuid,
      'submit',
      true,
      '{}'::jsonb,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    insert into master.lifecycle_instance (
      id, tenant_id, entity_name, entity_id, lifecycle_id,
      state_id, created_by, updated_by
    )
    values (
      ${scenario.lifecycleInstanceId}::uuid,
      ${scenario.tenantId}::uuid,
      ${scenario.entityName},
      ${scenario.entityId},
      ${scenario.lifecycleId}::uuid,
      ${scenario.draftStateId}::uuid,
      ${scenario.principalId}::uuid,
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());
}

async function seedSourceEntity(scenario: RuntimeScenario, suffix: string): Promise<void> {
  if (scenario.entityName === "purchase_invoice") {
    await sql`
      insert into document.purchase_invoice (
        id, tenant_id, code, name, company_code_id, code,
        invoice_source, invoice_type, match_type,
        supplier_invoice_number, supplier_invoice_date, document_date,
        posting_date, received_date, currency_code, base_currency_code,
        subtotal_amount, total_amount, fiscal_year, period_number,
        tax_mode, tax_mode_source,
        status, created_by
      )
      values (
        ${scenario.entityId}::uuid,
        ${scenario.tenantId}::uuid,
        ${`PI${suffix}`},
        'Workflow Runtime Purchase Invoice',
        ${scenario.companyCodeId}::uuid,
        ${`PI-${suffix}`},
        'non_po',
        'standard',
        'no_match',
        ${`SUP-${suffix}`},
        current_date,
        current_date,
        current_date,
        current_date,
        'USD',
        'USD',
        125.00,
        125.00,
        2026,
        1,
        'no_tax',
        'user_override',
        'draft',
        ${scenario.principalId}::uuid
      )
    `.execute(mustDb());
    return;
  }

  await sql`
    insert into document.payment_entry (
      id, tenant_id, code, name, company_code_id, payment_number,
      supplier_name, payment_method_id, document_date, posting_date,
      value_date, currency_code, base_currency_code, payment_amount,
      fiscal_year, period_number, status, created_by
    )
    values (
      ${scenario.entityId}::uuid,
      ${scenario.tenantId}::uuid,
      ${`PE${suffix}`},
      'Workflow Runtime Payment Entry',
      ${scenario.companyCodeId}::uuid,
      ${`PAY-${suffix}`},
      'Workflow Runtime Supplier',
      ${randomUUID()}::uuid,
      current_date,
      current_date,
      current_date,
      'USD',
      'USD',
      125.00,
      2026,
      1,
      'draft',
      ${scenario.principalId}::uuid
    )
  `.execute(mustDb());
}

async function cleanupRuntimeScenario(scenario: RuntimeScenario): Promise<void> {
  await sql`delete from event.outbox where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from log.entity_lifecycle_log where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from document.command_log where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from document.purchase_invoice where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from document.payment_entry where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from document.workflow_request where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from master.lifecycle_instance where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from control.lifecycle_transition where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from control.lifecycle_state where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from control.lifecycle where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from master.company_code where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from master.legal_entity where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from master.principal where tenant_id = ${scenario.tenantId}::uuid`.execute(mustDb());
  await sql`delete from master.tenant where id = ${scenario.tenantId}::uuid`.execute(mustDb());
}

async function countRows(table: string, scenario: RuntimeScenario): Promise<number> {
  const row = await executeFirstOrThrow(sql<{ count: string }>`
    select count(*)::text as count
    from ${sql.raw(table)}
    where tenant_id = ${scenario.tenantId}::uuid
  `);
  return Number(row.count);
}

async function executeFirstOrThrow<T>(query: RawBuilder<T>): Promise<T> {
  const result = await query.execute(mustDb());
  const row = result.rows[0];
  if (!row) throw new Error("Expected query to return a row");
  return row;
}

function mustDb(): Kysely<unknown> {
  if (!db) {
    throw new Error("Live database is not initialized");
  }
  return db;
}
