/** Disposable PostgreSQL engineering proof; no runtime grants/publications. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readBusinessPartner360ExplainabilitySection } from "../../../server/packages/services/master-data/src/kysely-business-partner-360-explainability.js";
import { createBusinessPartnerStoredScopes } from "../../../server/apps/platform-host/src/composition/business-partner-stored-scopes.js";

const require = createRequire(
  new URL(
    "../../../server/packages/services/master-data/package.json",
    import.meta.url,
  ),
);
const { Pool } = require("pg");
const { Kysely, PostgresDialect, sql } = require("kysely");
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

test("populated BP preview checks child rows/counts, revocation, stored company ownership and stale context", async () => {
  const name = `athyper-bp-provider-preview-${randomUUID()}`;
  let database: any;
  let created = false;
  try {
    docker(
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      "athyper.purpose=bp-provider-preview",
      "--publish",
      "127.0.0.1::5432",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "postgres:16.13-bookworm",
    );
    created = true;
    const port = JSON.parse(docker("inspect", name))[0].NetworkSettings.Ports[
      "5432/tcp"
    ][0].HostPort;
    for (let attempt = 0; ; attempt++) {
      try {
        docker("exec", name, "pg_isready", "-U", "postgres");
        break;
      } catch (error) {
        if (attempt >= 60) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    database = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({
          host: "127.0.0.1",
          port: Number(port),
          user: "postgres",
          database: "postgres",
        }),
      }),
    });
    await sql
      .raw(
        `
      CREATE SCHEMA document; CREATE SCHEMA snapshot; CREATE SCHEMA governance; CREATE SCHEMA audit;
      CREATE TABLE document.entity_case(id uuid,tenant_id uuid,entity_code text,target_entity_id uuid,current_snapshot_id uuid,case_code text,operation_code text,status text,created_at timestamptz,created_by uuid);
      CREATE TABLE snapshot.entity_snapshot(tenant_id uuid,snapshot_id uuid,payload_json jsonb);
      CREATE TABLE document.entity_case_command_evidence(id uuid,tenant_id uuid,entity_case_id uuid,command_code text,recorded_at timestamptz,recorded_by uuid,after_status text,result_code text,result_snapshot_id uuid,outcome text);
      CREATE TABLE governance.cycle_subject(tenant_id uuid,entity_case_id uuid,cycle_run_id uuid);
      CREATE TABLE document.entity_case_materialization(id uuid,tenant_id uuid,entity_case_id uuid,completed_at timestamptz,completed_by uuid,result_code text,materializer_code text,attempt_no integer,status text);
      CREATE TABLE audit.audit_log(id uuid,tenant_id uuid,event_code text,occurred_at timestamptz,actor_principal_id uuid,source_service text,request_id text,entity_type text,entity_id uuid,outcome text,changed_fields text[],context jsonb);
    `,
      )
      .execute(database);
    const tenant = randomUUID(),
      otherTenant = randomUUID(),
      bp = randomUUID(),
      otherBp = randomUUID(),
      actor = randomUUID();
    const allowed = randomUUID(),
      denied = randomUUID(),
      foreign = randomUUID(),
      unrelated = randomUUID();
    for (const [id, owner, parent, status, timestamp] of [
      [allowed, tenant, bp, "approved", "2026-09-10T00:00:00Z"],
      [denied, tenant, bp, "submitted", "2026-09-11T00:00:00Z"],
      [foreign, otherTenant, bp, "approved", "2026-09-11T00:00:00Z"],
      [unrelated, tenant, otherBp, "approved", "2026-09-11T00:00:00Z"],
    ]) {
      await sql`INSERT INTO document.entity_case VALUES(${id}::uuid,${owner}::uuid,'master.business_partner',${parent}::uuid,${id}::uuid,${id},'configure_company',${status},${timestamp}::timestamptz,${actor}::uuid)`.execute(
        database,
      );
      await sql`INSERT INTO snapshot.entity_snapshot VALUES(${owner}::uuid,${id}::uuid,'{}')`.execute(
        database,
      );
      // Even an explicit parent context must not bypass independent ownership.
      await sql`INSERT INTO audit.audit_log VALUES(${id}::uuid,${owner}::uuid,'business_partner.case.applied',${timestamp}::timestamptz,${actor}::uuid,'master-data',${id},'entity_case',${id}::uuid,'success',ARRAY['status'],${JSON.stringify({ businessPartnerId: bp })}::jsonb)`.execute(
        database,
      );
    }
    const parentEvent = randomUUID();
    await sql`INSERT INTO audit.audit_log VALUES(${parentEvent}::uuid,${tenant}::uuid,'business_partner.case.applied','2026-09-09',${actor}::uuid,'master-data',NULL,'business_partner',${bp}::uuid,'success',ARRAY['status'],'{}')`.execute(
      database,
    );
    const base = {
      tenantId: tenant,
      businessPartnerId: bp,
      limit: 2,
      cursor: { snapshotAt: "2026-09-12T00:00:00Z" },
      authorizeCase: async (id: string) => id === allowed,
    };
    const read = (sectionCode: "requests" | "activity", overrides = {}) =>
      database
        .transaction()
        .execute((tx: any) =>
          readBusinessPartner360ExplainabilitySection(
            { ...base, sectionCode, ...overrides } as never,
            tx,
          ),
        );
    const requests = await read("requests");
    assert.deepEqual(
      requests.items.map((item: any) => item.id),
      [allowed],
    );
    assert.deepEqual(requests.summary, {
      active: 1,
      returned: 0,
      pendingApproval: 0,
      approved: 1,
      failed: 0,
    });
    assert.equal(requests.next, undefined);
    const activity = await read("activity");
    assert.deepEqual(
      activity.items.map((item: any) => item.id),
      [allowed],
    );
    assert.equal(activity.next?.id, allowed);
    const second = await read("activity", {
      cursor: {
        ...base.cursor,
        afterId: allowed,
        afterAt: "2026-09-10T00:00:00Z",
        afterSource: "audit",
      },
    });
    assert.deepEqual(
      second.items.map((item: any) => item.id),
      [parentEvent],
    );
    assert.equal(second.next, undefined);
    const noAccess = await read("requests", {
      authorizeCase: async () => false,
    });
    assert.deepEqual(noAccess.items, []);
    assert.deepEqual(noAccess.summary, {
      active: 0,
      returned: 0,
      pendingApproval: 0,
      approved: 0,
      failed: 0,
    });
    const parentOnly = await read("activity", {
      authorizeCase: async () => false,
    });
    assert.deepEqual(
      parentOnly.items.map((item: any) => item.id),
      [parentEvent],
    );
    assert.equal(parentOnly.next, undefined);
    for (const section of ["requests", "activity"] as const) {
      let calls = 0;
      await assert.rejects(
        read(section, {
          authorizeCase: async (id: string) => id === allowed && ++calls === 1,
        }),
        (error: any) => error.code === "BP_CHILD_AUTHORIZATION_CHANGED",
      );
    }

    // Stored ownership and effective transaction context use the real adapter
    // and migration trigger, independently of browser sessions and live grants.
    await sql
      .raw(
        `
      CREATE SCHEMA master;
      CREATE TABLE master.company_code(tenant_id uuid,id uuid,status text,is_active boolean,PRIMARY KEY(tenant_id,id));
      CREATE TABLE master.business_partner(tenant_id uuid,id uuid);
      CREATE TABLE master.operating_organization(tenant_id uuid,id uuid,status text);
      CREATE TABLE master.operating_organization_company_assignment(tenant_id uuid,operating_organization_id uuid,company_code_id uuid,status text,effective_from date,effective_until date);
      CREATE TABLE master.business_partner_operating_organization_assignment(tenant_id uuid,business_partner_id uuid,operating_organization_id uuid,status text,is_active boolean,effective_from date,effective_until date);
    `,
      )
      .execute(database);
    const company = randomUUID(),
      wrongCompany = randomUUID(),
      org = randomUUID(),
      wrongOrg = randomUUID(),
      pilot = randomUUID();
    await sql`INSERT INTO master.company_code VALUES(${tenant}::uuid,${company}::uuid,'active',true),(${tenant}::uuid,${wrongCompany}::uuid,'active',true)`.execute(
      database,
    );
    await sql`INSERT INTO master.business_partner VALUES(${tenant}::uuid,${bp}::uuid)`.execute(
      database,
    );
    await sql`INSERT INTO master.operating_organization VALUES(${tenant}::uuid,${org}::uuid,'active'),(${tenant}::uuid,${wrongOrg}::uuid,'active')`.execute(
      database,
    );
    await sql`INSERT INTO master.operating_organization_company_assignment VALUES(${tenant}::uuid,${org}::uuid,${company}::uuid,'active',current_date-1,NULL)`.execute(
      database,
    );
    await sql`INSERT INTO master.business_partner_operating_organization_assignment VALUES(${tenant}::uuid,${bp}::uuid,${org}::uuid,'active',true,current_date-1,NULL)`.execute(
      database,
    );
    const migration = readFileSync(
      new URL(
        "../../../server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260911_company_owned_case_pilot.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await sql
      .raw(migration.replace(/^BEGIN;/, "").replace(/COMMIT;\s*$/, ""))
      .execute(database);
    await sql`INSERT INTO snapshot.entity_snapshot VALUES(${tenant}::uuid,${pilot}::uuid,${JSON.stringify({ companyCodeId: company, operatingOrganizationId: org })}::jsonb)`.execute(
      database,
    );
    await sql`INSERT INTO document.entity_case(id,tenant_id,entity_code,target_entity_id,current_snapshot_id,operation_code,owner_company_code_id) VALUES(${pilot}::uuid,${tenant}::uuid,'master.business_partner_company_setup_request',${bp}::uuid,${pilot}::uuid,'configure_company',${company}::uuid)`.execute(
      database,
    );
    const scopes = createBusinessPartnerStoredScopes(
      database,
      async () => "allowed" as never,
    );
    const context = { planeKey: "neon", tenantId: tenant, principalId: actor };
    const stored = {
      context,
      entityCode: "business_partner_company_setup_request",
      resolver: "company.record.v1",
      target: "existing",
      recordId: pilot,
      coordinates: {
        companyCodeId: wrongCompany,
        operatingOrganizationId: wrongOrg,
      },
    };
    assert.deepEqual(await scopes.resolve(stored as never), {
      state: "resolved",
      coordinates: { companyCodeId: company },
    });
    assert.deepEqual(
      await scopes.resolve({
        ...stored,
        context: { ...context, tenantId: otherTenant },
      } as never),
      { state: "invalid" },
    );
    const proposed = {
      ...stored,
      target: "proposed",
      recordId: undefined,
      coordinates: { companyCodeId: company, operatingOrganizationId: org },
    };
    assert.deepEqual(await scopes.resolve(proposed as never), {
      state: "resolved",
      coordinates: { companyCodeId: company },
    });
    assert.deepEqual(
      await scopes.resolve({
        ...proposed,
        coordinates: {
          companyCodeId: wrongCompany,
          operatingOrganizationId: org,
        },
      } as never),
      { state: "invalid" },
    );
    assert.deepEqual(
      await scopes.resolve({
        ...proposed,
        coordinates: { companyCodeId: company },
      } as never),
      { state: "invalid" },
    );
    await assert.rejects(
      sql`UPDATE document.entity_case SET owner_company_code_id=${wrongCompany}::uuid WHERE id=${pilot}::uuid`.execute(
        database,
      ),
      /COMPANY_CASE_OWNER_IMMUTABLE/,
    );
    await assert.rejects(
      sql`UPDATE document.entity_case SET entity_code='master.business_partner' WHERE id=${pilot}::uuid`.execute(
        database,
      ),
      /COMPANY_CASE_OWNER_IMMUTABLE/,
    );
    await sql`UPDATE master.operating_organization_company_assignment SET effective_until=current_date`.execute(
      database,
    );
    assert.deepEqual(await scopes.resolve(proposed as never), {
      state: "invalid",
    });
    // Existing ownership is company-only; an expired transaction selection does
    // not turn a readable parent or selected organization into the stored owner.
    assert.deepEqual(await scopes.resolve(stored as never), {
      state: "resolved",
      coordinates: { companyCodeId: company },
    });
    await sql`UPDATE master.company_code SET status='inactive' WHERE id=${company}::uuid`.execute(
      database,
    );
    assert.deepEqual(await scopes.resolve(stored as never), {
      state: "invalid",
    });
  } finally {
    try {
      await database?.destroy();
    } finally {
      if (created) docker("rm", "--force", "--volumes", name);
    }
  }
});
