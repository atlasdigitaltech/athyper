#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const CONFIRMATION = "LOCAL-NEON-BUSINESS-PARTNER-FIXTURES";
const FIXTURE_PACK = "development.business-partner-two-tenant.v2";
const EFFECTIVE_FROM = "2025-01-01";
const UUID_NAMESPACE = "athyper:development-business-partner-fixtures:v1:";

export interface DevelopmentBusinessPartnerFixture {
  readonly id: string;
  readonly tenantCode: "athyper" | "cirrusatlantic";
  readonly actorCode: "athyper.admin" | "catl.admin";
  readonly code: string;
  readonly name: string;
  readonly displayName: string;
  readonly legalName: string;
  readonly countryCode: string;
  readonly status: "active" | "draft";
  readonly supplierId: string;
  readonly assignments: readonly Readonly<{ id: string; organizationCode: string }>[];
}

export interface DevelopmentBusinessPartnerScopeExpectation {
  readonly tenantCode: "athyper" | "cirrusatlantic";
  readonly organizationCode: string;
  readonly codes: readonly string[];
}

export function buildDevelopmentBusinessPartnerFixtures(): Readonly<{
  partners: readonly DevelopmentBusinessPartnerFixture[];
  expectations: readonly DevelopmentBusinessPartnerScopeExpectation[];
}> {
  const core = [
    partner("cirrusatlantic", "catl.admin", "CATL-BP-001", "Northwind Industrial Supplies", "Northwind Supplies", "Northwind Industrial Supplies Ltd", "GB", "active", ["catl.operations"]),
    partner("cirrusatlantic", "catl.admin", "CATL-BP-002", "Thames Facility Services", "Thames Facilities", "Thames Facility Services Limited", "GB", "draft", ["catl.operations"]),
    partner("cirrusatlantic", "catl.admin", "CATL-BP-HIDDEN", "Hidden CATL Test Partner", "Hidden CATL Partner", "Hidden CATL Test Partner Limited", "GB", "active", []),
    partner("athyper", "athyper.admin", "ATH-BP-GLOBAL", "Global Components Group", "Global Components", "Global Components Group Pte Ltd", "SG", "active", ["athyper.procurement.apac", "athyper.procurement.emea"]),
    partner("athyper", "athyper.admin", "ATH-BP-APAC", "Pacific Office Systems", "Pacific Office Systems", "Pacific Office Systems Sdn Bhd", "MY", "active", ["athyper.procurement.apac"]),
    partner("athyper", "athyper.admin", "ATH-BP-EMEA", "Rhine Laboratory Equipment", "Rhine Laboratory", "Rhine Laboratory Equipment GmbH", "DE", "draft", ["athyper.procurement.emea"]),
    partner("athyper", "athyper.admin", "ATH-BP-HIDDEN", "Hidden Athyper Test Partner", "Hidden Athyper Partner", "Hidden Athyper Test Partner Sdn Bhd", "MY", "active", []),
  ] as const;
  const catlPageFixtures = fixtureSeries("cirrusatlantic", "catl.admin", "CATL-BP", 3, 28, "GB", ["catl.operations"], [
    "Alder Engineering", "Beacon Safety Products", "Cedar Office Systems", "Dover Packaging", "Elm Technical Services", "Fenwick Logistics", "Granite Tools", "Harbour Electrical", "Ivory Data Services", "Juniper Cleaning", "Keystone Components", "Lighthouse Catering", "Meridian Textiles", "Norfolk Mechanical", "Oakfield Security", "Pennine Chemicals", "Quarry Plant Hire", "Redwood Uniforms", "Severn Couriers", "Trident Workspace", "Union Laboratory", "Vale Maintenance", "Westbridge Metals", "Yorkshire Pumps", "Zenith Calibration", "Amber Telecom", "Bristol Refrigeration", "Camden Printworks",
  ]);
  const athyperApacFixtures = fixtureSeries("athyper", "athyper.admin", "ATH-APAC", 1, 18, "MY", ["athyper.procurement.apac"], [
    "Amanah Technology", "Borneo Industrial", "Cendana Office", "Dataran Logistics", "Equator Safety", "Fajar Engineering", "Gemilang Packaging", "Horizon Facilities", "Indah Components", "Jaya Laboratory", "Kencana Electrical", "Lestari Textiles", "Maju Data Systems", "Nusantara Tools", "Orchid Cleaning", "Perdana Catering", "Rimba Security", "Suria Maintenance",
  ]);
  const athyperEmeaFixtures = fixtureSeries("athyper", "athyper.admin", "ATH-EMEA", 1, 18, "DE", ["athyper.procurement.emea"], [
    "Alpine Instruments", "Baltic Freight", "Central Robotics", "Danube Packaging", "Europa Safety", "Fjord Technical", "Geneva Office", "Helix Chemicals", "Iberia Components", "Jutland Services", "Kronberg Tools", "Lombardy Textiles", "Munich Calibration", "Nordic Electrical", "Orion Laboratory", "Prague Facilities", "Rhine Couriers", "Saxon Engineering",
  ]);
  const definitions = [...core, ...catlPageFixtures, ...athyperApacFixtures, ...athyperEmeaFixtures];
  const codes = (tenantCode: DevelopmentBusinessPartnerFixture["tenantCode"], organizationCode: string) => definitions.filter((item) => item.tenantCode === tenantCode && item.assignments.some((assignment) => assignment.organizationCode === organizationCode)).map((item) => item.code);
  const expectations = [
    expectation("cirrusatlantic", "catl.operations", codes("cirrusatlantic", "catl.operations")),
    expectation("athyper", "athyper.procurement.apac", codes("athyper", "athyper.procurement.apac")),
    expectation("athyper", "athyper.procurement.emea", codes("athyper", "athyper.procurement.emea")),
    expectation("athyper", "athyper.people.apac", []),
    expectation("athyper", "athyper.finance.apac", []),
  ] as const;
  return Object.freeze({ partners: Object.freeze(definitions), expectations: Object.freeze(expectations) });
}

