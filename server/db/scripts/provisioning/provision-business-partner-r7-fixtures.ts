#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const CONFIRMATION = "LOCAL-NEON-BP-R7-FIXTURES";
const PACK = "acceptance.business-partner-r7.v1";

export function buildR7DatabaseFixtures() {
  return Object.freeze({
    requisitionId: uuid("requisition"),
    personId: uuid("person"),
    externalWorkerId: uuid("external-worker"),
    statementOfWorkId: uuid("statement-of-work"),
    engagementId: uuid("engagement"),
  });
}

export async function provisionBusinessPartnerR7Fixtures(options: {
  readonly databaseUrl: string;
  readonly confirmation?: string;
  readonly tenantCode?: string;
  readonly actorCode?: string;
}) {
  const url = new URL(options.databaseUrl);
  if (
    !new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname) ||
    url.pathname !== "/athyper_neon"
  )
    throw new Error("R7 fixtures require the local athyper_neon database");
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  const fixture = buildR7DatabaseFixtures();
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      PACK,
    ]);
    const context = await one<{
      tenant_id: string;
      actor_id: string;
      supplier_id: string;
      company_code_id: string;
      legal_entity_id: string;
    }>(
      client,
      `SELECT tenant.id::text tenant_id,principal.id::text actor_id,supplier.id::text supplier_id,
              company.id::text company_code_id,company.legal_entity_id::text legal_entity_id
         FROM master.tenant tenant
         JOIN master.principal principal ON principal.tenant_id=tenant.id AND principal.code=$2 AND principal.status='active'
         JOIN LATERAL(SELECT id FROM master.supplier WHERE tenant_id=tenant.id AND status='active' ORDER BY id LIMIT 1)supplier ON true
         JOIN LATERAL(SELECT id,legal_entity_id FROM master.company_code WHERE tenant_id=tenant.id AND status='active' ORDER BY id LIMIT 1)company ON true
        WHERE tenant.code=$1 AND tenant.status='active'`,
      [options.tenantCode ?? "athyper", options.actorCode ?? "athyper.admin"],
    );
    await client.query(
      "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [context.tenant_id, context.actor_id],
    );
    const metadata = JSON.stringify({
      _seed: { pack: PACK, environment: "disposable_local" },
    });
    await client.query(
      `INSERT INTO document.workforce_requisition(id,tenant_id,company_code_id,legal_entity_id,code,name,engagement_model,requested_headcount,expected_start_date,expected_end_date,currency_code,approved_at,approved_by,metadata,status,status_changed_at,status_changed_by,created_by)
       VALUES($1,$2,$3,$4,'R7.REQ.001','R7 resettable approved requisition','contingent',1,current_date,current_date+30,'USD',clock_timestamp(),$5,$6,'approved',clock_timestamp(),$5,$5)
       ON CONFLICT(tenant_id,id) DO NOTHING`,
      [
        fixture.requisitionId,
        context.tenant_id,
        context.company_code_id,
        context.legal_entity_id,
        context.actor_id,
        metadata,
      ],
    );
    await client.query(
      `INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,display_name,primary_email,metadata,status,created_by)
       VALUES($1,$2,'R7.PERSON.001','R7 External Worker','R7','Worker','R7 External Worker','r7-worker@example.test',$3,'active',$4)
       ON CONFLICT(tenant_id,id) DO NOTHING`,
      [fixture.personId, context.tenant_id, metadata, context.actor_id],
    );
    await client.query(
      `INSERT INTO master.external_worker(id,tenant_id,person_id,worker_number,default_classification,metadata,status,created_by)
       VALUES($1,$2,$3,'R7.WORKER.001','consultant',$4,'active',$5)
       ON CONFLICT(tenant_id,id) DO NOTHING`,
      [
        fixture.externalWorkerId,
        context.tenant_id,
        fixture.personId,
        metadata,
        context.actor_id,
      ],
    );
    await client.query(
      `INSERT INTO document.statement_of_work(id,tenant_id,company_code_id,legal_entity_id,supplier_id,code,name,metadata,status,status_changed_at,status_changed_by,created_by)
       VALUES($1,$2,$3,$4,$5,'R7.SOW.001','R7 resettable workforce SOW',$6,'active',clock_timestamp(),$7,$7)
       ON CONFLICT(tenant_id,id) DO NOTHING`,
      [
        fixture.statementOfWorkId,
        context.tenant_id,
        context.company_code_id,
        context.legal_entity_id,
        context.supplier_id,
        metadata,
        context.actor_id,
      ],
    );
    await client.query(
      `INSERT INTO document.worker_engagement(id,tenant_id,external_worker_id,supplier_id,company_code_id,legal_entity_id,statement_of_work_id,code,name,worker_classification,start_date,end_date,currency_code,readiness_evidence,onboarding_status,access_status,metadata,status,status_changed_at,status_changed_by,activated_at,activated_by,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,'R7.ENG.001','R7 resettable active engagement','consultant',current_date,current_date+30,'USD','{"eligible":true,"fixture":"BP-WRK-007"}','completed','not_requested',$9,'active',clock_timestamp(),$8,clock_timestamp(),$8,$8)
       ON CONFLICT(tenant_id,id) DO NOTHING`,
      [
        fixture.engagementId,
        context.tenant_id,
        fixture.externalWorkerId,
        context.supplier_id,
        context.company_code_id,
        context.legal_entity_id,
        fixture.statementOfWorkId,
        context.actor_id,
        metadata,
      ],
    );
    const state = await one<{
      requisition_status: string;
      requisition_version: number;
      engagement_status: string;
      engagement_version: number;
      placement_count: number;
      pack: string | null;
    }>(
      client,
      `SELECT requisition.status requisition_status,requisition.row_version::int requisition_version,
              engagement.status engagement_status,engagement.row_version::int engagement_version,
              (SELECT count(*)::int FROM document.worker_operational_placement placement WHERE placement.tenant_id=engagement.tenant_id AND placement.worker_engagement_id=engagement.id) placement_count,
              engagement.metadata#>>'{_seed,pack}' pack
         FROM document.workforce_requisition requisition
         JOIN document.worker_engagement engagement ON engagement.tenant_id=requisition.tenant_id
        WHERE requisition.tenant_id=$1 AND requisition.id=$2 AND engagement.id=$3`,
      [context.tenant_id, fixture.requisitionId, fixture.engagementId],
    );
    if (
      state.requisition_status !== "approved" ||
      state.requisition_version !== 1 ||
      state.engagement_status !== "active" ||
      state.engagement_version !== 1 ||
      state.placement_count !== 0 ||
      state.pack !== PACK
    )
      throw new Error(
        "R7 fixture is dirty; rebuild the disposable Neon database before replay",
      );
    await client.query("COMMIT");
    return Object.freeze({
      schema: "athyper.business-partner-r7-environment/1",
      resetBoundary: "rebuild_disposable_neon_database",
      environment: Object.freeze({
        PLAYWRIGHT_BP_R7_REQUISITION_ID: fixture.requisitionId,
        PLAYWRIGHT_BP_R7_SUPPLIER_ID: context.supplier_id,
        PLAYWRIGHT_BP_R7_REQUISITION_VERSION: state.requisition_version,
        PLAYWRIGHT_BP_R7_ENGAGEMENT_ID: fixture.engagementId,
        PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION: state.engagement_version,
        PLAYWRIGHT_BP_R7_COMPANY_CODE_ID: context.company_code_id,
        PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM: new Date()
          .toISOString()
          .slice(0, 10),
      }),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function uuid(value: string) {
  const bytes = createHash("sha256")
    .update(`${PACK}:${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function one<T>(
  client: Client,
  query: string,
  values: readonly unknown[],
) {
  const result = await client.query(query, [...values]);
  if (result.rowCount !== 1)
    throw new Error("R7 fixture coordinate was not found");
  return result.rows[0] as T;
}
function option(args: readonly string[], name: string) {
  return args
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--plan")) {
    process.stdout.write(
      `${JSON.stringify({ schema: "athyper.business-partner-r7-environment-plan/1", confirmation: CONFIRMATION, fixtures: buildR7DatabaseFixtures() }, null, 2)}\n`,
    );
    return;
  }
  const databaseUrl =
    option(args, "--database-url") ??
    process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!databaseUrl)
    throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url");
  process.stdout.write(
    `${JSON.stringify(
      await provisionBusinessPartnerR7Fixtures({
        databaseUrl,
        confirmation: option(args, "--confirm"),
        tenantCode: option(args, "--tenant-code"),
        actorCode: option(args, "--actor-code"),
      }),
      null,
      2,
    )}\n`,
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
