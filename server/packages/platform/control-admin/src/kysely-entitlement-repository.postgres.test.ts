import express,{type ErrorRequestHandler} from "express";
import {HttpError,enforceContractResponses} from "@athyper/server-runtime-http";
import {createExperienceService,createMemoryExperienceCache} from "@athyper/server-platform-experience";
import type {ExperiencePlaneRepository} from "@athyper/server-platform-experience/ports";
import {createExactPlaneRepositoryProvider} from "@athyper/server-foundation/transaction";
import {KyselyParameterRepository,createKyselyParameterRepositories} from "./kysely-parameter-repository.js";
import {createParameterService} from "./parameter-control.js";
import {createExperienceParameterConsumer} from "./parameter-runtime.js";
import {registerParameterRoutes} from "./control-service-routes.js";
import { KyselyFeatureFlagRepository, createKyselyFeatureFlagRepositories } from "./kysely-feature-flag-repository.js";
import { createFeatureFlagService } from "./feature-control.js";
import { createKyselyEntitlementRuntime } from "@athyper/server-platform-entitlements";
import { KyselyExperiencePlaneRepository } from "@athyper/server-adapter-experience-postgres";
import { readEntitlementRequirements } from "@athyper/server-platform-iam";
import { createEntitlementControlService } from "./entitlement-control.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { featurePercentageCohort } from "@athyper/server-foundation";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KyselyEntitlementRepository, createKyselyEntitlementRepositories } from "./kysely-entitlement-repository.js";

