import {sweepSupplierInformation} from "../../../server/apps/platform-host/src/composition/supplier-information-sla.js";
/** Real PostgreSQL interaction qualification; every schema/fixture mutation is rolled back. */
import assert from "node:assert/strict";
import { createKyselySlaAutomationRepository } from "../../../server/packages/platform/workflow/src/sla-automation.js";
import { createSupplierProcessCommunications } from "../../../server/apps/platform-host/src/composition/supplier-process-communications.js";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createSupplierProcessTasks } from "../../../server/apps/platform-host/src/composition/supplier-process-tasks.js";
import { createSupplierProcessSubmission } from "../../../server/apps/platform-host/src/composition/supplier-process-submission.js";
import { createSupplierProcessSelectionService } from "../../../server/apps/platform-host/src/composition/supplier-process-selection.js";
import { KyselyBusinessPartnerCaseRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js";
import { createKyselyProcessDocumentIntentPort, createKyselyProcessSelectionEvidenceRepository } from "../../../server/packages/platform/governance/src/index.js";
import { processManifestHash } from "../../../server/packages/platform/control-admin/src/cycle/process-selection-compiler.js";
import { createSupplierProcessEditPolicy } from "../../../server/apps/platform-host/src/composition/supplier-process-edit-policy.js";
import { calculateDefinitionHash } from "../../../server/packages/platform/policy/src/policy-authoring-service.js";
import type { PolicyDefinition } from "../../../server/packages/contracts/policy/src/index.js";

const require = createRequire(new URL("../../../server/db/package.json", import.meta.url));
const { Pool } = require("pg"), { Kysely, PostgresDialect, sql } = require("kysely");
const host = execFileSync("docker", ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", "athyper-dev-db-1"], { encoding: "utf8" }).trim();
const db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ host, user: "postgres", database: "athyper_neon",
  password: readFileSync(`${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`, "utf8").trim() }) }) });
const tenant = "44444444-4444-4444-8444-444444444444", maker = "cca94907-7519-5871-8e3c-6b11aa545c93";
const fixture = JSON.parse(readFileSync("governance/policy/reports/supplier-onboarding-p9-fixtures.dev.json", "utf8")).cases[0];
const consultation = process.argv.includes("--consultation");
const boundedPause = process.argv.includes("--bounded-pause");
const report: any = { at: new Date().toISOString(), passed: false, checks: [],
  boundary: "Real owning submission/task commands and PostgreSQL interaction function, application-role privilege checks. Controlled authorizer, pre-acceptance manifest extension and document-ready port. All writes including canonical DDL roll back; no live rendering/browser/publication claim." };
