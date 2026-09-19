#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import {
  createGovernedInternalBusinessPartnerCaseService,
  KyselyGovernedInternalBusinessPartnerCaseRepository,
  registerGovernedInternalBusinessPartnerRoutes,
} from "./index.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: databaseUrl, max: 1 }),
  }),
});
const rollback = Symbol("rollback");

try {
  await database.transaction().execute(async (tx) => {
    const identity = (
      await sql`SELECT p.tenant_id::text tenant_id,(array_agg(p.id::text ORDER BY p.id))[1] maker,(array_agg(p.id::text ORDER BY p.id))[2] checker FROM master.principal p WHERE p.status='active' GROUP BY p.tenant_id HAVING count(*)>=2 ORDER BY p.tenant_id LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    const wrong = (
      await sql`SELECT t.id::text,p.id::text actor_id FROM master.tenant t JOIN LATERAL(SELECT id FROM master.principal p WHERE p.tenant_id=t.id AND p.status='active' ORDER BY p.id LIMIT 1)p ON true WHERE t.id<>${String(identity?.tenant_id ?? "")}::uuid ORDER BY t.id LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    assert(
      identity && wrong,
      "HTTP probe requires two active principals and another tenant",
    );
    const tenantId = String(identity.tenant_id),
      maker = String(identity.maker),
      checker = String(identity.checker),
      wrongTenantId = String(wrong.id),
      wrongTenantActor = String(wrong.actor_id);
    const fixture = {
      caseId: randomUUID(),
      contractId: randomUUID(),
      contractEntityId: randomUUID(),
      releaseId: randomUUID(),
      revisionId: randomUUID(),
      formId: randomUUID(),
      cycleTypeId: randomUUID(),
      phaseId: randomUUID(),
      categoryId: randomUUID(),
      templateId: randomUUID(),
      templateRevisionId: randomUUID(),
      runId: randomUUID(),
      taskId: randomUUID(),
      suffix: randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
    };
    await context(tx, tenantId, maker);
    await sql`INSERT INTO runtime_meta.entity_contract(id,tenant_id,entity_id,entity_code,release_id,revision_id,release_no,contract_schema_code,contract_schema_version,entity_contract_hash,contract_json,publication_key,signature_algorithm,signing_key_id,signature,published_at,status,status_changed_at) VALUES(${fixture.contractId}::uuid,${tenantId}::uuid,${fixture.contractEntityId}::uuid,'master.business_partner',${fixture.releaseId}::uuid,${fixture.revisionId}::uuid,1,'athyper.entity-contract','1.0.0',${"e".repeat(64)},${JSON.stringify({ type: "object", required: ["businessPartnerCode", "name", "ownershipClass"], additionalProperties: false, properties: { businessPartnerCode: { type: "string" }, name: { type: "string" }, ownershipClass: { type: "string" } } })}::jsonb,'g1.http','ed25519','g1-http-key','probe',clock_timestamp()-interval '1 second','published',clock_timestamp())`.execute(
      tx,
    );
    await sql`INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,status,status_changed_at,status_changed_by,created_by) VALUES(${fixture.cycleTypeId}::uuid,${tenantId}::uuid,${`G1.HTTP.${fixture.suffix}`},'G1 HTTP','governance_review','adhoc','active',clock_timestamp(),${maker}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO control.cycle_phase(id,tenant_id,cycle_type_id,code,name,sort_order,status,status_changed_at,status_changed_by,created_by) VALUES(${fixture.phaseId}::uuid,${tenantId}::uuid,${fixture.cycleTypeId}::uuid,'REVIEW','Review',1,'active',clock_timestamp(),${maker}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO control.cycle_task_category(id,tenant_id,cycle_type_id,code,name,status,status_changed_at,status_changed_by,created_by) VALUES(${fixture.categoryId}::uuid,${tenantId}::uuid,${fixture.cycleTypeId}::uuid,'APPROVAL','Approval','active',clock_timestamp(),${maker}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO control.cycle_task_template(id,tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,completion_mode,status,status_changed_at,status_changed_by,created_by) VALUES(${fixture.templateId}::uuid,${tenantId}::uuid,${fixture.cycleTypeId}::uuid,${fixture.phaseId}::uuid,${fixture.categoryId}::uuid,'document.entity_case','DECIDE','Decide','manual','active',clock_timestamp(),${maker}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO control.cycle_template_revision(id,tenant_id,cycle_type_id,revision_number,template_json,template_hash,topological_task_ids,idempotency_key,published_by,created_by) VALUES(${fixture.templateRevisionId}::uuid,${tenantId}::uuid,${fixture.cycleTypeId}::uuid,1,'{}',${"f".repeat(64)},ARRAY[${fixture.templateId}::uuid],${`g1-http-template-${fixture.suffix}`},${maker}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO governance.cycle_run(id,tenant_id,cycle_type_id,template_revision_id,template_revision_number,template_hash,code,name,idempotency_key,status,created_by) VALUES(${fixture.runId}::uuid,${tenantId}::uuid,${fixture.cycleTypeId}::uuid,${fixture.templateRevisionId}::uuid,1,${"f".repeat(64)},${`G1.HTTP.RUN.${fixture.suffix}`},'G1 HTTP Run',${`g1-http-run-${fixture.suffix}`},'draft',${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO governance.cycle_task(id,tenant_id,cycle_run_id,cycle_type_id,task_template_id,phase_id,code,name,completion_mode,owner_principal_id,status,created_by) VALUES(${fixture.taskId}::uuid,${tenantId}::uuid,${fixture.runId}::uuid,${fixture.cycleTypeId}::uuid,${fixture.templateId}::uuid,${fixture.phaseId}::uuid,'DECIDE','Decide','manual',${checker}::uuid,'pending',${maker}::uuid)`.execute(
      tx,
    );
    const legacyBefore = Number(
      (
        await sql`SELECT count(*)::int value FROM document.business_partner_request`.execute(
          tx,
        )
      ).rows[0]?.value ?? 0,
    );

    const repository =
      new KyselyGovernedInternalBusinessPartnerCaseRepository();
    let commandNumber = 0;
    const service = createGovernedInternalBusinessPartnerCaseService({
      authorizer: {
        async authorize() {
          return { allowed: true };
        },
      },
      repository,
      transactions: {
        async run(plane, actor, work) {
          assert.equal(plane, "neon");
          const savepoint = `g1_http_${++commandNumber}`;
          await sql.raw(`SAVEPOINT ${savepoint}`).execute(tx);
          try {
            await context(tx, actor.tenantId, actor.principalId);
            const value = await work(tx);
            await sql.raw(`RELEASE SAVEPOINT ${savepoint}`).execute(tx);
            return value;
          } catch (error) {
            await sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`).execute(tx);
            await sql.raw(`RELEASE SAVEPOINT ${savepoint}`).execute(tx);
            throw error;
          }
        },
      },
    });
    const app = express();
    app.use(express.json());
    registerGovernedInternalBusinessPartnerRoutes(app, {
      authenticate: (request, response, next) => {
        const principal = String(request.headers["x-test-principal-id"] ?? "");
        const tenant = String(request.headers["x-test-tenant-id"] ?? "");
        response.locals.context = {
          planeKey: "neon",
          tenantId: tenant,
          principalId: principal,
          requestId: randomUUID(),
          profileHash: "g1-http",
          permissions: { allowed: [] },
        };
        next();
      },
      readContext: (response) => response.locals.context,
      service,
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const draftBody = {
        caseId: fixture.caseId,
        caseCode: `G1.HTTP.${fixture.suffix}`,
        entityContractId: fixture.contractId,
        entityContractHash: "e".repeat(64),
        formTemplateReleaseId: fixture.formId,
        formTemplateReleaseNo: 1,
        formTemplateHash: "a".repeat(64),
        payload: {
          businessPartnerCode: `G1.HTTP.${fixture.suffix}`,
          name: "HTTP Internal Partner",
          ownershipClass: "internal",
        },
        idempotencyKey: `g1-http-draft-${fixture.suffix}`,
      };
      const draft = await request(
        base,
        "POST",
        "/api/neon/governed-business-partner-cases",
        draftBody,
        tenantId,
        maker,
        201,
      );
      assert.equal(draft.rowVersion, 1);
      assert.equal(draft.replayed, false);
      const draftReplay = await request(
        base,
        "POST",
        "/api/neon/governed-business-partner-cases",
        draftBody,
        tenantId,
        maker,
        200,
      );
      assert.equal(draftReplay.snapshotId, draft.snapshotId);
      assert.equal(draftReplay.outboxId, draft.outboxId);
      assert.equal(draftReplay.replayed, true);
      await request(
        base,
        "POST",
        "/api/neon/governed-business-partner-cases",
        {
          ...draftBody,
          caseId: randomUUID(),
          idempotencyKey: `g1-http-invalid-${fixture.suffix}`,
          formTemplateHash: undefined,
        },
        tenantId,
        maker,
        400,
      );
      const lifecycle = {
        expectedVersion: 1,
        cycleRunId: fixture.runId,
        cycleTaskId: fixture.taskId,
        idempotencyKey: `g1-http-submit-${fixture.suffix}`,
      };
      const submitted = await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/submit`,
        lifecycle,
        tenantId,
        maker,
        201,
      );
      assert.equal(submitted.status, "submitted");
      const submittedReplay = await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/submit`,
        lifecycle,
        tenantId,
        maker,
        200,
      );
      assert.equal(submittedReplay.replayed, true);
      await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/decisions`,
        {
          decision: "approve",
          expectedVersion: 2,
          cycleRunId: fixture.runId,
          cycleTaskId: fixture.taskId,
          idempotencyKey: `g1-http-maker-${fixture.suffix}`,
        },
        tenantId,
        maker,
        403,
      );
      await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/decisions`,
        {
          decision: "approve",
          expectedVersion: 1,
          cycleRunId: fixture.runId,
          cycleTaskId: fixture.taskId,
          idempotencyKey: `g1-http-stale-${fixture.suffix}`,
        },
        tenantId,
        checker,
        409,
      );
      await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/decisions`,
        {
          decision: "approve",
          expectedVersion: 2,
          cycleRunId: fixture.runId,
          cycleTaskId: fixture.taskId,
          idempotencyKey: `g1-http-wrong-${fixture.suffix}`,
        },
        wrongTenantId,
        wrongTenantActor,
        404,
      );
      const approved = await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/decisions`,
        {
          decision: "approve",
          expectedVersion: 2,
          cycleRunId: fixture.runId,
          cycleTaskId: fixture.taskId,
          idempotencyKey: `g1-http-approve-${fixture.suffix}`,
        },
        tenantId,
        checker,
        201,
      );
      assert.equal(approved.status, "approved");
      const materializeBody = {
        expectedVersion: 3,
        idempotencyKey: `g1-http-materialize-${fixture.suffix}`,
      };
      const materialized = await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/materialize`,
        materializeBody,
        tenantId,
        checker,
        201,
      );
      assert.equal(materialized.status, "materialized");
      assert(materialized.businessPartnerId);
      const materializedReplay = await request(
        base,
        "POST",
        `/api/neon/governed-business-partner-cases/${fixture.caseId}/materialize`,
        materializeBody,
        tenantId,
        checker,
        200,
      );
      assert.equal(
        materializedReplay.businessPartnerId,
        materialized.businessPartnerId,
      );
      assert.equal(materializedReplay.replayed, true);
      await context(tx, tenantId, checker);
      const evidence = (
        await sql`SELECT (SELECT count(*)::int FROM document.entity_case_command_evidence WHERE entity_case_id=${fixture.caseId}::uuid) commands,(SELECT count(*)::int FROM event.outbox WHERE aggregate_type='entity_case' AND aggregate_id=${fixture.caseId}::uuid) outbox,(SELECT count(*)::int FROM document.business_partner_request) legacy,(SELECT count(*)::int FROM master.supplier WHERE business_partner_id=${materialized.businessPartnerId}::uuid) suppliers,(SELECT count(*)::int FROM master.customer WHERE business_partner_id=${materialized.businessPartnerId}::uuid) customers`.execute(
          tx,
        )
      ).rows[0];
      assert.deepEqual(evidence, {
        commands: 4,
        outbox: 4,
        legacy: legacyBefore,
        suppliers: 0,
        customers: 0,
      });
      process.stdout.write(
        `G1_GOVERNED_INTERNAL_BUSINESS_PARTNER_HTTP_OK case=${fixture.caseId}\n`,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await database.destroy();
}

async function context(tx, tenantId, principalId) {
  await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${principalId},true)`.execute(
    tx,
  );
}
async function request(
  base,
  method,
  path,
  body,
  tenantId,
  principalId,
  status,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-tenant-id": tenantId,
      "x-test-principal-id": principalId,
    },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(value)}`,
  );
  return value;
}