export async function provisionDevelopmentBusinessPartnerFixtures(options: { readonly databaseUrl: string; readonly confirmation?: string; readonly dryRun?: boolean }) {
  const url = new URL(options.databaseUrl);
  if (!localDatabase(url) || url.pathname !== "/athyper_neon") throw new Error("development business-partner fixtures require local athyper_neon");
  const fixtures = buildDevelopmentBusinessPartnerFixtures();
  if (options.dryRun) return plan(fixtures);
  if (options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);

  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [FIXTURE_PACK]);
    await client.query("SELECT set_config('app.database_plane','neon',true)");

    const coordinates = new Map<string, { tenantId: string; actorId: string }>();
    for (const tenant of [
      { tenantCode: "athyper", actorCode: "athyper.admin" },
      { tenantCode: "cirrusatlantic", actorCode: "catl.admin" },
    ] as const) {
      const row = await one<{ tenant_id: string; actor_id: string }>(client, `
        SELECT tenant.id::text AS tenant_id,principal.id::text AS actor_id
        FROM master.tenant tenant
        JOIN master.principal principal ON principal.tenant_id=tenant.id
        WHERE tenant.code=$1 AND tenant.status='active' AND principal.code=$2 AND principal.status='active'
      `, [tenant.tenantCode, tenant.actorCode]);
      coordinates.set(tenant.tenantCode, { tenantId: row.tenant_id, actorId: row.actor_id });
    }

    const catl = requiredCoordinate(coordinates, "cirrusatlantic");
    await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)", [catl.tenantId, catl.actorId]);
    await client.query(`
      UPDATE master.operating_organization
      SET domain='both',updated_by=$2::uuid
      WHERE tenant_id=$1::uuid AND code='catl.operations' AND domain='corporate'
    `, [catl.tenantId, catl.actorId]);
    await one(client, `
      SELECT id FROM master.operating_organization
      WHERE tenant_id=$1::uuid AND code='catl.operations' AND domain='both' AND status='active'
    `, [catl.tenantId]);

    for (const fixture of fixtures.partners) {
      const coordinate = requiredCoordinate(coordinates, fixture.tenantCode);
      await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)", [coordinate.tenantId, coordinate.actorId]);
      const metadata = JSON.stringify({ _seed: { pack: FIXTURE_PACK, version: "2.0.0" }, environment: "disposable_local" });
      await client.query(`
        INSERT INTO master.business_partner (
          id,tenant_id,code,name,display_name,legal_name,partner_category,
          registration_country_code,metadata,status,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,'organization',$7,$8::jsonb,$9,$10::uuid)
        ON CONFLICT DO NOTHING
      `, [fixture.id, coordinate.tenantId, fixture.code, fixture.name, fixture.displayName, fixture.legalName, fixture.countryCode, metadata, fixture.status, coordinate.actorId]);
      const actualPartner = await one<{ id: string; code: string; status: string }>(client, `
        SELECT id::text,code,status::text FROM master.business_partner
        WHERE tenant_id=$1::uuid AND lower(code)=lower($2)
      `, [coordinate.tenantId, fixture.code]);
      if (actualPartner.id !== fixture.id || actualPartner.code !== fixture.code || actualPartner.status !== fixture.status) {
        throw new Error(`business-partner fixture conflict: ${fixture.tenantCode}/${fixture.code}`);
      }
      // A later fixture-pack revision deliberately reuses the stable fixture IDs. Reconcile
      // its seed marker after proving ownership so an idempotent replay upgrades v1 rows too.
      await client.query(`
        UPDATE master.business_partner
        SET metadata=$3::jsonb,updated_at=clock_timestamp(),updated_by=$4::uuid
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND metadata IS DISTINCT FROM $3::jsonb
      `, [coordinate.tenantId, fixture.id, metadata, coordinate.actorId]);

      await client.query(`
        INSERT INTO master.supplier (
          id,tenant_id,business_partner_id,supplier_code,supplier_type,metadata,status,created_by
        ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'general',$5::jsonb,'active',$6::uuid)
        ON CONFLICT DO NOTHING
      `, [fixture.supplierId, coordinate.tenantId, fixture.id, fixture.code, metadata, coordinate.actorId]);
      const actualSupplier = await one<{ id: string; business_partner_id: string; status: string }>(client, `
        SELECT id::text,business_partner_id::text,status::text FROM master.supplier
        WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid
      `, [coordinate.tenantId, fixture.id]);
      if (actualSupplier.id !== fixture.supplierId || actualSupplier.business_partner_id !== fixture.id || actualSupplier.status !== "active") {
        throw new Error(`supplier fixture conflict: ${fixture.tenantCode}/${fixture.code}`);
      }
      await client.query(`
        UPDATE master.supplier
        SET metadata=$3::jsonb,updated_at=clock_timestamp(),updated_by=$4::uuid
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND metadata IS DISTINCT FROM $3::jsonb
      `, [coordinate.tenantId, fixture.supplierId, metadata, coordinate.actorId]);

      for (const assignment of fixture.assignments) {
        const organization = await one<{ id: string; domain: string }>(client, `
          SELECT id::text,domain::text FROM master.operating_organization
          WHERE tenant_id=$1::uuid AND code=$2 AND status='active'
        `, [coordinate.tenantId, assignment.organizationCode]);
        if (!new Set(["procurement", "sales", "both"]).has(organization.domain)) {
          throw new Error(`business-partner fixture organization is not commercial: ${fixture.tenantCode}/${assignment.organizationCode}/${organization.domain}`);
        }
        await client.query(`
          INSERT INTO master.business_partner_operating_organization_assignment (
            id,tenant_id,business_partner_id,operating_organization_id,partner_role,
            effective_from,metadata,status,created_by
          ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'supplier',$5::date,$6::jsonb,'active',$7::uuid)
          ON CONFLICT DO NOTHING
        `, [assignment.id, coordinate.tenantId, fixture.id, organization.id, EFFECTIVE_FROM, metadata, coordinate.actorId]);
        const actualAssignment = await one<{ id: string; status: string }>(client, `
          SELECT id::text,status::text
          FROM master.business_partner_operating_organization_assignment
          WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid
            AND operating_organization_id=$3::uuid AND partner_role='supplier'
            AND effective_until IS NULL AND status='active'
        `, [coordinate.tenantId, fixture.id, organization.id]);
        if (actualAssignment.id !== assignment.id || actualAssignment.status !== "active") {
          throw new Error(`business-partner assignment fixture conflict: ${fixture.tenantCode}/${fixture.code}/${assignment.organizationCode}`);
        }
        await client.query(`
          UPDATE master.business_partner_operating_organization_assignment
          SET metadata=$3::jsonb,updated_at=clock_timestamp(),updated_by=$4::uuid
          WHERE tenant_id=$1::uuid AND id=$2::uuid AND metadata IS DISTINCT FROM $3::jsonb
        `, [coordinate.tenantId, assignment.id, metadata, coordinate.actorId]);
      }
    }

    const visibility = [];
    for (const expected of fixtures.expectations) {
      const coordinate = requiredCoordinate(coordinates, expected.tenantCode);
      const result = await one<{ codes: string[] }>(client, `
        SELECT COALESCE(array_agg(partner.code ORDER BY partner.code),'{}'::text[]) AS codes
        FROM master.business_partner partner
        JOIN master.business_partner_operating_organization_assignment assignment
          ON assignment.tenant_id=partner.tenant_id AND assignment.business_partner_id=partner.id
        JOIN master.operating_organization organization
          ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.operating_organization_id
        WHERE partner.tenant_id=$1::uuid AND organization.code=$2
          AND partner.code=ANY($3::text[]) AND assignment.status='active'
          AND assignment.effective_from<=CURRENT_DATE
          AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)
      `, [coordinate.tenantId, expected.organizationCode, fixtures.partners.filter((item) => item.tenantCode === expected.tenantCode).map((item) => item.code)]);
      if (JSON.stringify(result.codes) !== JSON.stringify(expected.codes)) {
        throw new Error(`fixture visibility mismatch: ${expected.tenantCode}/${expected.organizationCode}; expected ${expected.codes.join(",")}, received ${result.codes.join(",")}`);
      }
      visibility.push({ tenantCode: expected.tenantCode, organizationCode: expected.organizationCode, expectedVisibleCount: expected.codes.length, codes: result.codes });
    }
    await client.query("COMMIT");
    return { mode: "applied", pack: FIXTURE_PACK, partners: fixtures.partners.length, assignments: fixtures.partners.reduce((sum, item) => sum + item.assignments.length, 0), visibility };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function partner(tenantCode: DevelopmentBusinessPartnerFixture["tenantCode"], actorCode: DevelopmentBusinessPartnerFixture["actorCode"], code: string, name: string, displayName: string, legalName: string, countryCode: string, status: DevelopmentBusinessPartnerFixture["status"], organizationCodes: readonly string[]): DevelopmentBusinessPartnerFixture {
  return Object.freeze({ id: deterministicUuid(`partner:${tenantCode}:${code}`), tenantCode, actorCode, code, name, displayName, legalName, countryCode, status, supplierId: deterministicUuid(`supplier:${tenantCode}:${code}`), assignments: Object.freeze(organizationCodes.map((organizationCode) => Object.freeze({ id: deterministicUuid(`assignment:${tenantCode}:${code}:${organizationCode}:supplier`), organizationCode }))) });
}
function fixtureSeries(tenantCode: DevelopmentBusinessPartnerFixture["tenantCode"], actorCode: DevelopmentBusinessPartnerFixture["actorCode"], prefix: string, start: number, count: number, countryCode: string, organizationCodes: readonly string[], names: readonly string[]): readonly DevelopmentBusinessPartnerFixture[] { if (names.length !== count) throw new Error(`fixture series ${prefix} requires ${count} names`); return Object.freeze(names.map((name, index) => { const code = `${prefix}-${String(start + index).padStart(3, "0")}`; return partner(tenantCode, actorCode, code, name, name, `${name} ${countryCode === "GB" ? "Limited" : countryCode === "DE" ? "GmbH" : "Sdn Bhd"}`, countryCode, index % 7 === 0 ? "draft" : "active", organizationCodes); })); }
function expectation(tenantCode: DevelopmentBusinessPartnerScopeExpectation["tenantCode"], organizationCode: string, codes: readonly string[]): DevelopmentBusinessPartnerScopeExpectation { return Object.freeze({ tenantCode, organizationCode, codes: Object.freeze([...codes].sort()) }); }
function plan(fixtures: ReturnType<typeof buildDevelopmentBusinessPartnerFixtures>) { return { mode: "planned", pack: FIXTURE_PACK, partners: fixtures.partners.length, assignments: fixtures.partners.reduce((sum, item) => sum + item.assignments.length, 0), visibility: fixtures.expectations.map((item) => ({ tenantCode: item.tenantCode, organizationCode: item.organizationCode, expectedVisibleCount: item.codes.length, codes: item.codes })) }; }
function requiredCoordinate(coordinates: ReadonlyMap<string, { tenantId: string; actorId: string }>, tenantCode: string) { const value=coordinates.get(tenantCode);if(!value)throw new Error(`missing fixture coordinate: ${tenantCode}`);return value; }
function deterministicUuid(name: string): string { const bytes=createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const hex=bytes.toString("hex");return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
function localDatabase(url: URL): boolean { if (["localhost","127.0.0.1","::1"].includes(url.hostname)) return true;const octets=url.hostname.split(".").map(Number);return octets.length===4&&octets.every((octet)=>Number.isInteger(octet)&&octet>=0&&octet<=255)&&(octets[0]===10||(octets[0]===172&&octets[1]!>=16&&octets[1]!<=31)||(octets[0]===192&&octets[1]===168)); }
async function one<T extends object>(client: Pick<Client,"query">, statement: string, values: unknown[]=[]): Promise<T> { const result=await client.query<T>(statement,values);if(result.rows.length!==1)throw new Error(`expected one row, received ${result.rows.length}`);return result.rows[0]!; }
function option(args: readonly string[], name: string): string|undefined { const equal=args.find((item)=>item.startsWith(`${name}=`));if(equal)return equal.slice(name.length+1);const index=args.indexOf(name);return index<0?undefined:args[index+1]; }

async function main(): Promise<void> {
  const args=process.argv.slice(2);
  const databaseUrl=option(args,"--database-url")??process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if(!databaseUrl)throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url");
  const result=await provisionDevelopmentBusinessPartnerFixtures({databaseUrl,confirmation:option(args,"--confirm"),dryRun:args.includes("--plan")||args.includes("--dry-run")});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)await main();
