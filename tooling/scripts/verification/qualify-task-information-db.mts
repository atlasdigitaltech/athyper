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
        ? { ...t, informationPolicy: { schema: "athyper.task-information-policy/1" as const, clockMode: boundedPause ? "bounded_pause" as const : "elapsed" as const, responseHours: 48 },
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
    if (boundedPause) {
      const paused=(await sql`SELECT due_at FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0];
      assert.equal(new Date(paused.due_at).getTime()-new Date(item.due_at).getTime(),48*3600000);
      report.checks.push("information wait pauses only the item decision deadline with a 48-hour cap");
      const reminders=item.payload.remindersAt as string[];
      if(reminders.length) {
        const repo=createKyselySlaAutomationRepository();
        const before=await repo.claimReminders!({tenantId:tenant,now:reminders[0]!,limit:10000},tx);
        assert.equal(before.some(r=>r.id===item.id),false);
        const after=await repo.claimReminders!({tenantId:tenant,now:new Date(new Date(reminders[0]!).getTime()+48*3600000).toISOString(),limit:10000},tx);
        assert.equal(after.some(r=>r.id===item.id&&r.reminderIndex===0),true);
        report.checks.push("real SLA repository shifts reminder eligibility with the bounded item deadline");
      }
    }
    assert.equal(requested.state, "open"); report.checks.push("request persists exact item and attempt");
    const requestedNotice: any = await notice("workflow.task.information_request", { information_id: requested.informationId, work_item_id: item.id });
    assert.equal(requestedNotice.eventCode, "supplier.onboarding.notice.information_requested");
    assert.deepEqual(requestedNotice.recipientPrincipalIds, [maker]);
    assert.ok(requestedNotice.payload.caseUrl.includes(item.id));
    assert.equal(JSON.stringify(requestedNotice.payload).includes("Please explain"), false);
    assert.equal(await noticeAllowed(requestedNotice, maker), true);
    assert.equal(await noticeAllowed(requestedNotice, reviewer), false);
    report.checks.push("information notice authorization rejects recipients outside the durable exchange");
    report.checks.push("information notice derives recipient from durable exchange and omits question content");
    const reviewReminder: any = await notice("workflow.work_item.reminder", { work_item_id: item.id, reminder_at: new Date().toISOString() });
    assert.equal(await noticeAllowed(reviewReminder, reviewer), false);
    report.checks.push("review reminder is suppressed while information blocks the decision");
    const replay = await call("request", "Please explain this registration reference.", requestKey, version - 1);
    assert.equal(replay.replayed, true); assert.equal(replay.informationId, requested.informationId); report.checks.push("request replay creates no second exchange");
    await denies(tx, "different replay payload rejected", () => call("request", "Changed question", requestKey, version - 1), /PROCESS_INFORMATION_REPLAY_CONFLICT/);
    await denies(tx, "second blocking exchange rejected", () => call("request", "Another question"), /PROCESS_INFORMATION_ALREADY_OPEN/);
    await denies(tx, "decision cannot bypass pending information", () => tasks.decide({ ...context, principalId: reviewer }, fixture.id, {
      attemptId: submitted.process!.attemptId, cycleTaskId: item.cycle_task_id, workflowRequestId: item.payload.workflowRequestId,
      workflowStageId: item.payload.workflowStageId, workItemId: item.id, expectedWorkItemVersion: version,
      action: item.payload.action, idempotencyKey: randomUUID(),
    }, tx), /PROCESS_INFORMATION_PENDING/);
    await denies(tx, "direct exchange update has no application privilege", () => sql`UPDATE document.process_task_information SET state='resolved' WHERE id=${requested.informationId}::uuid`.execute(tx), /permission denied/);
    await actor(tx, maker);
    const response = await call("respond", "It refers to the existing submitted certificate."); version++;
    assert.equal(response.state, "answered"); report.checks.push("requester answers without casting vote");
    assert.equal(await notice("workflow.task.information_request", { information_id: requested.informationId, work_item_id: item.id }), null);
    assert.equal(await noticeAllowed(requestedNotice, maker), false);
    const answeredNotice: any = await notice("workflow.task.information_respond", { information_id: requested.informationId, work_item_id: item.id });
    assert.deepEqual(answeredNotice.recipientPrincipalIds, [reviewer]);
    report.checks.push("answered exchange suppresses old request notice and targets assigned reviewer");
    await actor(tx, reviewer);
    const resolved = await call("resolve", null); version++;
    assert.equal(await notice("workflow.task.information_respond", { information_id: requested.informationId, work_item_id: item.id }), null);
    report.checks.push("resumed review suppresses stale answer notice");
    if (boundedPause) {
      const resumed=(await sql`SELECT i.due_at=x.decision_due_before+GREATEST(interval '0',LEAST(x.closed_at,x.due_at)-x.pause_started_at) exact_pause FROM document.work_item i JOIN document.process_task_information x ON x.work_item_id=i.id WHERE x.id=${requested.informationId}::uuid`.execute(tx)).rows[0];
      assert.equal(resumed.exact_pause,true); report.checks.push("resolution restores unused pause allowance using persisted timestamps");
    }
    assert.equal(resolved.state, "resolved"); report.checks.push("reviewer explicitly resumes same task");
    if (consultation) {
      await sql.raw("RESET ROLE").execute(tx);
      const supervisor="d04198ac-53cf-5e94-969f-b6f75f176fa2";
      await sql`INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,created_by) VALUES(${tenant}::uuid,'7ea56029-e501-5596-bc2b-9354721adc07'::uuid,${supervisor}::uuid,'manual','consultation-rollback','active',now(),${maker}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
      await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
      const consultationCommand={attemptId:submitted.process!.attemptId,workItemId:item.id,expectedWorkItemVersion:version,reason:"Please advise on the submitted certificate.",idempotencyKey:randomUUID()};
      const consulted:any=await tasks.escalate({...context,principalId:reviewer},fixture.id,consultationCommand,tx);version++;
      assert.equal(consulted.mode,"consult");assert.ok(consulted.informationId);assert.equal(consulted.replacementWorkItemId,null);
      const same=(await sql`SELECT assignee_principal_id,due_at FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0];
      assert.equal(same.assignee_principal_id,reviewer);assert.equal(new Date(same.due_at).toISOString(),new Date(item.due_at).toISOString());
      assert.equal((await tasks.escalate({...context,principalId:reviewer},fixture.id,consultationCommand,tx) as any).replayed,true);
      report.checks.push("consultation is durable/replayable and leaves the original assignment and deadline unchanged");
      await sql.raw("SAVEPOINT advisory_vote").execute(tx);
      await tasks.decide({...context,principalId:reviewer},fixture.id,{attemptId:submitted.process!.attemptId,cycleTaskId:item.cycle_task_id,workflowRequestId:item.payload.workflowRequestId,workflowStageId:item.payload.workflowStageId,workItemId:item.id,expectedWorkItemVersion:version,action:item.payload.action,idempotencyKey:randomUUID()},tx);
      assert.equal((await sql`SELECT status FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0].status,"completed");
      await sql.raw("ROLLBACK TO SAVEPOINT advisory_vote").execute(tx);
      report.checks.push("an advisory consultation does not block the original assignee's real decision command");
      await actor(tx,supervisor);
      await denies(tx,"supervisor consultation grants no assigned vote",()=>tasks.decide({...context,principalId:supervisor},fixture.id,{attemptId:submitted.process!.attemptId,cycleTaskId:item.cycle_task_id,workflowRequestId:item.payload.workflowRequestId,workflowStageId:item.payload.workflowStageId,workItemId:item.id,expectedWorkItemVersion:version,action:item.payload.action,idempotencyKey:randomUUID()},tx),/PROCESS_WORK_ITEM_FORBIDDEN/);
      await tasks.information({...context,principalId:supervisor},fixture.id,{attemptId:submitted.process!.attemptId,workItemId:item.id,expectedWorkItemVersion:version,action:"respond",text:"The certificate is consistent with the submitted facts.",idempotencyKey:randomUUID()},tx);version++;
      await actor(tx,reviewer);
      await tasks.information({...context,principalId:reviewer},fixture.id,{attemptId:submitted.process!.attemptId,workItemId:item.id,expectedWorkItemVersion:version,action:"resolve",idempotencyKey:randomUUID()},tx);version++;
      assert.equal((await sql`SELECT state FROM document.process_task_information WHERE id=${consulted.informationId}::uuid`.execute(tx)).rows[0].state,"resolved");
      report.checks.push("eligible supervisor responds and original assignee accepts advice without implied approval");
      report.passed=true;throw rollback;
    }
    const unchanged = (await sql`SELECT status,submitted_snapshot_id FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${fixture.id}::uuid`.execute(tx)).rows[0];
    assert.ok(["submitted", "in_review"].includes(unchanged.status)); report.checks.push("information journey leaves case decision unchanged");
    await call("request", "A second clarification."); version++;
    const dueBeforeTransfer=(await sql`SELECT due_at FROM document.work_item WHERE id=${item.id}::uuid`.execute(tx)).rows[0].due_at;
    await sql.raw("SAVEPOINT escalation_branch").execute(tx);
    const escalation = { attemptId: submitted.process!.attemptId, workItemId: item.id, expectedWorkItemVersion: version,
      reason: "Supervisor assistance required", idempotencyKey: randomUUID() };
    await denies(tx, "missing supervisor blocks reassignment", () => tasks.escalate({ ...context, principalId: reviewer }, fixture.id, escalation, tx), /PROCESS_SUPERVISOR_UNRESOLVED/);
    await sql.raw("RESET ROLE").execute(tx);
    const supervisor = "d04198ac-53cf-5e94-969f-b6f75f176fa2";
    await sql`INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,created_by)
      VALUES(${tenant}::uuid,'7ea56029-e501-5596-bc2b-9354721adc07'::uuid,${supervisor}::uuid,'manual','task-escalation-rollback-qualification','active',now(),${maker}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
    await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
    const transferred: any = await tasks.escalate({ ...context, principalId: reviewer }, fixture.id, escalation, tx);
    assert.equal(transferred.supervisorId, supervisor); assert.ok(transferred.replacementWorkItemId);
    const transferReplay: any = await tasks.escalate({ ...context, principalId: reviewer }, fixture.id, escalation, tx);
    assert.equal(transferReplay.replayed, true); assert.equal(transferReplay.replacementWorkItemId, transferred.replacementWorkItemId);
    report.checks.push("supervisor replacement is durable and replayable without mutating original assignment");
    await denies(tx, "old assignee loses voting authority after transfer", () => tasks.decide({ ...context, principalId: reviewer }, fixture.id, {
      attemptId: submitted.process!.attemptId, cycleTaskId: item.cycle_task_id, workflowRequestId: item.payload.workflowRequestId,
      workflowStageId: item.payload.workflowStageId, workItemId: item.id, expectedWorkItemVersion: version,
      action: item.payload.action, idempotencyKey: randomUUID(),
    }, tx), /PROCESS_WORK_ITEM_CONFLICT/);
    const supervisorNotice: any = await notice("workflow.task.supervisor_escalated", { history_id: transferred.historyId, work_item_id: transferred.replacementWorkItemId });
    assert.deepEqual(supervisorNotice.recipientPrincipalIds, [supervisor]);
    assert.ok(supervisorNotice.payload.caseUrl.includes(transferred.replacementWorkItemId));
    report.checks.push("supervisor notice targets durable replacement assignment");
    const replacement = (await sql`SELECT * FROM document.work_item WHERE tenant_id=${tenant}::uuid AND id=${transferred.replacementWorkItemId}::uuid`.execute(tx)).rows[0];
    assert.equal(new Date(replacement.due_at).toISOString(), new Date(dueBeforeTransfer).toISOString());
    const exchange = (await sql`SELECT * FROM document.process_task_information WHERE tenant_id=${tenant}::uuid AND work_item_id=${replacement.id}::uuid`.execute(tx)).rows[0];
    assert.equal(exchange.requested_by, supervisor); assert.equal(exchange.state, "open"); assert.ok(exchange.source_information_id);
    report.checks.push("open information transfers with lineage and original decision deadline");
    const continuationEvent = (await sql`SELECT payload FROM event.outbox WHERE tenant_id=${tenant}::uuid AND event_key=${`task-information:${exchange.id}:request`}`.execute(tx)).rows[0];
    assert.equal(continuationEvent.payload.work_item_id, replacement.id);
    report.checks.push("transferred open information emits one replacement notice intent with current coordinates");
    await actor(tx, maker);
    await tasks.information(context, fixture.id, { attemptId: submitted.process!.attemptId, workItemId: replacement.id,
      expectedWorkItemVersion: 1, action: "respond", text: "Clarification for the supervisor.", idempotencyKey: randomUUID() }, tx);
    await actor(tx, supervisor);
    await tasks.information({ ...context, principalId: supervisor }, fixture.id, { attemptId: submitted.process!.attemptId, workItemId: replacement.id,
      expectedWorkItemVersion: 2, action: "resolve", idempotencyKey: randomUUID() }, tx);
    await tasks.decide({ ...context, principalId: supervisor }, fixture.id, {
      attemptId: submitted.process!.attemptId, cycleTaskId: item.cycle_task_id, workflowRequestId: item.payload.workflowRequestId,
      workflowStageId: item.payload.workflowStageId, workItemId: replacement.id, expectedWorkItemVersion: 3,
      action: item.payload.action, idempotencyKey: randomUUID(),
    }, tx);
    assert.equal((await sql`SELECT status FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${fixture.id}::uuid`.execute(tx)).rows[0].status, "approved");
    report.checks.push("eligible supervisor completes the original final task through real command and quorum gates");
    await sql.raw("ROLLBACK TO SAVEPOINT escalation_branch").execute(tx);
    await actor(tx, reviewer);
    await tasks.decide({ ...context, principalId: reviewer }, fixture.id, {
      attemptId: submitted.process!.attemptId, cycleTaskId: item.cycle_task_id, workflowRequestId: item.payload.workflowRequestId,
      workflowStageId: item.payload.workflowStageId, workItemId: item.id, expectedWorkItemVersion: version,
      action: "return", reason: "Business data needs correction", idempotencyKey: randomUUID(),
    }, tx);
    const cancelled = (await sql`SELECT state FROM document.process_task_information WHERE tenant_id=${tenant}::uuid AND work_item_id=${item.id}::uuid ORDER BY created_at DESC LIMIT 1`.execute(tx)).rows[0];
    assert.equal(cancelled.state, "cancelled"); report.checks.push("return cancels outstanding information atomically");
    await actor(tx, maker);
    await denies(tx, "late answer cannot revive returned attempt", () => call("respond", "Too late"), /PROCESS_INFORMATION_STALE/);
    const editable = await repository.get(tenant, fixture.id, tx); assert.ok(editable);
    const edits = createSupplierProcessEditPolicy({ repository, authorizer: { authorize: async () => ({ allowed: true }) }, transactions: {} as never, audit: {} as never });
    const edit = { context, requestId: fixture.id, expectedVersion: editable.rowVersion, proposedPayload: { website: "https://correction.invalid" } };
    const previewEdit: any = await edits.preview(edit, tx);
    assert.equal(previewEdit.result.effect, "full_reapproval"); assert.equal(previewEdit.result.revision.hash, editHash);
    await sql.raw("SET LOCAL ROLE postgres").execute(tx);
    const successor = { ...editDefinition, id: randomUUID(), versionNo: 2,
      rules: editDefinition.rules.map(rule => ({ ...rule, id: randomUUID(), action: "deny" as const, actionConfig: { ...rule.actionConfig, effect: "deny" } })) };
    const successorHash = calculateDefinitionHash(successor);
    await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,definition_hash,status,created_by)
      VALUES(${successor.id}::uuid,${tenant}::uuid,${successor.entityType},${successor.name},10,'all','2026-09-14',2,${successorHash},'draft',${maker}::uuid)`.execute(tx);
    for (const rule of successor.rules) await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,created_by)
      VALUES(${rule.id}::uuid,${successor.id}::uuid,${rule.priority},${JSON.stringify(rule.condition)}::jsonb,${rule.action},${JSON.stringify(rule.actionConfig)}::jsonb,'{}'::jsonb,${maker}::uuid)`.execute(tx);
    await sql`UPDATE control.policy_definition SET status='active',definition_hash=${successorHash} WHERE id=${successor.id}::uuid`.execute(tx);
    await sql.raw("SET LOCAL ROLE athyperapp").execute(tx);
    const guarded: any = await edits.guard(edit, editable, tx);
    assert.deepEqual(guarded, previewEdit.result); report.checks.push("newer active edit policy cannot retarget the accepted attempt"); report.checks.push("edit preview and mutation guard use identical exact policy evaluation");
    await denies(tx, "mixed uncovered edit cannot inherit another field's allow", () => edits.guard({ ...edit, proposedPayload: { ...edit.proposedPayload, taxId: "uncovered" } }, editable, tx), /published edit rules/);
    const contributors = (await sql`SELECT principal_id FROM document.process_case_contributor WHERE tenant_id=${tenant}::uuid AND case_id=${fixture.id}::uuid`.execute(tx)).rows;
    assert.ok(contributors.some((r: any) => r.principal_id === maker));
    report.checks.push("material patch guard records contributor evidence in the owning transaction");
    await actor(tx, reviewer);
    await edits.guard({ ...edit, context: { ...context, principalId: reviewer } }, editable, tx);
    await actor(tx, maker);
    const independent = (await sql`SELECT principal_id FROM document.process_case_reviewers(${tenant}::uuid,${fixture.id}::uuid,NULL)`.execute(tx)).rows;
    assert.ok(!independent.some((r: any) => r.principal_id === reviewer));
    report.checks.push("a material editor is excluded from later independent reviewer resolution");
    await denies(tx, "stale edit version is rejected before evaluation", () => edits.guard({ ...edit, expectedVersion: editable.rowVersion - 1 }, editable, tx), /Reload the current request/);
    const events = (await sql`SELECT count(*)::int count FROM event.outbox WHERE tenant_id=${tenant}::uuid AND entity_id=${fixture.id}::uuid AND event_type LIKE 'workflow.task.information_%'`.execute(tx)).rows[0].count;
    assert.equal(events, 4); report.checks.push("one committed event intent per accepted information command");
    report.passed = true;
    throw rollback;
  });
} catch (error) { if (error !== rollback) { report.error = String(error); throw error; } }
finally { await db.destroy(); writeFileSync(consultation ? "governance/policy/reports/task-consultation-db.dev.json" : boundedPause ? "governance/policy/reports/task-information-pause-db.dev.json" : "governance/policy/reports/task-information-db.dev.json", JSON.stringify(report, null, 2) + "\n"); }
console.log(JSON.stringify(report, null, 2));
