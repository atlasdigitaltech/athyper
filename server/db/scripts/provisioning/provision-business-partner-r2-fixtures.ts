#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const CONFIRMATION = "LOCAL-NEON-BP-R2-FIXTURES";
const PACK = "acceptance.business-partner-r2.v1";

type ExistingRole = "none" | "supplier" | "customer";
type RequestedRole = "supplier" | "customer";

export interface R2DatabaseFixture {
  readonly scenario: "BP-SUP-002" | "BP-SUP-003" | "BP-CUS-002" | "BP-CUS-003";
  readonly businessPartnerId: string;
  readonly code: string;
  readonly existingRole: ExistingRole;
  readonly requestedRole: RequestedRole;
  readonly roleId?: string;
  readonly assignmentId?: string;
}

export function buildR2DatabaseFixtures(): readonly R2DatabaseFixture[] {
  return Object.freeze(
    [
      fixture("BP-SUP-002", "R2.SUP.EXT", "none", "supplier"),
      fixture("BP-SUP-003", "R2.CUS.DUAL", "customer", "supplier"),
      fixture("BP-CUS-002", "R2.CUS.EXT", "none", "customer"),
      fixture("BP-CUS-003", "R2.SUP.DUAL", "supplier", "customer"),
    ].map((item) => Object.freeze(item)),
  );
}

