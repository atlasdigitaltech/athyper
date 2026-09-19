#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const PACK = "acceptance.business-partner-r5.v1";
const CONFIRMATION = "LOCAL-NEON-BP-R5-FIXTURES";
export function buildR5DatabaseFixtures() {
  return Object.freeze(
    Object.fromEntries(
      [
        "businessPartnerId",
        "customerId",
        "assignmentId",
        "profileId",
        "riskId",
      ].map((name) => [name, uuid(name)]),
    ) as Record<
      | "businessPartnerId"
      | "customerId"
      | "assignmentId"
      | "profileId"
      | "riskId",
      string
    >,
  );
}
export function validateR5FixtureTarget(
  databaseUrl: string,
  confirmation?: string,
) {
  const url = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/athyper_neon"
  )
    throw new Error("R5 fixtures require the local athyper_neon database");
  if (confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);
}
export async function provisionBusinessPartnerR5Fixtures(options: {
  databaseUrl: string;
  confirmation?: string;
  tenantCode?: string;
  actorCode?: string;
  operatingOrganizationCode?: string;
  companyCode?: string;
}) {
  validateR5FixtureTarget(options.databaseUrl, options.confirmation);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      PACK,
    ]);
    const context = (
      await client.query(
        `SELECT t.id tenant_id,p.id actor_id,o.id organization_id,c.id company_id,c.functional_currency,
      (SELECT id FROM master.payment_term WHERE tenant_id=t.id AND status='active' ORDER BY id LIMIT 1) payment_term_id
      FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id AND p.code=$2 AND p.status='active'
      JOIN master.operating_organization o ON o.tenant_id=t.id AND o.code=$3 AND o.status='active' AND EXISTS(SELECT 1 FROM master.operating_organization_capability capability WHERE capability.tenant_id=o.tenant_id AND capability.operating_organization_id=o.id AND capability.capability_code='sales' AND capability.status='active' AND capability.effective_from<=CURRENT_DATE AND (capability.effective_until IS NULL OR capability.effective_until>CURRENT_DATE))
      JOIN master.operating_organization_company_assignment a ON a.tenant_id=t.id AND a.operating_organization_id=o.id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND (a.effective_until IS NULL OR a.effective_until>CURRENT_DATE)
      JOIN master.company_code c ON c.tenant_id=t.id AND c.id=a.company_code_id AND c.status='active' AND ($4::text IS NULL OR c.code=$4)
      WHERE t.code=$1 AND t.status='active' ORDER BY c.code LIMIT 1`,
        [
          options.tenantCode ?? "athyper",
          options.actorCode ?? "athyper.admin",
          options.operatingOrganizationCode ?? "acceptance.bp.r2",
          options.companyCode ?? null,
        ],
      )
    ).rows[0];
    if (!context?.payment_term_id)
      throw new Error(
        "R5 requires an active tenant/actor, sales organization/company assignment and payment term; provision the target foundation first",
      );
    await client.query(
      "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [context.tenant_id, context.actor_id],
    );
    const model = (
      await client.query(
        "SELECT code,version FROM master.risk_model WHERE applicable_context='customer_role' AND status='active' AND effective_from<=CURRENT_DATE AND (effective_until IS NULL OR effective_until>CURRENT_DATE) ORDER BY effective_from DESC,code,version LIMIT 1",
      )
    ).rows[0];
    if (!model)
      throw new Error("R5 requires an effective active Customer risk model");
    const f = buildR5DatabaseFixtures();
    const existing = await client.query(
      "SELECT id FROM master.business_partner WHERE tenant_id=$1 AND (id=$2 OR code='R5.CUS.CONTROLS')",
      [context.tenant_id, f.businessPartnerId],
    );
    if (existing.rowCount)
      throw new Error(
        "R5 fixture already exists; rebuild_disposable_neon_database before replay. Immutable evidence is never deleted as reset.",
      );
    const metadata = JSON.stringify({
      _seed: { pack: PACK, environment: "disposable_local" },
      notes: "synthetic_customer_control_qualification",
    });
    await client.query(
      `INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,ownership_class,registration_country_code,metadata,status,created_by)
      VALUES($1,$2,'R5.CUS.CONTROLS','R5 disposable Customer','organization','external','MY',$3,'active',$4)`,
      [f.businessPartnerId, context.tenant_id, metadata, context.actor_id],
    );
    await client.query(
      `INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,status,created_by) VALUES($1,$2,$3,'CUS.R5.CONTROLS','prospect',$4)`,
      [f.customerId, context.tenant_id, f.businessPartnerId, context.actor_id],
    );
    await client.query(
      `INSERT INTO master.business_partner_operating_organization_assignment(id,tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,created_by) VALUES($1,$2,$3,$4,'customer',CURRENT_DATE,'active',$5)`,
      [
        f.assignmentId,
        context.tenant_id,
        f.businessPartnerId,
        context.organization_id,
        context.actor_id,
      ],
    );
    await client.query(
      `INSERT INTO master.company_code_customer_profile(id,tenant_id,customer_id,company_code_id,currency_code,payment_term_id,metadata,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
      [
        f.profileId,
        context.tenant_id,
        f.customerId,
        context.company_id,
        context.functional_currency,
        context.payment_term_id,
        metadata,
        context.actor_id,
      ],
    );
    await client.query(
      `INSERT INTO master.party_risk_assessment(id,tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,overall_score,risk_band,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,notes,created_by)
      VALUES($1,$2,'customer',$3,$4,'customer_role',$6,$7,1,'low','approved',clock_timestamp(),$5,clock_timestamp(),$5,CURRENT_DATE+30,'Synthetic disposable fixture; not a product approval or production risk assessment',$5)`,
      [
        f.riskId,
        context.tenant_id,
        f.customerId,
        f.businessPartnerId,
        context.actor_id,
        model.code,
        model.version,
      ],
    );
    await client.query("COMMIT");
    return {
      schema: "athyper.business-partner-r5-environment/1",
      resetBoundary: "rebuild_disposable_neon_database",
      synthetic: true,
      onboardingEvidence: false,
      environment: {
        PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID: context.organization_id,
        PLAYWRIGHT_BP_R5_CUSTOMER_BUSINESS_PARTNER_ID: f.businessPartnerId,
        PLAYWRIGHT_BP_R5_CUSTOMER_ID: f.customerId,
        PLAYWRIGHT_BP_R5_COMPANY_CODE_ID: context.company_id,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
function uuid(name: string) {
  const bytes = createHash("sha256")
    .update(`${PACK}:${name}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function main() {
  const args = process.argv.slice(2),
    option = (name: string) =>
      args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  if (args.includes("--plan")) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: "athyper.business-partner-r5-environment-plan/1",
          confirmation: CONFIRMATION,
          fixtures: buildR5DatabaseFixtures(),
          createsOnboardingEvidence: false,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  const databaseUrl = process.env.ATHYPER_NEON_DATABASE_ADMIN_URL;
  if (!databaseUrl)
    throw new Error(
      "Set ATHYPER_NEON_DATABASE_ADMIN_URL through the local secret environment",
    );
  const result = await provisionBusinessPartnerR5Fixtures({
    databaseUrl,
    confirmation: option("--confirm"),
    tenantCode: option("--tenant"),
    actorCode: option("--actor"),
    operatingOrganizationCode: option("--organization"),
    companyCode: option("--company"),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