const rollback = new Error("ROLLBACK_TASK_INFORMATION");
const context: any = { tenantId: tenant, principalId: maker, planeKey: "neon", requestId: randomUUID(), profileHash: "qualification" };
async function actor(tx: any, id: string) {
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${id},true),set_config('app.database_plane','neon',true),set_config('app.current_actor_type','user',true)`.execute(tx);
}
async function denies(tx: any, name: string, call: () => Promise<unknown>, pattern: RegExp) {
  await sql.raw("SAVEPOINT interaction_probe").execute(tx);
  try { await call(); assert.fail(`Expected rejection: ${name}`); }
  catch (error) { assert.match(String(error), pattern); report.checks.push(name); }
  finally { await sql.raw("ROLLBACK TO SAVEPOINT interaction_probe").execute(tx); }
}
try {
  await db.transaction().execute(async (tx: any) => {
  await sql.raw(readFileSync("server/db/ddl/common/control/17_process_task_rule_publication.sql", "utf8")).execute(tx);
    await sql.raw("SET LOCAL lock_timeout='2s'").execute(tx);
    await sql.raw(readFileSync("server/db/ddl/planes/neon/document/07_task_interactions.sql", "utf8")).execute(tx);
    const reviewerFunctions = readFileSync("server/db/ddl/planes/neon/document/07_functions.sql", "utf8");
    for (const name of ["process_case_has_contributor", "process_case_reviewers"]) {
      const start = reviewerFunctions.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`);
      await sql.raw(reviewerFunctions.slice(start,reviewerFunctions.indexOf("$$;",start)+3)).execute(tx);
    }
    await actor(tx, maker);
    await sql.raw(readFileSync("server/db/ddl/planes/neon/control/16_supplier_communications_reference_seed.sql", "utf8")).execute(tx);
    const repository = new KyselyBusinessPartnerCaseRepository();
    const editDefinition: PolicyDefinition = { id: randomUUID(), tenantId: tenant, entityType: "workflow.task_edit", name: "Rollback task edit qualification",
      priority: 10, evaluationMode: "all", effectiveFrom: "2026-09-14", versionNo: 1,
      rules: [{ id: randomUUID(), priority: 1, condition: { "==": [1, 1] }, action: "require_workflow", metadata: {},
        actionConfig: { schema: "athyper.task-edit-result/1", paths: ["/proposedPayload/website"], effect: "full_reapproval" } }] };
    const editHash = calculateDefinitionHash(editDefinition);
    await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,definition_hash,status,created_by)
      VALUES(${editDefinition.id}::uuid,${tenant}::uuid,${editDefinition.entityType},${editDefinition.name},10,'all','2026-09-14',1,${editHash},'draft',${maker}::uuid)`.execute(tx);
    for (const rule of editDefinition.rules) await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,created_by)
      VALUES(${rule.id}::uuid,${editDefinition.id}::uuid,${rule.priority},${JSON.stringify(rule.condition)}::jsonb,${rule.action},${JSON.stringify(rule.actionConfig)}::jsonb,'{}'::jsonb,${maker}::uuid)`.execute(tx);
    await sql`UPDATE control.policy_definition SET status='active',definition_hash=${editHash} WHERE id=${editDefinition.id}::uuid`.execute(tx);
    const base = createSupplierProcessSelectionService({ repository, authorizer: { authorize: async () => ({ allowed: true }) }, audit: {} as never,
      transactions: {} as never, authenticate: (() => {}) as never, readContext: () => context });
    const evidenceRepo = createKyselyProcessSelectionEvidenceRepository();
    async function preview(ctx: any, caseId: string, transaction: any) {
      const value = await base.preview(ctx, caseId, transaction);
      assert.equal(value.status, "ready");
      if (value.status !== "ready") throw new Error(value.code);
      const m = structuredClone(value.selection.executionManifest);
      const tasks = m.tasks.map(t => t.executionKind === "review" || t.executionKind === "approval"
        ? { ...t, informationPolicy: { schema: "athyper.task-information-policy/1" as const, clockMode: boundedPause ? "bounded_pause" as const : "elapsed" as const, responseHours: 48, overdueSupervisorRole: "dev.bp.approvers.operating_organization" },
          escalationPolicy: { schema: "athyper.task-escalation-policy/1" as const, mode: consultation ? "consult" as const : "reassign" as const, ...(consultation ? {responseHours:24} : {}), supervisorRole: "dev.bp.approvers.operating_organization" } } : t);
      const manifest = { ...m, tasks, editPolicy: { id: editDefinition.id, definitionId: editDefinition.id, version: 1, hash: editHash, effectiveOn: "2026-09-14" } };
      manifest.revision = { ...m.revision, hash: processManifestHash(manifest) };
      return { ...value, selection: { ...value.selection, executionManifest: manifest } };
    }
    const selection: any = { preview, select: async (ctx: any, caseId: string, coordinate: any, key: string, transaction: any) => {
      const value = await preview(ctx, caseId, transaction);
      return evidenceRepo.append({ ...value.selection, coordinate, actorPrincipalId: ctx.principalId, reason: null,
        acceptedAt: new Date().toISOString(), idempotencyKey: key }, transaction);
    } };
    const submission = createSupplierProcessSubmission({ selection, documents: createKyselyProcessDocumentIntentPort(),
      submitCase: (c, t) => repository.submitForProcess({ tenantId: tenant, requestId: c.requestId, expectedVersion: c.expectedVersion, submittedBy: maker, idempotencyKey: c.idempotencyKey }, t) });
    const current = await repository.get(tenant, fixture.id, tx); assert.ok(current);
    const command = { context, requestId: fixture.id, expectedVersion: fixture.validatedVersion, idempotencyKey: randomUUID() };
    await submission.lock(command, tx);
    const submitted = await submission.submit(command, current, tx); assert.ok(submitted.process);
    await sql`UPDATE governance.process_document_job SET status='ready',result=jsonb_build_object('status','ready','scanStatus','clean','sha256',repeat('a',64),'attachmentId',${randomUUID()}::text,'attachmentVersionId',${randomUUID()}::text,'coordinate',intent->'coordinate','template',intent->'binding'->'template','sourceSnapshot',intent->'sourceSnapshot','jobId',id::text) WHERE tenant_id=${tenant}::uuid AND id=${submitted.process.reviewPackJobId}::uuid`.execute(tx);
    const tasks = createSupplierProcessTasks({ authorizer: { authorize: async () => ({ allowed: true }) } });
    await tasks.start(context, fixture.id, tx);
    const item = (await sql`SELECT * FROM document.work_item WHERE tenant_id=${tenant}::uuid AND source_entity_id=${fixture.id}::uuid AND status='open' AND payload->>'attemptId'=${submitted.process.attemptId} ORDER BY id LIMIT 1`.execute(tx)).rows[0];
    assert.ok(item);
    const reviewer = item.assignee_principal_id;
    await actor(tx, reviewer);
    await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
    const communications = createSupplierProcessCommunications({ authorizer: { authorize: async () => ({ allowed: true }) }, transactions: {} as never, consent: {} as never, authorizeArtifact: async () => undefined });
    const noticeAllowed = async (source: any, principalId: string) => {
      let allowed = false;
      await communications.policy.forRecipient!(source, principalId, tx, async () => { allowed = await communications.policy.authorizeRecipient!(source, principalId, "in_app", tx); });
      return allowed;
    };
    const notice = async (eventCode: string, payload: object) => communications.policy.prepare!({ id: randomUUID(), planeKey: "neon", tenantId: tenant, actorPrincipalId: reviewer, eventCode, occurredAt: new Date().toISOString(), entityType: "business_partner_case", entityId: fixture.id, payload: { ...payload, recipient_principal_ids: [randomUUID()] } }, tx);
    let version = Number(item.row_version);
    const requestKey = randomUUID();
    const call = async (action: string, text: string | null, key = randomUUID(), expected = version) =>
      (await sql`SELECT document.command_process_task_information(${tenant}::uuid,${fixture.id}::uuid,${item.id}::uuid,${submitted.process.attemptId}::uuid,${action},${expected},${text},${key},${action === "respond" ? maker : reviewer}::uuid) result`.execute(tx)).rows[0].result;
    const requested = await call("request", "Please explain this registration reference.", requestKey); version++;

    const original=(await sql`SELECT assignee_principal_id,due_at FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0];
    await sql.raw('SAVEPOINT manual_escalation').execute(tx);
    const key=randomUUID();const escalated=await call('escalate','Requester has not responded; supervisor follow-up required.',key);assert.equal(escalated.state,'open');
    const replay=await call('escalate','Requester has not responded; supervisor follow-up required.',key,version);assert.equal(replay.replayed,true);
    const manualNotice:any=await notice('workflow.task.information_escalate',{information_id:requested.informationId,work_item_id:item.id});assert.deepEqual(manualNotice.recipientPrincipalIds,[reviewer]);
    report.checks.push('Manual response escalation may notify its existing reviewer as supervisor; exact replay emits one notice');
    await sql.raw('ROLLBACK TO SAVEPOINT manual_escalation').execute(tx);
    await sql.raw('RESET ROLE').execute(tx);
    const maintenance=(await sql`SELECT event.fn_notification_worker_principal(${tenant}::uuid) id`.execute(tx)).rows[0].id;
    await actor(tx,maintenance);await sql.raw('SET SESSION AUTHORIZATION athyper_worker').execute(tx);
    await denies(tx,'Maintenance actor cannot escalate before the real response deadline',()=>sql`SELECT document.command_process_task_information(${tenant}::uuid,${fixture.id}::uuid,${item.id}::uuid,${submitted.process.attemptId}::uuid,'escalate',${version},'Too early',${randomUUID()},${maintenance}::uuid)`.execute(tx),/PROCESS_INFORMATION_FORBIDDEN/);
    await sql.raw('RESET SESSION AUTHORIZATION').execute(tx);
    await sql`UPDATE document.process_task_information SET due_at=clock_timestamp()-interval '1 second' WHERE id=${requested.informationId}::uuid`.execute(tx);
    const discovered=(await sql`SELECT tenant_id FROM document.fn_workflow_sla_due_tenants(clock_timestamp(),1000)`.execute(tx)).rows;assert.ok(discovered.some((r:any)=>r.tenant_id===tenant));report.checks.push('Discovery includes the overdue response independently of the decision deadline');
    await sql.raw('SET SESSION AUTHORIZATION athyper_worker').execute(tx);
    const scope={planeKey:'neon' as const,tenantId:tenant,principalId:maintenance};
    await sweepSupplierInformation({run:async(_p:any,_a:any,work:any)=>work(tx)} as any,scope);
    await sweepSupplierInformation({run:async(_p:any,_a:any,work:any)=>work(tx)} as any,scope);
    await sql.raw('RESET SESSION AUTHORIZATION').execute(tx);
    const x=(await sql`SELECT * FROM document.process_task_information WHERE id=${requested.informationId}::uuid`.execute(tx)).rows[0];assert.equal(x.escalated_to,reviewer);assert.equal(x.state,'open');assert.ok(x.escalated_at);
    const preserved=(await sql`SELECT assignee_principal_id,due_at FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0];assert.deepEqual(preserved,original);
    report.checks.push('Actual worker session and SLA sweep escalate expired requester response once; assignment, deadline and unresolved response remain intact');
    await sql.raw('RESET SESSION AUTHORIZATION').execute(tx);await sql.raw('SET LOCAL ROLE athyperapp').execute(tx);await actor(tx,reviewer);version++;
    const source:any=await notice('workflow.task.information_escalate',{information_id:requested.informationId,work_item_id:item.id});assert.deepEqual(source.recipientPrincipalIds,[reviewer]);assert.equal(await noticeAllowed(source,reviewer),true);
    await denies(tx,'Supervisor notification does not unblock approval',()=>tasks.decide({...context,principalId:reviewer},fixture.id,{attemptId:submitted.process.attemptId,cycleTaskId:item.cycle_task_id,workflowRequestId:item.payload.workflowRequestId,workflowStageId:item.payload.workflowStageId,workItemId:item.id,expectedWorkItemVersion:version,action:item.payload.action,idempotencyKey:randomUUID()},tx),/PROCESS_INFORMATION_PENDING/);
    await actor(tx,maker);await call('respond','Confirmed current.');version++;await actor(tx,reviewer);assert.equal(await noticeAllowed(source,reviewer),false);report.checks.push('Responding suppresses a stale supervisor notification');
    report.passed=true;throw rollback;
  });
}catch(error){if(error!==rollback){report.error=String(error);throw error;}}
finally{await db.destroy();writeFileSync('governance/policy/reports/task-response-escalation-db.dev.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