// Opt in only against an EMPTY, DISPOSABLE database using canonical DDL for each plane.
const url = process.env["ATHYPER_ENTITLEMENT_TEST_DATABASE_URL"];
const enabled = process.env["ATHYPER_ENTITLEMENT_DB_TESTS"] === "true" && Boolean(url);
const plane = (process.env["ATHYPER_ENTITLEMENT_TEST_PLANE"] ?? "neon") as "studio" | "neon" | "mesh";
const connection = (app: boolean) => new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({
  connectionString: url ?? "postgres://disabled", max: 8,
  options: `-c app.database_plane=${plane}${app ? " -c role=athyperapp" : ""}`,
}) }) });
const admin = connection(false), db = connection(true);
const repo = new KyselyEntitlementRepository(db, plane);
const tenant = randomUUID(), otherTenant = randomUUID(), actor = randomUUID(), otherActor = randomUUID();
const from = "2090-01-01T00:00:00.000Z", until = "2091-01-01T00:00:00.000Z";
const ddl = (path: string) => readFileSync(resolve(process.cwd(), "../../../db/ddl", path), "utf8");
const table = (source: string, name: string) => source.match(new RegExp(`CREATE TABLE ${name.replaceAll(".", "\\.")} \\([\\s\\S]*?\\n\\);`))![0];
const fn = (source: string, name: string) => source.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\$\\$;`))![0];
const run = (statement: string) => sql.raw(statement.replace(/^\uFEFF/, "")).execute(admin);

async function catalog() {
  const planId = randomUUID(), moduleId = randomUUID(), metricId = randomUUID();
  const suffix = randomUUID().replaceAll("-", "");
  const planCode = `plan_${suffix}`, moduleCode = `mod_${suffix}`, limitCode = `usage_${suffix}`;
  await sql`INSERT INTO control.subscription_plan(id,code,name,created_by) VALUES(${planId}::uuid,${planCode},'Test',${actor}::uuid)`.execute(admin);
  await sql`INSERT INTO control.module(id,code,name,created_by) VALUES(${moduleId}::uuid,${moduleCode},'Test',${actor}::uuid)`.execute(admin);
  await sql`INSERT INTO control.usage_metric_catalog(id,code,name,unit_code,created_by) VALUES(${metricId}::uuid,${limitCode},'Test','count',${actor}::uuid)`.execute(admin);
  await sql`INSERT INTO control.subscription_plan_usage_limit(subscription_plan_id,usage_metric_id,limit_value,created_by) VALUES(${planId}::uuid,${metricId}::uuid,100,${actor}::uuid)`.execute(admin);
  return { planId, moduleId, metricId, planCode, moduleCode, limitCode };
}
async function command(module = false) {
  const c = await catalog();
  const input: Parameters<KyselyEntitlementRepository["saveOverride"]>[0] = { id: randomUUID(), tenantId: tenant, planCode: c.planCode,
    ...(module ? { moduleCode: c.moduleCode } : { limitCode: c.limitCode, limitValue: 20 }),
    reason: "Approved exception", effectiveFrom: from, effectiveUntil: until, expectedVersion: 0 };
  return { ...c, input };
}
async function evidence(id: string) {
  return { audits: (await sql`SELECT * FROM audit.audit_log WHERE entity_id=${id}::uuid`.execute(admin)).rows,
    events: (await sql`SELECT * FROM event.outbox WHERE entity_id=${id}::uuid`.execute(admin)).rows };
}

describe.skipIf(!enabled)(`entitlement PostgreSQL adapter: ${plane}, baseline`, () => {
  beforeAll(async () => {
    await run(`CREATE SCHEMA shared; CREATE SCHEMA master; CREATE SCHEMA control; CREATE SCHEMA audit; CREATE SCHEMA event; CREATE SCHEMA snapshot; CREATE SCHEMA authz;
      CREATE EXTENSION btree_gist;
      DO $$ BEGIN CREATE ROLE athyperapp; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE athyperadmin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE DOMAIN shared.ref_status_d AS text CHECK (VALUE IN ('active','deprecated'));
      CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
      CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_tenant_id')::uuid $$;
      CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid $$;
      CREATE TABLE master.tenant(id uuid PRIMARY KEY, subscription_plan_id uuid, status text NOT NULL DEFAULT 'active');
      CREATE TABLE master.principal(id uuid NOT NULL,tenant_id uuid NOT NULL,PRIMARY KEY(tenant_id,id));
      CREATE DOMAIN event.outbox_status_d AS text;
      GRANT USAGE ON SCHEMA control,shared,master,audit,event,snapshot,authz TO athyperapp;
      CREATE TABLE authz.permission(canonical_code text, module_id uuid, status text, risk_tier text DEFAULT 'low',requires_mfa boolean DEFAULT false,requires_sod boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz);
      GRANT SELECT ON master.tenant,authz.permission TO athyperapp;
    `);
    await run(ddl("common/audit/02_domains.sql"));
    const control = ddl("common/control/03_tables.sql"), plans = ddl(`planes/${plane}/control/03_tables.sql`);
    for (const name of ["subscription_plan", "workspace", "workspace_module", "module", "subscription_plan_module", "usage_metric_catalog", "subscription_plan_usage_limit", "tenant_usage_limit_override", "feature_flag_catalog", "feature_flag_override", "parameter_definition", "tenant_parameter_value"]) {
      const statement = table(name === "subscription_plan" ? plans : control, `control.${name}`);
      await run(statement);
    }
    const audit = ddl("common/audit/03_tables.sql");
    for (const name of ["master.audit_reason_code", "master.audit_event_contract"]) await run(table(audit, name));
    await run(audit.match(/CREATE TABLE audit\.audit_log \([\s\S]*?PARTITION BY RANGE \(occurred_at\);/)![0]);
    await run("CREATE TABLE audit.audit_log_default PARTITION OF audit.audit_log DEFAULT;");
    await run(table(ddl("common/event/03_tables.sql"), "event.outbox"));
    const auditFns = ddl("common/audit/07_functions.sql");
    for (const name of ["payload_is_safe", "trg_prepare_audit_log", "append_event", "trg_guard_audit_log_immutable", "trg_guard_event_contract"]) await run(fn(auditFns, `audit.${name}`));
    for (const statement of ddl("common/audit/08_triggers.sql").matchAll(/CREATE TRIGGER (?:trg_audit_log_05_prepare|trg_audit_log_immutable|trg_audit_event_contract_05_guard)\s[\s\S]*?;/g)) await run(statement[0]);
    const constraints = ddl("common/control/05_constraints.sql");
    for (const statement of constraints.matchAll(/ALTER TABLE control\.(?:subscription_plan_usage_limit|tenant_usage_limit_override|feature_flag_override|tenant_parameter_value)\s[\s\S]*?;/g)) {
      if (!statement[0].includes("tenant_usage_limit_override_plan_fk")) await run(statement[0]);
    }
    await run(fn(ddl("common/snapshot/07_functions.sql"), "snapshot.trg_reject_entity_snapshot_mutation"));
    await run(ddl("common/snapshot/03_tables.sql").slice(ddl("common/snapshot/03_tables.sql").indexOf("-- Global plane-local commercial snapshots;")));
    const functions = ddl("common/control/07_functions.sql");
    for (const name of ["trg_guard_usage_limit_identity", "trg_validate_usage_limit_dimension"]) await run(fn(functions, `control.${name}`));
    for (const name of ["trg_set_updated_at", "trg_set_status_changed"]) await run(fn(ddl("common/shared/07_functions.sql"), `shared.${name}`));
    await run(fn(ddl(`planes/${plane}/control/07_functions.sql`), "control.trg_subscription_plan_guard"));
    for (const statement of ddl(`planes/${plane}/control/08_triggers.sql`).matchAll(/CREATE TRIGGER trg_subscription_plan_\w+\s[\s\S]*?;/g)) await run(statement[0]);
    const triggers = ddl("common/control/08_triggers.sql");
    for (const name of ["parameter_json_is_api_compatible","parameter_value_matches_definition","trg_validate_parameter_definition","trg_validate_tenant_parameter_value","trg_guard_feature_parameter_identity"]) await run(fn(functions,`control.${name}`));
    for (const name of ["parameter_definition","tenant_parameter_value"]) {
      await run(`CREATE TRIGGER ${name}_guard BEFORE UPDATE ON control.${name} FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_parameter_identity();
        CREATE TRIGGER ${name}_updated_at BEFORE UPDATE ON control.${name} FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
        CREATE TRIGGER ${name}_status_changed BEFORE UPDATE OF status ON control.${name} FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();`);
    }
    for(const statement of triggers.matchAll(/CREATE TRIGGER (?:parameter_definition_validate|tenant_parameter_value_validate)[\s\S]*?;/g)) await run(statement[0]);
    await run(triggers.match(/DO \$\$\s*DECLARE\s*v_table text;\s*BEGIN\s*FOREACH v_table IN ARRAY ARRAY\[\s*'subscription_plan_usage_limit', 'tenant_usage_limit_override'[\s\S]*?\$\$;/)![0]);
    // Install the real tenant RLS policies (the test app role owns no tables).
    const rls = ddl("common/control/10_rls.sql");
    await run(rls.match(/ALTER TABLE control\.tenant_usage_limit_override ENABLE[\s\S]*?FOR ALL TO CURRENT_USER USING \(true\) WITH CHECK \(true\);/)![0]);
    await run(rls.match(/ALTER TABLE control\.feature_flag_override ENABLE[\s\S]*?FOR ALL TO CURRENT_USER USING \(true\) WITH CHECK \(true\);/)![0]);
    await run(rls.slice(rls.indexOf("ALTER TABLE control.parameter_definition ENABLE"),rls.indexOf("ALTER TABLE control.cron_schedule ENABLE")));
    await run(`GRANT SELECT,INSERT,UPDATE ON control.tenant_parameter_value TO athyperapp;`);
    await run(`GRANT SELECT ON ALL TABLES IN SCHEMA control TO athyperapp;
      GRANT SELECT,INSERT ON event.outbox TO athyperapp;
      GRANT SELECT ON master.audit_event_contract TO athyperapp;
      ALTER TABLE event.outbox ENABLE ROW LEVEL SECURITY; ALTER TABLE event.outbox FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_access ON event.outbox FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());`);
    await run(table(control, "control.tenant_module_entitlement_override"));
    await run(constraints.slice(constraints.lastIndexOf("ALTER TABLE control.tenant_usage_limit_override")));
    await run(functions.slice(functions.indexOf("-- Versions describe the current catalog projection.")));
    await run(triggers.slice(triggers.indexOf("CREATE TRIGGER subscription_plan_entitlement_version")));
    await run(rls.slice(rls.indexOf("ALTER TABLE control.tenant_module_entitlement_override")));
    await run(ddl("common/control/11_grants.sql").slice(ddl("common/control/11_grants.sql").indexOf("REVOKE ALL ON control.tenant_module_entitlement_override")));
    const seed = ddl("common/audit/12_reference_seed.sql");
    await run(seed.slice(seed.lastIndexOf("INSERT INTO master.audit_event_contract",seed.indexOf("'control_entitlement_override'"))));
    await sql`INSERT INTO master.tenant(id) VALUES(${tenant}::uuid),(${otherTenant}::uuid)`.execute(admin);
    await sql`INSERT INTO master.principal VALUES(${actor}::uuid,${tenant}::uuid),(${otherActor}::uuid,${otherTenant}::uuid)`.execute(admin);
    await run(ddl("common/snapshot/05_constraints.sql").slice(ddl("common/snapshot/05_constraints.sql").lastIndexOf("ALTER TABLE snapshot.subscription_plan_entitlement")));
    await run(ddl("common/snapshot/08_triggers.sql").slice(ddl("common/snapshot/08_triggers.sql").indexOf("CREATE TRIGGER subscription_plan_entitlement_capture")));
    await run(ddl("common/snapshot/10_rls.sql").slice(ddl("common/snapshot/10_rls.sql").indexOf("ALTER TABLE snapshot.subscription_plan_entitlement")));
    await run(ddl("common/snapshot/11_grants.sql").slice(ddl("common/snapshot/11_grants.sql").indexOf("REVOKE ALL ON snapshot.subscription_plan_entitlement")));
    await run(ddl("common/control/12_parameter_runtime_seed.sql"));
    // Reproduce hardened live ACLs: replacing a function preserves old grants.
    await run("REVOKE ALL ON FUNCTION control.parameter_value_matches_definition(jsonb,text,jsonb,jsonb,jsonb) FROM PUBLIC,athyperapp");
    await run("REVOKE ALL ON FUNCTION control.parameter_json_is_api_compatible(jsonb,integer) FROM PUBLIC,athyperapp");
    await run(ddl("common/control/11_grants.sql").slice(ddl("common/control/11_grants.sql").indexOf("REVOKE ALL ON FUNCTION control.parameter_value_matches_definition")));
  });
  afterAll(async () => { await db.destroy(); await admin.destroy(); });

  it("reads immutable effective-dated plan history including module and limit changes", async () => {
    const c = await catalog();
    const before = await repo.getPlan(c.planCode, from);
    expect(before).toMatchObject({ code:c.planCode, modules:[], limits:{[c.limitCode]:100} });
    await sql`INSERT INTO control.subscription_plan_module(subscription_plan_id,module_id,entitlement_mode,created_by)
      VALUES(${c.planId}::uuid,${c.moduleId}::uuid,'optional_addon',${actor}::uuid)`.execute(admin);
    expect((await repo.getPlan(c.planCode,from))?.modules).toEqual([]);
    await sql`UPDATE control.subscription_plan_module SET entitlement_mode='included' WHERE subscription_plan_id=${c.planId}::uuid`.execute(admin);
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=NULL WHERE subscription_plan_id=${c.planId}::uuid`.execute(admin);
    const updated = await repo.getPlan(c.planCode,from);
    expect(updated).toMatchObject({ modules:[c.moduleCode], limits:{[c.limitCode]:null} });
    expect(updated!.version).toBeGreaterThan(before!.version);
    expect(await repo.getPlan(c.planCode,before!.effectiveFrom)).toMatchObject(before!);
    expect(await repo.getPlan(c.planCode,updated!.effectiveFrom)).toEqual(updated);
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=0 WHERE subscription_plan_id=${c.planId}::uuid`.execute(admin);
    expect((await repo.listPlans()).find(p=>p.code===c.planCode)?.limits[c.limitCode]).toBe(0);
    expect(await repo.listModules()).toContain(c.moduleCode);
  });

  it.each([false,true])("persists and expires tenant exceptions with actor, version, audit and outbox (module=%s)", async module => {
    const {input,planCode} = await command(module);
    const plan = await repo.getPlan(planCode,from);
    const saved = await repo.saveOverride(input,actor);
    expect(saved).toMatchObject({id:input.id,tenantId:tenant,version:1,status:"active"});
    expect(await repo.getPlan(planCode,from)).toEqual(plan);
    if (!module) expect(saved.limitValue).toBe(20);
    const updated = await repo.saveOverride({...input,...(!module?{limitValue:0}:{}),reason:"Changed reason",expectedVersion:1},actor);
    expect(updated.version).toBe(2);
    const expired = await repo.expireOverride(tenant,input.id,2,actor);
    expect(expired).toMatchObject({version:3,status:"expired",effectiveFrom:from,effectiveUntil:until});
    expect(await repo.expireOverride(tenant,input.id,3,actor)).toEqual(expired);
    const records = await evidence(input.id);
    expect(records.audits).toHaveLength(3); expect(records.events).toHaveLength(3);
    expect(records.audits).toEqual(expect.arrayContaining([expect.objectContaining({actor_principal_id:actor,plane_code:plane,event_code:"control.entitlement_override.expired",old_values:updated,new_values:expired})]));
    expect(records.events).toEqual(expect.arrayContaining([expect.objectContaining({actor_id:actor,payload:expect.objectContaining({after:expired,cacheInvalidation:{namespace:"entitlements",tenantId:tenant,keys:[planCode]}})})]));
    await expect(repo.saveOverride({...input,expectedVersion:3},actor)).rejects.toMatchObject({statusCode:409});
  });

  it.each([false,true])("serializes creates, stale updates, and save/expire races (module=%s)", async module => {
    const {input} = await command(module);
    const creates = await Promise.allSettled([repo.saveOverride(input,actor),repo.saveOverride(input,actor)]);
    expect(creates.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(creates.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409}});
    const changes = await Promise.allSettled([repo.saveOverride({...input,expectedVersion:1},actor),repo.expireOverride(tenant,input.id,1,actor)]);
    expect(changes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(changes.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409}});
    expect((await evidence(input.id)).events).toHaveLength(2);
  });

  it.each([false,true])("rejects concurrent overlapping periods but allows adjacent periods (module=%s)", async module => {
    const {input} = await command(module);
    const results = await Promise.allSettled([input,{...input,id:randomUUID()}].map(value=>repo.saveOverride(value,actor)));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409,code:"CONTROL_ADMIN_ENTITLEMENT_OVERLAP"}});
    await expect(repo.saveOverride({...input,id:randomUUID(),effectiveFrom:until,effectiveUntil:"2092-01-01T00:00:00Z"},actor)).resolves.toMatchObject({version:1});
  });

  it.each([false,true])("isolates tenants and verifies the actor inside the database (module=%s)", async module => {
    const {input} = await command(module);
    await repo.saveOverride(input,actor);
    expect(await repo.getOverride(otherTenant,input.id)).toBeUndefined();
    await expect(repo.expireOverride(otherTenant,input.id,1,otherActor)).rejects.toMatchObject({statusCode:404});
    await expect(repo.saveOverride({...input,tenantId:otherTenant,expectedVersion:1},otherActor)).rejects.toMatchObject({statusCode:409});
    const foreignActorId = randomUUID();
    await expect(repo.saveOverride({...input,id:foreignActorId,tenantId:otherTenant},actor)).rejects.toMatchObject({code:"23503"});
    expect(await repo.getOverride(otherTenant,foreignActorId)).toBeUndefined();
    expect((await evidence(foreignActorId)).events).toHaveLength(0);
    await db.transaction().execute(async tx => {
      await sql`SELECT set_config('app.current_tenant_id',${otherTenant},true)`.execute(tx);
      const table = sql.table(module?"control.tenant_module_entitlement_override":"control.tenant_usage_limit_override");
      expect((await sql`SELECT id FROM ${table} WHERE id=${input.id}::uuid`.execute(tx)).rows).toHaveLength(0);
      expect((await sql`UPDATE ${table} SET reason='foreign' WHERE id=${input.id}::uuid RETURNING id`.execute(tx)).rows).toHaveLength(0);
    });
  });

  it.each(["audit", "outbox"])("rolls back both the override and evidence if %s insertion fails", async failing => {
    const {input,planId} = await command();
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    const runtime=createKyselyEntitlementRuntime({[plane]:db});
    const effective=()=>runtime.resolve({tenantId:tenant,principalId:actor,planeKey:plane},from);
    const originalEffective=await effective();
    const target = failing==="audit"?"audit.audit_log":"event.outbox";
    await run(`CREATE FUNCTION control.test_reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test evidence failure'; END $$;
      CREATE TRIGGER test_reject BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION control.test_reject_evidence();`);
    try {
      await expect(repo.saveOverride(input,actor)).rejects.toThrow("test evidence failure");
      expect(await repo.getOverride(tenant,input.id)).toBeUndefined();
      expect(await evidence(input.id)).toEqual({audits:[],events:[]});
      expect(await effective()).toEqual(originalEffective);
    } finally { await run(`DROP TRIGGER test_reject ON ${target}; DROP FUNCTION control.test_reject_evidence();`); }
    const saved = await repo.saveOverride(input,actor);
    expect(saved.version).toBe(1);
    const originalEvidence = await evidence(input.id);
    const savedEffective=await effective();
    await run(`CREATE FUNCTION control.test_reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test evidence failure'; END $$;
      CREATE TRIGGER test_reject BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION control.test_reject_evidence();`);
    try {
      await expect(repo.expireOverride(tenant,input.id,1,actor)).rejects.toThrow("test evidence failure");
      expect(await repo.getOverride(tenant,input.id)).toEqual(saved);
      await expect(repo.saveOverride({...input,reason:"Must roll back",expectedVersion:1},actor)).rejects.toThrow("test evidence failure");
      expect(await repo.getOverride(tenant,input.id)).toEqual(saved);
      expect(await evidence(input.id)).toEqual(originalEvidence);
      expect(await effective()).toEqual(savedEffective);
    } finally { await run(`DROP TRIGGER test_reject ON ${target}; DROP FUNCTION control.test_reject_evidence();`); }
    expect((await repo.expireOverride(tenant,input.id,1,actor)).version).toBe(2);
  });

  it("ends an effective exception now and advances versions for other database writers", async () => {
    const {input} = await command();
    const plan = await repo.getPlan(input.planCode,from);
    const saved = await repo.saveOverride({...input,effectiveFrom:plan!.effectiveFrom},actor);
    await sql`UPDATE control.tenant_usage_limit_override SET reason='External governed writer' WHERE id=${input.id}::uuid`.execute(admin);
    expect((await repo.getOverride(tenant,input.id))?.version).toBe(2);
    await expect(repo.expireOverride(tenant,input.id,saved.version,actor)).rejects.toMatchObject({statusCode:409});
    const expired = await repo.expireOverride(tenant,input.id,2,actor);
    expect(expired.status).toBe("expired");
    expect(Date.parse(expired.effectiveUntil!)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(expired.effectiveUntil!)).toBeGreaterThanOrEqual(Date.parse(expired.effectiveFrom));
  });

  it("enforces catalog targets, numeric/range validation and immutable override coordinates", async () => {
    const {input,moduleCode} = await command();
    for (const limitValue of [-1,0.5,Number.MAX_SAFE_INTEGER + 1,Infinity,NaN]) await expect(repo.saveOverride({...input,limitValue},actor)).rejects.toMatchObject({statusCode:400});
    await expect(repo.saveOverride({...input,effectiveUntil:from},actor)).rejects.toMatchObject({statusCode:400});
    await expect(repo.saveOverride({...input,limitCode:"unknown_metric"},actor)).rejects.toMatchObject({statusCode:404});
    await repo.saveOverride(input,actor);
    const {limitCode:_code,limitValue:_value,...moduleInput}=input;
    await expect(repo.saveOverride({...moduleInput,moduleCode,expectedVersion:1},actor)).rejects.toMatchObject({statusCode:409,code:"CONTROL_ADMIN_ENTITLEMENT_TARGET_IMMUTABLE"});
  });

  it("round-trips the safe integer boundary and rejects unsafe stored limits without rounding", async () => {
    const {input,planId} = await command();
    const saved = await repo.saveOverride({...input,limitValue:Number.MAX_SAFE_INTEGER},actor);
    expect(saved.limitValue).toBe(Number.MAX_SAFE_INTEGER);
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=${String(Number.MAX_SAFE_INTEGER)}::bigint WHERE subscription_plan_id=${planId}::uuid`.execute(admin);
    expect((await repo.getPlan(input.planCode,from))?.limits[input.limitCode!]).toBe(Number.MAX_SAFE_INTEGER);
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=9007199254740993 WHERE subscription_plan_id=${planId}::uuid`.execute(admin);
    await expect(repo.getPlan(input.planCode,from)).rejects.toMatchObject({code:"CONTROL_ADMIN_ENTITLEMENT_LIMIT_OUT_OF_RANGE"});
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=20 WHERE subscription_plan_id=${planId}::uuid`.execute(admin);
    await sql`UPDATE control.tenant_usage_limit_override SET limit_value=9007199254740993 WHERE id=${input.id}::uuid`.execute(admin);
    await expect(repo.getOverride(tenant,input.id)).rejects.toMatchObject({code:"CONTROL_ADMIN_ENTITLEMENT_LIMIT_OUT_OF_RANGE"});
  });

  it("uses nonnegative bigint quota columns in the canonical DDL", async () => {
    const {input,planId} = await command();
    await repo.saveOverride(input,actor);
    expect((await sql<{data_type:string}>`SELECT data_type FROM information_schema.columns WHERE table_schema='control' AND table_name IN ('subscription_plan_usage_limit','tenant_usage_limit_override') AND column_name='limit_value'`.execute(admin)).rows.map(row=>row.data_type)).toEqual(["bigint","bigint"]);
    await expect(sql`UPDATE control.tenant_usage_limit_override SET limit_value=-1 WHERE id=${input.id}::uuid`.execute(admin)).rejects.toMatchObject({code:"23514"});
    await expect(sql`UPDATE control.subscription_plan_usage_limit SET limit_value=-1 WHERE subscription_plan_id=${planId}::uuid`.execute(admin)).rejects.toMatchObject({code:"23514"});
  });

  it("changes runtime quotas on save and expiration, scoped to the assigned tenant plan", async () => {
    const {input,planId} = await command();
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    const runtime = createKyselyEntitlementRuntime({[plane]:db});
    const context = {planeKey:plane,tenantId:tenant,principalId:actor};
    const check = () => runtime.evaluate(context,{limit:input.limitCode!,usage:100},from);
    expect(await check()).toMatchObject({entitled:false,reason:"limit_exceeded"});
    const original = await runtime.resolve(context,from);
    const saved = await repo.saveOverride({...input,limitValue:200},actor);
    expect(await check()).toMatchObject({entitled:true});
    expect((await runtime.resolve(context,from))?.revision).not.toBe(original?.revision);
    const zero = await repo.saveOverride({...input,limitValue:0,expectedVersion:saved.version},actor);
    expect(await runtime.evaluate(context,{limit:input.limitCode!,usage:0},from)).toMatchObject({entitled:false});
    await repo.expireOverride(tenant,input.id,zero.version,actor);
    expect((await runtime.resolve(context,from))?.limits[input.limitCode!]).toBe(100);
    await repo.saveOverride({...input,id:randomUUID(),limitValue:250},actor);
    const unlimited = await catalog();
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=NULL WHERE subscription_plan_id=${unlimited.planId}::uuid`.execute(admin);
    await sql`UPDATE master.tenant SET subscription_plan_id=${unlimited.planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    expect((await runtime.resolve(context,from))?.planCode).toBe(unlimited.planCode);
    expect(await runtime.evaluate(context,{limit:unlimited.limitCode,usage:Number.MAX_SAFE_INTEGER},from)).toMatchObject({entitled:true});
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${otherTenant}::uuid`.execute(admin);
    expect((await runtime.resolve({...context,tenantId:otherTenant,principalId:otherActor},from))?.limits[input.limitCode!]).toBe(100);
    expect((await runtime.resolve(context,from))?.limits[input.limitCode!]).toBeUndefined();
    await db.transaction().execute(async tx => {
      await sql`SELECT set_config('app.current_tenant_id',${otherTenant},true)`.execute(tx);
      expect((await sql<{value:unknown}>`SELECT control.effective_tenant_entitlement(${tenant}::uuid,${from}::timestamptz) AS value`.execute(tx)).rows[0]?.value).toBeNull();
    });
  });

  it("preserves dimension-specific plan limits and resolves exact overrides before fallback overrides", async () => {
    const {input,planId,metricId}=await command();
    const dimensionId=randomUUID();
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    await sql`UPDATE control.usage_metric_catalog SET dimension_type_code='region' WHERE id=${metricId}::uuid`.execute(admin);
    await sql`INSERT INTO control.subscription_plan_usage_limit(subscription_plan_id,usage_metric_id,dimension_code,limit_value,created_by)
      VALUES(${planId}::uuid,${metricId}::uuid,'eu',25,${actor}::uuid)`.execute(admin);
    const runtime=createKyselyEntitlementRuntime({[plane]:db}), context={planeKey:plane,tenantId:tenant,principalId:actor};
    const limit=async(dimension:string)=>(await runtime.resolve(context,from,dimension))?.limits[input.limitCode!];
    expect(await limit('eu')).toBe(25); expect(await limit('apac')).toBe(100);
    const saved=await repo.saveOverride({...input,limitValue:200},actor);
    expect(await limit('eu')).toBe(200);
    await sql`INSERT INTO control.tenant_usage_limit_override(id,tenant_id,usage_metric_id,dimension_code,limit_value,reason,effective_from,created_by)
      VALUES(${dimensionId}::uuid,${tenant}::uuid,${metricId}::uuid,'eu',50,'Legacy dimension exception',${from}::timestamptz,${actor}::uuid)`.execute(admin);
    expect(await limit('eu')).toBe(50); expect(await limit('apac')).toBe(200);
    await sql`UPDATE control.tenant_usage_limit_override SET status='deprecated' WHERE id=${dimensionId}::uuid`.execute(admin);
    expect(await limit('eu')).toBe(200);
    await repo.expireOverride(tenant,input.id,saved.version,actor);
    expect(await limit('eu')).toBe(25); expect(await limit('apac')).toBe(100);
  });

  it("uses module exceptions in IAM and experience, and invalidates after commit", async () => {
    const {input,planId,moduleId,moduleCode} = await command(true);
    const activeFrom = (await repo.getPlan(input.planCode,from))!.effectiveFrom;
    const context = {planeKey:plane,tenantId:tenant,principalId:actor} as VerifiedRequestContext;
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    const workspace = randomUUID(), permission = `test.${moduleCode}.read`;
    await sql`INSERT INTO control.workspace(id,code,name,created_by) VALUES(${workspace}::uuid,${`ws_${workspace.replaceAll("-","")}`},'Test',${actor}::uuid)`.execute(admin);
    await sql`INSERT INTO control.workspace_module(workspace_id,module_id,created_by) VALUES(${workspace}::uuid,${moduleId}::uuid,${actor}::uuid)`.execute(admin);
    await sql`INSERT INTO authz.permission(canonical_code,module_id,status) VALUES(${permission},${moduleId}::uuid,'published')`.execute(admin);
    const scoped = <T,>(work:(tx:typeof db)=>Promise<T>) => db.transaction().execute(async tx => {
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(tx); return work(tx);
    });
    const experience = new KyselyExperiencePlaneRepository(db,(_context,work)=>scoped(work));
    const available = async () => ({
      iam:(await scoped(tx=>readEntitlementRequirements(tx,tenant,[permission])))[0]?.entitled,
      modules:(await experience.readCatalog(context,planId))?.associations.map(m=>m.moduleCode),
      revision:await experience.readEntitlementRevision(context,new Date()),
    });
    const before = await available();
    expect(before.iam).toBe(false); expect(before.modules).not.toContain(moduleCode);
    let invalidated = 0;
    const service = createEntitlementControlService({authorizer:{authorize:async()=>({allowed:true})},
      repositories:createKyselyEntitlementRepositories({[plane]:db}),cache:{invalidate:async()=>{invalidated++;}},
      onChanged:async()=>{expect((await evidence(input.id)).events.length).toBeGreaterThan(0);}});
    const {tenantId:_tenant,expectedVersion:_version,...value}=input;
    const saved = await service.saveOverride({context,override:{...value,effectiveFrom:activeFrom},expectedVersion:0});
    const after = await available();
    expect(after.iam).toBe(true); expect(after.modules).toContain(moduleCode); expect(after.revision).not.toBe(before.revision);
    expect(invalidated).toBe(1);
    await service.expireOverride(context,input.id,saved.version);
    const expired = await available();
    expect(expired.iam).toBe(false); expect(expired.modules).not.toContain(moduleCode); expect(expired.revision).not.toBe(after.revision);
    expect(invalidated).toBe(2);
  });

  it("honors scheduled boundaries, historical validation, and immutable snapshot evidence", async () => {
    const {input,planId,moduleCode} = await command(true);
    await sql`UPDATE master.tenant SET subscription_plan_id=${planId}::uuid WHERE id=${tenant}::uuid`.execute(admin);
    const runtime=createKyselyEntitlementRuntime({[plane]:db}), context={planeKey:plane,tenantId:tenant,principalId:actor};
    await repo.saveOverride(input,actor);
    expect(await runtime.evaluate(context,{module:moduleCode},"2089-12-31T23:59:59Z")).toMatchObject({entitled:false});
    expect(await runtime.evaluate(context,{module:moduleCode},from)).toMatchObject({entitled:true});
    expect(await runtime.evaluate(context,{module:moduleCode},until)).toMatchObject({entitled:false});
    const old=(await repo.getPlan(input.planCode,from))!;
    await sql`UPDATE control.subscription_plan_usage_limit SET limit_value=75 WHERE subscription_plan_id=${planId}::uuid`.execute(admin);
    const historical=(await repo.getPlan(input.planCode,old.effectiveFrom))!;
    expect(historical.version).toBe(old.version); expect(historical.limits).toEqual(old.limits); expect(historical.effectiveUntil).toBeDefined();
    const metric=Object.keys(old.limits)[0]!;
    await repo.saveOverride({id:randomUUID(),tenantId:tenant,planCode:input.planCode,limitCode:metric,limitValue:150,reason:"Historical effective start",effectiveFrom:old.effectiveFrom,expectedVersion:0},actor);
    expect((await runtime.resolve(context,from))?.limits[metric]).toBe(150);
    await expect(sql`UPDATE snapshot.subscription_plan_entitlement SET modules='[]'::jsonb WHERE subscription_plan_id=${planId}::uuid`.execute(admin)).rejects.toMatchObject({code:"55000"});
    await expect(sql`DELETE FROM snapshot.subscription_plan_entitlement WHERE subscription_plan_id=${planId}::uuid`.execute(admin)).rejects.toMatchObject({code:"55000"});
  });

  async function parameterFixture() {
    const id=randomUUID(),code=`test.p_${id.replaceAll("-","")}`;
    await sql`INSERT INTO control.parameter_definition(id,code,name,value_type,default_value,tenant_can_override,created_by) VALUES(${id}::uuid,${code},'Parameter','json','null'::jsonb,true,${actor}::uuid)`.execute(admin);
    return {id,code,repository:new KyselyParameterRepository(db,plane),input:{tenantId:tenant,parameterDefinitionId:id,value:{flag:true},effectiveFrom:from,effectiveUntil:until,reason:"Reviewed",expectedVersion:0}};
  }
  async function experienceParameterFixture() {
    const t=randomUUID(),a=randomUUID();await sql`INSERT INTO master.tenant(id) VALUES(${t}::uuid)`.execute(admin);await sql`INSERT INTO master.principal VALUES(${a}::uuid,${t}::uuid)`.execute(admin);
    const context={tenantId:t,principalId:a,planeKey:plane,realmKey:plane,authEpoch:4,requestId:'request',profileHash:'profile',permissions:{planeKey:plane,tenantId:t,principalId:a,principalFingerprint:'fp',profileHash:'profile',schemaHash:'schema',resolvedAt:1,allowed:[],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]}} as VerifiedRequestContext;
    let at=new Date(from);
    const providers=createKyselyParameterRepositories({[plane]:db});
    const service=createParameterService({authorizer:{authorize:async()=>({allowed:true})},repositories:providers,cache:{invalidate:async()=>{}},now:()=>at});
    const projection:ExperiencePlaneRepository={
      readIdentity:async()=>({tenantCode:'tenant',tenantDisplayName:'Tenant',tenantStatus:'active',tenantRealmKey:plane,tenantRevision:'1',principalCode:'user',principalDisplayName:'User',principalStatus:'active',principalAuthEpoch:4,principalRevision:'1',identityBindingActive:true,membershipActive:true,membershipRevision:'1'}),
      readProfile:async()=>({tenant:{},principal:{},revision:'1'}),readCatalog:async()=>({planActive:true,planRevision:'1',associations:[],permissions:[]}),readFeatures:async()=>[],readWorkContexts:async()=>[],readOperatingOrganizations:async()=>[],readNetworkAccounts:async()=>[],
    };
    const boot=()=>createExperienceService({repositories:createExactPlaneRepositoryProvider({[plane]:projection}),cache:createMemoryExperienceCache(),now:()=>at,readRuntimeDefaults:createExperienceParameterConsumer(createKyselyParameterRepositories({[plane]:db}))});
    const first=boot(),second=boot();
    const app=express();app.use(express.json());enforceContractResponses(app);
    registerParameterRoutes(app,{authenticate:(_r,_s,next)=>next(),readContext:()=>context,service,reads:true,writes:true});
    app.use(((error,_req,res,_next)=>res.status(error instanceof HttpError?error.statusCode:500).json({code:error instanceof HttpError?error.code:'INTERNAL_ERROR'})) as ErrorRequestHandler);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Address');
    const request=(path:string,body?:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/control-admin/parameters${path}`,{method:body===undefined?'GET':path.endsWith('/expire')?'POST':'PUT',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {context,request,first,second,setTime:(value:string)=>{at=new Date(value);},close:()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})};
  }
  it("parameters: API conflicts preserve the winner and refresh two real bootstrap consumers",async()=>{
    const f=await experienceParameterFixture();try {
      expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('comfortable');expect((await f.second.bootstrap(f.context)).profile.densityCode).toBe('comfortable');
      const created=await f.request('/experience.profile.default_density/value',{value:'compact',effectiveFrom:from,expectedVersion:0});expect(created.status).toBe(200);const row=await created.json();
      expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('compact');expect((await f.second.bootstrap(f.context)).profile.densityCode).toBe('compact');
      const attempts=await Promise.all(['comfortable','compact'].map(value=>f.request('/experience.profile.default_density/value',{id:row.id,expectedVersion:row.version,value,effectiveFrom:from})));
      expect(attempts.map(r=>r.status).sort()).toEqual([200,409]);const winner=await attempts.find(r=>r.status===200)!.json();
      const effective=await(await f.request('/experience.profile.default_density/effective')).json();expect(effective).toMatchObject({value:winner.value,overrideId:winner.id,overrideVersion:winner.version});
      expect((await f.second.bootstrap(f.context)).profile.densityCode).toBe(winner.value);
      expect((await f.request(`/values/${winner.id}/expire`,{expectedVersion:winner.version})).status).toBe(200);
      expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('comfortable');expect((await f.second.bootstrap(f.context)).profile.densityCode).toBe('comfortable');
    }finally{await f.close();}
  });
  it("parameters: scheduled starts and ends refresh cached bootstrap without a write or local eviction",async()=>{
    const f=await experienceParameterFixture();try {
      expect((await f.request('/experience.profile.default_density/value',{value:'compact',effectiveFrom:from,effectiveUntil:until,expectedVersion:0})).status).toBe(200);
      expect((await f.request('/experience.profile.default_density/value',{value:'comfortable',effectiveFrom:until,effectiveUntil:'2092-01-01T00:00:00Z',expectedVersion:0})).status).toBe(200);
      f.setTime('2089-12-31T23:59:59Z');expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('comfortable');
      f.setTime(from);expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('compact');
      f.setTime(until);expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('comfortable');
    }finally{await f.close();}
  });
  it("parameters: definition-only updates refresh runtime and incompatible reload modes fail closed",async()=>{
    const f=await experienceParameterFixture();try {
      expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('comfortable');
      await sql`UPDATE control.parameter_definition SET default_value='"compact"'::jsonb WHERE code='experience.profile.default_density'`.execute(admin);
      expect((await f.first.bootstrap(f.context)).profile.densityCode).toBe('compact');
      for(const mode of ['immediate','next_login','restart','external_provider']) {
        await sql`UPDATE control.parameter_definition SET reload_mode=${mode} WHERE code='experience.profile.default_density'`.execute(admin);
        await expect(f.first.bootstrap(f.context)).rejects.toMatchObject({statusCode:503,code:'PARAMETER_RELOAD_MODE_MISMATCH'});
      }
    }finally{await sql`UPDATE control.parameter_definition SET default_value='"comfortable"'::jsonb,reload_mode='next_request' WHERE code='experience.profile.default_density'`.execute(admin);await f.close();}
  });
  it("parameters: scope, active-period selection, null, lifecycle and evidence remain transactional",async()=>{
    const {id,code,repository,input}=await parameterFixture();const saved=await repository.saveValue({...input,value:null},actor);
    expect((await repository.getValue(tenant,id,from))?.value).toBeNull();expect(await repository.getValue(tenant,id,until)).toBeUndefined();
    await expect(repository.saveValue({...input,id:saved.id,tenantId:otherTenant,expectedVersion:1},otherActor)).rejects.toMatchObject({statusCode:404});
    await expect(repository.saveValue({...input,id:randomUUID(),expectedVersion:1},actor)).rejects.toMatchObject({statusCode:404});
    await expect(repository.saveValue({...input,id:saved.id,expectedVersion:2},actor)).rejects.toMatchObject({statusCode:409});
    await expect(repository.saveValue(input,actor)).rejects.toMatchObject({statusCode:409,code:'CONTROL_ADMIN_PARAMETER_OVERLAP'});
    await expect(repository.saveValue({...input,tenantId:otherTenant},actor)).rejects.toMatchObject({code:'23503'});
    expect(await repository.getValue(otherTenant,id,from)).toBeUndefined();
    const records=await evidence(saved.id);expect(records.audits).toHaveLength(1);expect(records.events).toHaveLength(1);
    expect(records.audits[0]).toMatchObject({actor_principal_id:actor});expect((records.audits[0] as Record<string,unknown>)?.['new_values']).not.toHaveProperty('value');expect((records.events[0] as Record<string,unknown>)?.['payload']).toMatchObject({after:{version:1},cacheInvalidation:{keys:[code]}});
    const expired=await repository.expireValue(tenant,saved.id,1,actor);expect(await repository.expireValue(tenant,saved.id,expired.version,actor)).toEqual(expired);
    await expect(repository.saveValue({...input,id:saved.id,expectedVersion:expired.version},actor)).rejects.toMatchObject({statusCode:409});
    expect((await evidence(saved.id)).events).toHaveLength(2);expect(await repository.health()).toEqual({status:'healthy'});
  });
  it("parameters: hides sensitive definitions and does not expose their values",async()=>{
    const {id,code,repository,input}=await parameterFixture();await sql`UPDATE control.parameter_definition SET is_sensitive=true WHERE id=${id}::uuid`.execute(admin);
    expect(await repository.getDefinition(code)).toBeUndefined();expect((await repository.listDefinitions()).some(d=>d.id===id)).toBe(false);
    await expect(repository.saveValue(input,actor)).rejects.toMatchObject({statusCode:404});
  });
  it.each(['audit.audit_log','event.outbox'])("parameters: rolls back save and expiration when %s fails",async tableName=>{
    const {id,repository,input}=await parameterFixture();const saved=await repository.saveValue(input,actor);const before=await evidence(saved.id);
    await run(`CREATE FUNCTION public.reject_parameter_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'parameter evidence failure'; END $$;CREATE TRIGGER reject_parameter_evidence BEFORE INSERT ON ${tableName} FOR EACH ROW EXECUTE FUNCTION public.reject_parameter_evidence();`);
    try {
      await expect(repository.saveValue({...input,id:saved.id,expectedVersion:1,value:{flag:false}},actor)).rejects.toThrow('parameter evidence failure');
      await expect(repository.expireValue(tenant,saved.id,1,actor)).rejects.toThrow('parameter evidence failure');
      const next=await parameterFixture();await expect(repository.saveValue(next.input,actor)).rejects.toThrow('parameter evidence failure');expect(await repository.getValue(tenant,next.id,from)).toBeUndefined();
    }finally{await run(`DROP TRIGGER reject_parameter_evidence ON ${tableName};DROP FUNCTION public.reject_parameter_evidence();`);}
    expect(await repository.getValue(tenant,id,from)).toEqual(saved);expect(await evidence(saved.id)).toEqual(before);
  });

  async function featureFixture() {
    const id=randomUUID(),code=`ui.flag_${id.replaceAll("-","")}`;
    await sql`INSERT INTO control.feature_flag_catalog(id,code,name,default_enabled,effective_from,created_by)
      VALUES(${id}::uuid,${code},'Feature test',false,'2026-01-01T00:00:00Z',${actor}::uuid)`.execute(admin);
    const repository=new KyselyFeatureFlagRepository(db,plane);
    const input={tenantId:tenant,featureFlagId:id,enabled:true,reason:"Feature pilot",effectiveFrom:from,effectiveUntil:until,expectedVersion:0};
    return {id,code,repository,input};
  }

  async function cutover(id:string, expected:number, reason="Reviewed impact", strategy="tenant_sha256_v1") {
    return admin.transaction().execute(async tx=>{
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),
        set_config('app.current_actor_type','user',true),set_config('app.feature_cohort_change_reason',${reason},true),
        set_config('app.feature_cohort_expected_revision',${String(expected)},true)`.execute(tx);
      return (await sql`UPDATE control.feature_flag_catalog SET cohort_strategy=${strategy} WHERE id=${id}::uuid RETURNING cohort_strategy,cohort_revision`.execute(tx)).rows[0];
    });
  }

  it("features: new definitions default to the persisted v2 cohort strategy",async()=>{
    const {id,code,repository}=await featureFixture();
    expect(await repository.getDefinition(code)).toMatchObject({cohortStrategy:"principal_fnv1a_v2",cohortRevision:1});
    await sql`UPDATE control.feature_flag_catalog SET default_enabled=true,rollout_pct=50 WHERE id=${id}::uuid`.execute(admin);
    const experience=new KyselyExperiencePlaneRepository(db);
    const service=createFeatureFlagService({authorizer:{authorize:async()=>({allowed:true})},repositories:createKyselyFeatureFlagRepositories({[plane]:db}),cache:{invalidate:async()=>{}},now:()=>new Date(from)});
    for(const strategy of ["principal_fnv1a_v2","tenant_sha256_v1"] as const) {
      if(strategy==="tenant_sha256_v1") await cutover(id,1);
      for(const principalId of [actor,otherActor]) {
        const context={tenantId:tenant,principalId,planeKey:plane} as VerifiedRequestContext;
        const record=(await experience.readFeatures(context,new Date(from))).find(f=>f.id===id)!;
        expect(record.cohortStrategy).toBe(strategy);
        expect((await service.evaluate(context,code)).enabled).toBe(featurePercentageCohort(record.cohortStrategy,tenant,principalId,code)<50);
      }
    }
  });

  it("features: guards cohort identity, reason and revision; audits cutovers and refreshes cache revision",async()=>{
    const {id,code,repository}=await featureFixture();
    const context={tenantId:tenant,principalId:actor,planeKey:plane} as VerifiedRequestContext;
    const experience=new KyselyExperiencePlaneRepository(db),before=await experience.readFeatureRevision(context,new Date(from));
    await expect(sql`UPDATE control.feature_flag_catalog SET code='ui.renamed' WHERE id=${id}::uuid`.execute(admin)).rejects.toMatchObject({code:"23514"});
    await expect(sql`UPDATE control.feature_flag_catalog SET cohort_strategy='tenant_sha256_v1' WHERE id=${id}::uuid`.execute(admin)).rejects.toMatchObject({code:"23514"});
    await expect(cutover(id,1," ")).rejects.toMatchObject({code:"23514"});
    await expect(cutover(id,2)).rejects.toMatchObject({code:"40001"});
    await expect(cutover(id,1,"Reviewed impact","invalid")).rejects.toMatchObject({code:"23514"});
    expect((await evidence(id)).audits).toHaveLength(0);
    expect(await cutover(id,1)).toEqual({cohort_strategy:"tenant_sha256_v1",cohort_revision:2});
    expect(await repository.getDefinition(code)).toMatchObject({cohortStrategy:"tenant_sha256_v1",cohortRevision:2});
    expect(await experience.readFeatureRevision(context,new Date(from))).not.toBe(before);
    const saved=await evidence(id);expect(saved.audits).toHaveLength(1);expect(saved.events).toHaveLength(1);
    expect(saved.audits[0]).toMatchObject({actor_principal_id:actor,new_values:{cohortStrategy:"tenant_sha256_v1",reason:"Reviewed impact"}});
    expect(saved.events[0]).toMatchObject({payload:{cacheInvalidation:{scope:"plane",keys:[code]}}});
    // Same-strategy no-op neither advances the revision nor emits evidence.
    await cutover(id,2);expect((await evidence(id)).events).toHaveLength(1);
    await expect(cutover(id,1,"Stale review","principal_fnv1a_v2")).rejects.toMatchObject({code:"40001"});
    await expect(sql`UPDATE control.feature_flag_catalog SET cohort_strategy='principal_fnv1a_v2' WHERE id=${id}::uuid`.execute(db)).rejects.toMatchObject({code:"42501"});
  });

  it("features: concurrent cohort cutovers accept one reviewed revision",async()=>{
    const {id}=await featureFixture();
    const results=await Promise.allSettled([cutover(id,1),cutover(id,1)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"40001"}});
    expect((await evidence(id)).audits).toHaveLength(1);
    expect((await evidence(id)).events).toHaveLength(1);
  });

  it.each(["audit.audit_log","event.outbox"])("features: cohort cutover rolls back when %s fails",async tableName=>{
    const {id,code,repository}=await featureFixture();
    await run(`CREATE FUNCTION public.reject_cohort_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cohort evidence failure'; END $$;
      CREATE TRIGGER reject_cohort_evidence BEFORE INSERT ON ${tableName} FOR EACH ROW EXECUTE FUNCTION public.reject_cohort_evidence();`);
    try {await expect(cutover(id,1)).rejects.toThrow("injected cohort evidence failure");}
    finally {await run(`DROP TRIGGER reject_cohort_evidence ON ${tableName}; DROP FUNCTION public.reject_cohort_evidence();`);}
    expect(await repository.getDefinition(code)).toMatchObject({cohortStrategy:"principal_fnv1a_v2",cohortRevision:1});
    expect(await evidence(id)).toEqual({audits:[],events:[]});
  });

  it("features: saves and expires an override that changes evaluation and the experience revision",async()=>{
    const {id,code,repository,input}=await featureFixture();
    const context={tenantId:tenant,principalId:actor,planeKey:plane} as VerifiedRequestContext;
    const service=createFeatureFlagService({authorizer:{authorize:async()=>({allowed:true})},repositories:createKyselyFeatureFlagRepositories({[plane]:db}),cache:{invalidate:async()=>{}},now:()=>new Date(from)});
    const experience=new KyselyExperiencePlaneRepository(db);
    expect(await service.evaluate(context,code)).toMatchObject({enabled:false,source:"catalog"});
    const before=await experience.readFeatureRevision(context,new Date(from));
    const saved=await repository.saveOverride(input,actor);
    expect(await service.evaluate(context,code)).toMatchObject({enabled:true,source:"tenant_override"});
    expect((await experience.readFeatures(context,new Date(from))).find(f=>f.id===id)?.overrideEnabled).toBe(true);
    expect(await experience.readFeatureRevision(context,new Date(from))).not.toBe(before);
    expect(await repository.getOverride(tenant,id,"2089-12-31T23:59:59Z")).toBeUndefined();
    expect(await repository.getOverride(tenant,id,until)).toBeUndefined();
    const expired=await repository.expireOverride(tenant,saved.id,saved.version,actor);
    expect(await service.evaluate(context,code)).toMatchObject({enabled:false,source:"catalog"});
    expect(await repository.expireOverride(tenant,saved.id,expired.version,actor)).toEqual(expired);
    const records=await evidence(saved.id);expect(records.events).toHaveLength(2);expect(records.audits).toHaveLength(2);
    expect(records.audits).toEqual(expect.arrayContaining([expect.objectContaining({actor_principal_id:actor,new_values:expired})]));
    await expect(repository.saveOverride({...input,id:saved.id,expectedVersion:expired.version},actor)).rejects.toMatchObject({statusCode:409});
    expect(await createKyselyFeatureFlagRepositories({[plane]:db}).health(plane)).toMatchObject({status:"healthy"});
  });

  it("features: serializes concurrent creates, updates and expiry and rejects overlapping periods",async()=>{
    const {repository,input}=await featureFixture(),id=randomUUID();
    const creates=await Promise.allSettled([repository.saveOverride({...input,id},actor),repository.saveOverride({...input,id},actor)]);
    expect(creates.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(creates.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409}});
    const changes=await Promise.allSettled([repository.saveOverride({...input,id,expectedVersion:1,enabled:false},actor),repository.expireOverride(tenant,id,1,actor)]);
    expect(changes.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(changes.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409}});
    const next=await featureFixture();
    const overlap=await Promise.allSettled([repository.saveOverride(next.input,actor),repository.saveOverride(next.input,actor)]);
    expect(overlap.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(overlap.find(r=>r.status==="rejected")).toMatchObject({reason:{statusCode:409}});
    await expect(repository.saveOverride({...next.input,effectiveFrom:until,effectiveUntil:"2092-01-01T00:00:00Z"},actor)).resolves.toMatchObject({version:1});
  });

  it("features: prevents tenant, target and actor substitution inside the transaction",async()=>{
    const {id,repository,input}=await featureFixture(),saved=await repository.saveOverride(input,actor);
    expect(await repository.getOverride(otherTenant,id,from)).toBeUndefined();
    await expect(repository.expireOverride(otherTenant,saved.id,1,otherActor)).rejects.toMatchObject({statusCode:404});
    await expect(repository.saveOverride({...input,id:saved.id,tenantId:otherTenant,expectedVersion:1},otherActor)).rejects.toMatchObject({statusCode:409});
    const next=await featureFixture();await expect(repository.saveOverride({...input,id:saved.id,featureFlagId:next.id,expectedVersion:1},actor)).rejects.toMatchObject({statusCode:409});
    await expect(repository.saveOverride({...input,tenantId:otherTenant},actor)).rejects.toMatchObject({code:"23503"});
    expect(await repository.getOverride(otherTenant,id,from)).toBeUndefined();
    await db.transaction().execute(async tx=>{await sql`SELECT set_config('app.current_tenant_id',${otherTenant},true)`.execute(tx);
      expect((await sql`UPDATE control.feature_flag_override SET is_enabled=false WHERE id=${saved.id}::uuid RETURNING id`.execute(tx)).rows).toHaveLength(0);});
  });

  it.each(["audit.audit_log","event.outbox"])("features: rollback preserves evaluation when %s fails",async tableName=>{
    const {id,repository,input}=await featureFixture();
    const saved=await repository.saveOverride(input,actor);
    const previous=await evidence(saved.id);
    await run(`CREATE FUNCTION control.feature_evidence_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'feature evidence failed'; END $$;
      CREATE TRIGGER feature_evidence_failure BEFORE INSERT ON ${tableName} FOR EACH ROW EXECUTE FUNCTION control.feature_evidence_failure();`);
    try{
      await expect(repository.saveOverride({...input,id:saved.id,enabled:false,expectedVersion:1},actor)).rejects.toThrow("feature evidence failed");
      await expect(repository.expireOverride(tenant,saved.id,1,actor)).rejects.toThrow("feature evidence failed");
      expect(await repository.getOverride(tenant,id,from)).toEqual(saved);expect(await evidence(saved.id)).toEqual(previous);
      const next=await featureFixture();await expect(repository.saveOverride(next.input,actor)).rejects.toThrow("feature evidence failed");
      expect(await repository.getOverride(tenant,next.id,from)).toBeUndefined();
    }finally{await run(`DROP TRIGGER feature_evidence_failure ON ${tableName}; DROP FUNCTION control.feature_evidence_failure();`);}
  });

  it("registers only supported databases, probes schema readiness and rejects a mismatched plane", async () => {
    const provider = createKyselyEntitlementRepositories({[plane]:db});
    expect(await provider.health(plane)).toEqual({status:"healthy"});
    const absent=plane==="studio"?"mesh":"studio";
    expect(()=>provider.require(absent)).toThrow("CONTROL_ADMIN_ENTITLEMENT_REPOSITORY_UNAVAILABLE");
    expect(await provider.health(absent)).toMatchObject({status:"unavailable"});
    await expect(new KyselyEntitlementRepository(db,absent).listPlans()).rejects.toMatchObject({statusCode:503});
  });
});
