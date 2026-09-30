/** Owning Studio policy service and real policy tables. All writes roll back. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createTaskEditPolicyAuthoring } from "../../../server/apps/platform-host/src/composition/task-edit-policy-authoring.js";
import { createKyselyProcessSelectionPublicationRepository } from "../../../server/packages/platform/control-admin/src/cycle/process-selection-publication.js";
import { exampleTaskEditPolicy } from "../../../packages/planes/studio/business-partner/src/task-edit-policy-example.js";
const require = createRequire(new URL("../../../server/db/package.json", import.meta.url));
const { Pool } = require("pg"), { Kysely, PostgresDialect, sql } = require("kysely");
const db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ host: execFileSync("docker", ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", "athyper-dev-db-1"], { encoding: "utf8" }).trim(), user: "postgres", database: "athyper_neon", password: readFileSync(`${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`, "utf8").trim() }) }) });
const tenantId = "44444444-4444-4444-8444-444444444444", maker = "cca94907-7519-5871-8e3c-6b11aa545c93", checker = "645b6a55-3355-526a-9643-3900425bde47";
const context: any = { tenantId, principalId: maker, planeKey: "studio", requestId: randomUUID() };
const report: any = { at: new Date().toISOString(), passed: false, checks: [], boundary: "Real owning Studio authoring service, existing evaluator and PostgreSQL policy/receipt/outbox tables; controlled authorizer and actual athyper_worker database role. Canonical trigger update and all policy writes roll back. Not deployed HTTP/browser qualification." };
const rollback = Error("ROLLBACK_AUTHORING");
try {
 await db.transaction().execute(async (tx: any) => {
  await sql.raw(readFileSync("server/db/ddl/common/control/17_process_task_rule_publication.sql", "utf8")).execute(tx);
  const functions = readFileSync("server/db/ddl/common/control/07_functions.sql", "utf8");
  const fn = functions.match(/CREATE OR REPLACE FUNCTION control\.trg_fn_protect_published_policy_revision\(\)[\s\S]*?\n\$\$;/)?.[0]; assert.ok(fn);
  await sql.raw(fn).execute(tx);
  for (const table of ["policy_rule", "policy_test_case"]) await sql.raw(`DROP TRIGGER ${table}_published_immutable ON control.${table}; CREATE TRIGGER ${table}_published_immutable BEFORE INSERT OR UPDATE OR DELETE ON control.${table} FOR EACH ROW EXECUTE FUNCTION control.trg_fn_protect_published_policy_revision()`).execute(tx);
  await sql.raw("SET LOCAL ROLE athyper_worker").execute(tx);
  const service = createTaskEditPolicyAuthoring({ database: { transaction: () => ({ execute: (work: any) => work(tx) }) } as never, authorizer: { authorize: async () => ({ allowed: true }) } });
  const baselines: any = await service.baselines(context); assert.ok(baselines.length);
  const base = baselines[0], input = { ...exampleTaskEditPolicy, processBinding: { basePublicationId: base.id, expectedReleaseId: base.release_id,
    tasks: base.publication.manifests.flatMap((m: any) => m.tasks.filter((t: any) => ["review","approval"].includes(t.executionKind)).map((t: any) => ({ profile: m.profile.code, code: t.code,
      informationPolicy: { schema: "athyper.task-information-policy/1", clockMode: "elapsed", responseHours: 24 },
      escalationPolicy: { schema: "athyper.task-escalation-policy/1", mode: "reassign", supervisorRole: "dev.bp.approvers.operating_organization" } }))) } };
  const beforeTime = new Date().toISOString();
  const key = randomUUID(), draft: any = await service.author(context, input, key);
  assert.equal(draft.status, "pending_approval"); assert.equal(draft.results.length, 4); assert.ok(draft.results.every((r: any) => r.passed));
  report.checks.push("Studio authoring persists rules and four fixture results with current hash");
  const replay: any = await service.author(context, input, key); assert.equal(replay.replayed, true); assert.equal(replay.definition.id, draft.definition.id);
  report.checks.push("author replay returns the same durable revision");
  async function denies(name: string, call: () => Promise<unknown>, pattern: RegExp) {
   await sql.raw("SAVEPOINT policy_probe").execute(tx);
   try { await call(); assert.fail("Expected rejection"); } catch (error) { assert.match(String(error), pattern); report.checks.push(name); }
   finally { await sql.raw("ROLLBACK TO SAVEPOINT policy_probe").execute(tx); }
  }
  await denies("publication writer cannot author unrelated policy purposes", () => sql`INSERT INTO control.policy_definition(tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,status,created_by) VALUES(${tenantId}::uuid,'supplier_onboarding','Unauthorized purpose',10,'all',current_date,1,'draft',${maker}::uuid)`.execute(tx), /row-level security/);
  await denies("normal API database role retains read-only policy access", async () => { await sql.raw("SET LOCAL ROLE athyper_runtime").execute(tx); await sql`UPDATE control.policy_definition SET name='Unauthorized' WHERE id=${draft.definition.id}::uuid`.execute(tx); }, /permission denied/);
  await denies("changed replay payload conflicts", () => service.author(context, { ...exampleTaskEditPolicy, definition: { ...exampleTaskEditPolicy.definition, name: "Different" } }, key), /TASK POLICY REPLAY CONFLICT/);
  await denies("NEON callers cannot invoke Studio authoring", () => service.author({ ...context, planeKey: "neon" }, exampleTaskEditPolicy, randomUUID()), /STUDIO REQUIRED/);
  await denies("cross-tenant revision read fails", () => service.read({ ...context, tenantId: randomUUID() }, draft.definition.id), /NOT FOUND/);
  await denies("maker cannot publish own policy", () => service.publish(context, draft.definition.id, randomUUID()), /MAKER CHECKER REQUIRED/);
  await denies("fixtures cannot label an allow as a negative test", () => service.author(context, { ...exampleTaskEditPolicy, tests: exampleTaskEditPolicy.tests.map(t => t.code === "negative" ? { ...t, expected: { action: "require_workflow" } } : t) }, randomUUID()), /FIXTURE EXPECTATION INVALID/);
  const competing: any = await service.author(context,{...input,definition:{...input.definition,name:input.definition.name+" competing"}},randomUUID());
  const publishKey = randomUUID(), published: any = await service.publish({ ...context, principalId: checker }, draft.definition.id, publishKey);
  assert.equal(published.status, "active"); assert.equal(published.hash, draft.hash);
  report.checks.push("independent checker activates exact tested revision");
  assert.ok(published.release?.id);
  const selection = createKyselyProcessSelectionPublicationRepository();
  const old = await selection.resolve(base.scope,beforeTime,tx);
  const fresh = await selection.resolve(base.scope,(await sql`SELECT clock_timestamp()::text instant`.execute(tx)).rows[0].instant,tx);
  assert.equal(old.length,1); assert.equal(fresh.length,1);
  assert.deepEqual(old[0],base.publication);
  assert.equal(fresh[0]!.manifests.length,3);
  for(const manifest of fresh[0]!.manifests) {
    assert.equal(manifest.editPolicy?.definitionId,draft.definition.id);
    for(const task of manifest.tasks) if(task.executionKind==='review'||task.executionKind==='approval') assert.equal(task.informationPolicy?.responseHours,24);
  }
  report.checks.push("new submissions resolve the approved three-profile task release while historical resolution retains the base");
  await denies("stale competing task proposal cannot activate",()=>service.publish({...context,principalId:checker},competing.definition.id,randomUUID()),/TASK RULE BASE CHANGED/);
  assert.equal((await service.read(context,competing.definition.id) as any).status,'pending_approval');

  const repeated: any = await service.publish({ ...context, principalId: checker }, draft.definition.id, publishKey); assert.equal(repeated.replayed, true);
  assert.equal((await sql`SELECT count(*)::int n FROM event.outbox WHERE tenant_id=${tenantId}::uuid AND event_key=${`task-edit-policy:${draft.definition.id}:published`}`.execute(tx)).rows[0].n, 1);
  report.checks.push("publication replay emits one durable outbox intent");
  await denies("published revision rejects appended rules", () => sql`INSERT INTO control.policy_rule(policy_definition_id,priority,condition_expr,action_code,action_config,created_by) VALUES(${draft.definition.id}::uuid,100,'{}'::jsonb,'deny','{}'::jsonb,${checker}::uuid)`.execute(tx), /immutable/);
  await denies("published revision rejects appended tests", () => sql`INSERT INTO control.policy_test_case(policy_definition_id,code,name,input_payload,expected_outcome,created_by) VALUES(${draft.definition.id}::uuid,'extra','Extra','{}'::jsonb,'{}'::jsonb,${checker}::uuid)`.execute(tx), /immutable/);
  const successor: any = await service.author(context, { ...exampleTaskEditPolicy, predecessorId: draft.definition.id, definition: { ...exampleTaskEditPolicy.definition, versionNo: 2 } }, randomUUID());
  assert.notEqual(successor.definition.id, draft.definition.id); assert.equal(successor.definition.versionNo, 2);
  assert.equal((await service.read(context, draft.definition.id) as any).status, "active"); report.checks.push("successor authoring preserves the active original");
  report.passed = true; throw rollback;
 });
} catch (error) { if (error !== rollback) { report.error = String(error); throw error; } }
finally { await db.destroy(); writeFileSync("governance/policy/reports/task-policy-authoring-db.dev.json", JSON.stringify(report, null, 2) + "\n"); }
console.log(JSON.stringify(report, null, 2));