export async function provisionBusinessPartnerR2Fixtures(options: {
  readonly databaseUrl: string;
  readonly confirmation?: string;
  readonly tenantCode?: string;
  readonly actorCode?: string;
  readonly operatingOrganizationCode?: string;
}) {
  const url = new URL(options.databaseUrl);
  if (
    !new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname) ||
    url.pathname !== "/athyper_neon"
  )
    throw new Error("R2 fixtures require the local athyper_neon database");
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  const fixtures = buildR2DatabaseFixtures();
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      PACK,
    ]);
    await client.query("SELECT set_config('app.database_plane','neon',true)");
    const context = await one<{
      tenant_id: string;
      actor_id: string;
      organization_id: string;
    }>(
      client,
      `
      SELECT tenant.id::text tenant_id,principal.id::text actor_id,organization.id::text organization_id
      FROM master.tenant tenant
      JOIN master.principal principal ON principal.tenant_id=tenant.id AND principal.code=$2 AND principal.status='active'
      JOIN master.operating_organization organization ON organization.tenant_id=tenant.id AND organization.code=$3 AND organization.status='active'
      WHERE tenant.code=$1 AND tenant.status='active'`,
      [
        options.tenantCode ?? "athyper",
        options.actorCode ?? "athyper.admin",
        options.operatingOrganizationCode ?? "athyper.procurement.apac",
      ],
    );
    await client.query(
      "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [context.tenant_id, context.actor_id],
    );
    context.organization_id = await provisionR2Organization(client, context);
    const metadata = JSON.stringify({
      _seed: { pack: PACK, environment: "disposable_local" },
    });
    for (const item of fixtures) {
      await client.query(
        `INSERT INTO master.business_partner(
        id,tenant_id,code,name,display_name,legal_name,partner_category,ownership_class,
        category_locked_by,registration_country_code,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3,$4,$4,$4,'organization','external',$5::uuid,'MY',$6::jsonb,'active',$5::uuid)
      ON CONFLICT(tenant_id,id) DO NOTHING`,
        [
          item.businessPartnerId,
          context.tenant_id,
          item.code,
          `${item.scenario} resettable organization`,
          context.actor_id,
          metadata,
        ],
      );
      const state = await one<{ code: string; pack: string | null }>(
        client,
        `SELECT code,metadata#>>'{_seed,pack}' pack FROM master.business_partner WHERE tenant_id=$1::uuid AND id=$2::uuid`,
        [context.tenant_id, item.businessPartnerId],
      );
      if (state.code !== item.code || state.pack !== PACK)
        throw new Error(`R2 fixture identity conflict: ${item.scenario}`);
      if (item.existingRole === "supplier")
        await client.query(
          `INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'onboarding',$5::uuid) ON CONFLICT(tenant_id,business_partner_id) DO NOTHING`,
          [
            item.roleId,
            context.tenant_id,
            item.businessPartnerId,
            `SUP.${item.code}`,
            context.actor_id,
          ],
        );
      if (item.existingRole === "customer")
        await client.query(
          `INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'prospect',$5::uuid) ON CONFLICT(tenant_id,business_partner_id) DO NOTHING`,
          [
            item.roleId,
            context.tenant_id,
            item.businessPartnerId,
            `CUS.${item.code}`,
            context.actor_id,
          ],
        );
      if (item.existingRole !== "none")
        await client.query(
          `INSERT INTO master.business_partner_operating_organization_assignment(
        id,tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'2025-01-01','active',$6::uuid)
      ON CONFLICT(tenant_id,id) DO NOTHING`,
          [
            item.assignmentId,
            context.tenant_id,
            item.businessPartnerId,
            context.organization_id,
            item.existingRole,
            context.actor_id,
          ],
        );
      const counts = await one<{
        suppliers: number;
        onboarding_suppliers: number;
        customers: number;
        prospect_customers: number;
        assignments: number;
        expected_assignments: number;
      }>(
        client,
        `SELECT
        (SELECT count(*)::int FROM master.supplier WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid) suppliers,
        (SELECT count(*) FILTER(WHERE status='onboarding')::int FROM master.supplier WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid) onboarding_suppliers,
        (SELECT count(*)::int FROM master.customer WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid) customers,
        (SELECT count(*) FILTER(WHERE status='prospect')::int FROM master.customer WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid) prospect_customers,
        (SELECT count(*)::int FROM master.business_partner_operating_organization_assignment WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid) assignments,
        (SELECT count(*)::int FROM master.business_partner_operating_organization_assignment WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid AND operating_organization_id=$3::uuid AND partner_role=$4 AND status='active') expected_assignments`,
        [
          context.tenant_id,
          item.businessPartnerId,
          context.organization_id,
          item.existingRole === "none" ? item.requestedRole : item.existingRole,
        ],
      );
      const expectedSupplier = item.existingRole === "supplier" ? 1 : 0;
      const expectedCustomer = item.existingRole === "customer" ? 1 : 0;
      const expectedAssignment = item.existingRole === "none" ? 0 : 1;
      if (
        counts.suppliers !== expectedSupplier ||
        counts.onboarding_suppliers !== expectedSupplier ||
        counts.customers !== expectedCustomer ||
        counts.prospect_customers !== expectedCustomer ||
        counts.assignments !== expectedAssignment ||
        counts.expected_assignments !== expectedAssignment
      )
        throw new Error(
          `R2 fixture ${item.scenario} is dirty; rebuild the disposable database before replay`,
        );
    }
    await client.query("COMMIT");
    return {
      schema: "athyper.business-partner-r2-environment/1",
      resetBoundary: "rebuild_disposable_neon_database",
      operatingOrganizationId: context.organization_id,
      environment: {
        PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID: context.organization_id,
        ...Object.fromEntries(
          fixtures.map((item) => [
            environmentName(item.scenario),
            item.businessPartnerId,
          ]),
        ),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** A dedicated dual-capability scope keeps acceptance data out of real organizations. */
async function provisionR2Organization(
  client: Client,
  context: { tenant_id: string; actor_id: string; organization_id: string },
) {
  const organizationId = uuid(`organization:${context.tenant_id}`);
  const metadata = JSON.stringify({
    _seed: { pack: PACK },
    environment: "local_acceptance",
  });
  await client.query(
    `INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,metadata,status,created_by)
    VALUES($1,$2,'acceptance.bp.r2','Business Partner R2 acceptance','both',$3::jsonb,'active',$4)
    ON CONFLICT(tenant_id,id) DO NOTHING`,
    [organizationId, context.tenant_id, metadata, context.actor_id],
  );
  const organization = await one<{ domain: string; pack: string }>(
    client,
    `SELECT domain,metadata#>>'{_seed,pack}' pack FROM master.operating_organization WHERE tenant_id=$1 AND id=$2`,
    [context.tenant_id, organizationId],
  );
  if (organization.domain !== "both" || organization.pack !== PACK)
    throw new Error("R2 organization is not the owned dual-capability fixture");
  const companies = await client.query<{ id: string }>(
    `SELECT company_code_id::text id FROM master.operating_organization_company_assignment
    WHERE tenant_id=$1 AND operating_organization_id=$2 AND status='active' AND effective_from<=CURRENT_DATE
      AND (effective_until IS NULL OR effective_until>CURRENT_DATE) ORDER BY company_code_id`,
    [context.tenant_id, context.organization_id],
  );
  if (!companies.rows.length)
    throw new Error("R2 needs an active company assignment template");
  for (const company of companies.rows)
    await client.query(
      `INSERT INTO master.operating_organization_company_assignment(id,tenant_id,operating_organization_id,company_code_id,metadata,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(tenant_id,id) DO NOTHING`,
      [
        uuid(`company:${organizationId}:${company.id}`),
        context.tenant_id,
        organizationId,
        company.id,
        metadata,
        context.actor_id,
      ],
    );
  await client.query(
    `INSERT INTO master.procurement_organization_profile(tenant_id,operating_organization_id,organization_type,default_currency,lead_company_code_id,created_by)
    SELECT tenant_id,$2,'acceptance',default_currency,lead_company_code_id,$4 FROM master.procurement_organization_profile
    WHERE tenant_id=$1 AND operating_organization_id=$3 ON CONFLICT DO NOTHING`,
    [
      context.tenant_id,
      organizationId,
      context.organization_id,
      context.actor_id,
    ],
  );
  await client.query(
    `INSERT INTO master.sales_organization_profile(tenant_id,operating_organization_id,organization_type,default_currency,booking_company_code_id,invoicing_company_code_id,created_by)
    SELECT $1,$2,'acceptance',functional_currency,id,id,$4 FROM master.company_code WHERE tenant_id=$1 AND id=$3 ON CONFLICT DO NOTHING`,
    [
      context.tenant_id,
      organizationId,
      companies.rows[0]!.id,
      context.actor_id,
    ],
  );
  let scopeId = uuid(`scope:${organizationId}`);
  await client.query(
    `INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,created_by)
    SELECT $1,$2,'operating_organization','acceptance.bp.r2',$3,id,'Business Partner R2 acceptance',$4::jsonb,$5
    FROM authz.scope_target WHERE tenant_id=$2 AND scope_kind='tenant' AND target_id=$2 ON CONFLICT DO NOTHING`,
    [scopeId, context.tenant_id, organizationId, metadata, context.actor_id],
  );
  scopeId = (
    await one<{ id: string }>(
      client,
      `SELECT id::text FROM authz.scope_target WHERE tenant_id=$1 AND scope_kind='operating_organization' AND target_id=$2 AND status='active'`,
      [context.tenant_id, organizationId],
    )
  ).id;
  // Retain the existing role and propagation rules; copy only grants held by the three acceptance actors.
  const grants = await client.query<{
    group_id: string;
    role_id: string;
    propagation_mode: string;
  }>(
    `SELECT DISTINCT gr.group_id::text,gr.role_id::text,gr.propagation_mode
    FROM authz.group_role gr JOIN authz.scope_target st ON st.tenant_id=gr.tenant_id AND st.id=gr.scope_target_id
    JOIN authz.group_member gm ON gm.tenant_id=gr.tenant_id AND gm.group_id=gr.group_id AND gm.status='active'
    JOIN master.principal p ON p.tenant_id=gm.tenant_id AND p.id=gm.principal_id AND p.status='active'
    WHERE gr.tenant_id=$1 AND st.target_id=$2 AND st.scope_kind='operating_organization' AND gr.status='active'
      AND gr.effective_from<=now() AND (gr.effective_until IS NULL OR gr.effective_until>now())
      AND p.code=ANY($3::text[])`,
    [
      context.tenant_id,
      context.organization_id,
      ["athyper.admin", "athyper.owner", "athq.admin"],
    ],
  );
  if (!grants.rows.length)
    throw new Error(
      "R2 requires existing scoped actor grants before provisioning acceptance authority",
    );
  for (const grant of grants.rows) {
    const roleId = uuid(
      `role:${scopeId}:${grant.role_id}:${grant.propagation_mode}`,
    );
    const permissions = await client.query<{ id: string }>(
      `SELECT p.id::text FROM authz.role_permission rp
      JOIN authz.permission p ON p.id=rp.permission_id AND p.status='published'
      WHERE rp.tenant_id=$1 AND rp.role_id=$2
        AND authz.fn_internal_permission_is_assignable_at_scope(p.id,$1,$3,$4)`,
      [context.tenant_id, grant.role_id, scopeId, grant.propagation_mode],
    );
    if (!permissions.rows.length) continue;
    await client.query(
      `INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by)
      VALUES($1,$2,$3,'R2 scoped acceptance authority','system','seed',$4,$5::jsonb,'draft',$6) ON CONFLICT(id) DO NOTHING`,
      [
        roleId,
        context.tenant_id,
        `acceptance.bp.r2.${roleId}`,
        PACK,
        metadata,
        context.actor_id,
      ],
    );
    for (const permission of permissions.rows)
      await client.query(
        `INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
      SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id=$2 AND role_id=$3 AND permission_id=$4)`,
        [
          uuid(`permission:${roleId}:${permission.id}`),
          context.tenant_id,
          roleId,
          permission.id,
          context.actor_id,
        ],
      );
    await client.query(
      "UPDATE authz.role SET status='active',updated_by=$3 WHERE tenant_id=$1 AND id=$2 AND status='draft'",
      [context.tenant_id, roleId, context.actor_id],
    );
    await client.query(
      `INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,created_by)
      VALUES($1,$2,$3,$4,$5,$6,'seed',$7,$8::jsonb,$9) ON CONFLICT(id) DO NOTHING`,
      [
        uuid(`grant:${scopeId}:${grant.group_id}:${roleId}`),
        context.tenant_id,
        grant.group_id,
        roleId,
        scopeId,
        grant.propagation_mode,
        PACK,
        metadata,
        context.actor_id,
      ],
    );
  }
  return organizationId;
}

function fixture(
  scenario: R2DatabaseFixture["scenario"],
  code: string,
  existingRole: ExistingRole,
  requestedRole: RequestedRole,
): R2DatabaseFixture {
  return {
    scenario,
    code,
    existingRole,
    requestedRole,
    businessPartnerId: uuid(`${scenario}:partner`),
    ...(existingRole !== "none"
      ? { roleId: uuid(`${scenario}:${existingRole}`) }
      : {}),
    ...(existingRole !== "none"
      ? { assignmentId: uuid(`${scenario}:assignment`) }
      : {}),
  };
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
function environmentName(scenario: R2DatabaseFixture["scenario"]) {
  return (
    {
      "BP-SUP-002": "PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID",
      "BP-SUP-003": "PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID",
      "BP-CUS-002": "PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID",
      "BP-CUS-003": "PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID",
    } as const
  )[scenario];
}
async function one<T>(
  client: Client,
  query: string,
  values: readonly unknown[],
): Promise<T> {
  const result = await client.query(query, [...values]);
  if (result.rowCount !== 1)
    throw new Error("R2 fixture coordinate was not found");
  return result.rows[0] as T;
}
function option(args: readonly string[], name: string) {
  const item = args.find((value) => value.startsWith(`${name}=`));
  return item?.slice(name.length + 1);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--plan")) {
    process.stdout.write(
      `${JSON.stringify({ schema: "athyper.business-partner-r2-environment-plan/1", confirmation: CONFIRMATION, fixtures: buildR2DatabaseFixtures() }, null, 2)}\n`,
    );
    return;
  }
  const databaseUrl =
    option(args, "--database-url") ??
    process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!databaseUrl)
    throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url");
  process.stdout.write(
    `${JSON.stringify(await provisionBusinessPartnerR2Fixtures({ databaseUrl, confirmation: option(args, "--confirm") }), null, 2)}\n`,
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
