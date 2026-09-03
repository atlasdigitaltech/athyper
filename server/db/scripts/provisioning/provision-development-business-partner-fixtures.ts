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

    const northwind = fixtures.partners.find((item) => item.tenantCode === "cirrusatlantic" && item.code === "CATL-BP-001");
    if (!northwind) throw new Error("missing CATL-BP-001 fixture definition");
    await provisionDevelopmentBusinessPartner360Details(client, northwind, catl);

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

async function provisionDevelopmentBusinessPartner360Details(client: Client, fixture: DevelopmentBusinessPartnerFixture, coordinate: { tenantId: string; actorId: string }): Promise<void> {
  const metadata=JSON.stringify({_seed:{pack:FIXTURE_PACK,version:"2.1.0",profile:"business_partner_360"},environment:"disposable_local"});
  await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[coordinate.tenantId,coordinate.actorId]);
  const context=await one<{organization_id:string;company_code_id:string;legal_entity_id:string;business_partner_owner_type_id:string;contact_person_owner_type_id:string;industry_code_id:string}>(client,`
    SELECT organization.id::text organization_id,assignment.company_code_id::text company_code_id,company.legal_entity_id::text legal_entity_id,
           business_partner_owner.id::text business_partner_owner_type_id,contact_person_owner.id::text contact_person_owner_type_id,industry.id::text industry_code_id
    FROM master.operating_organization organization
    JOIN master.operating_organization_company_assignment assignment ON assignment.tenant_id=organization.tenant_id AND assignment.operating_organization_id=organization.id AND assignment.status='active'
    JOIN master.company_code company ON company.tenant_id=assignment.tenant_id AND company.id=assignment.company_code_id
    CROSS JOIN control.owner_type business_partner_owner
    CROSS JOIN control.owner_type contact_person_owner
    CROSS JOIN shared.industry_code industry
    WHERE organization.tenant_id=$1::uuid AND organization.code='catl.operations' AND business_partner_owner.code='business_partner' AND business_partner_owner.tenant_id IS NULL
      AND contact_person_owner.code='contact_person' AND contact_person_owner.tenant_id IS NULL AND industry.domain_code='isic' AND industry.code='4690'
    ORDER BY assignment.created_at LIMIT 1`,[coordinate.tenantId]);
  const addressId=deterministicUuid(`360:address:${fixture.tenantCode}:${fixture.code}`),addressLinkId=deterministicUuid(`360:address-link:${fixture.tenantCode}:${fixture.code}`),addressEventId=deterministicUuid(`360:address-event:${fixture.tenantCode}:${fixture.code}`),addressHash=createHash("sha256").update("Northwind Industrial Supplies|1 Merchant Square|London|E14 9GE|GB").digest("hex");
  const contactPersonId=deterministicUuid(`360:contact-person:${fixture.tenantCode}:${fixture.code}`),contactRoleId=deterministicUuid(`360:contact-role:${fixture.tenantCode}:${fixture.code}`),emailId=deterministicUuid(`360:contact-email:${fixture.tenantCode}:${fixture.code}`),phoneId=deterministicUuid(`360:contact-phone:${fixture.tenantCode}:${fixture.code}`);
  const identifierId=deterministicUuid(`360:identifier:${fixture.tenantCode}:${fixture.code}`),jurisdictionId=deterministicUuid(`360:tax-jurisdiction:${fixture.tenantCode}:GB`),taxId=deterministicUuid(`360:tax-registration:${fixture.tenantCode}:${fixture.code}`),commodityId=deterministicUuid(`360:commodity:${fixture.tenantCode}:industrial-supplies`),capabilityId=deterministicUuid(`360:commodity-capability:${fixture.tenantCode}:${fixture.code}`),classificationId=deterministicUuid(`360:industry-classification:${fixture.tenantCode}:${fixture.code}`);
  const bankId=deterministicUuid(`360:bank-account:${fixture.tenantCode}:${fixture.code}`),bankLinkId=deterministicUuid(`360:bank-link:${fixture.tenantCode}:${fixture.code}`),profileId=deterministicUuid(`360:supplier-profile:${fixture.tenantCode}:${fixture.code}`),relationshipId=deterministicUuid(`360:relationship:${fixture.tenantCode}:${fixture.code}`),governanceId=deterministicUuid(`360:governance:${fixture.tenantCode}:${fixture.code}`),individualShareholderId=deterministicUuid(`360:shareholder-individual:${fixture.tenantCode}:${fixture.code}`),corporateShareholderId=deterministicUuid(`360:shareholder:${fixture.tenantCode}:${fixture.code}`),qualificationId=deterministicUuid(`360:qualification:${fixture.tenantCode}:${fixture.code}`),preferenceId=deterministicUuid(`360:preference:${fixture.tenantCode}:${fixture.code}`),certificationId=deterministicUuid(`360:certification:${fixture.tenantCode}:${fixture.code}`);
  await client.query(`UPDATE master.business_partner SET legal_form='private_limited',incorporation_date='2008-04-15',website_url='https://northwind.example.test',metadata=$3::jsonb,updated_at=clock_timestamp(),updated_by=$4::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid`,[coordinate.tenantId,fixture.id,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_alias(tenant_id,business_partner_id,alias_name,alias_kind,created_by) VALUES($1::uuid,$2::uuid,'Northwind Industrial','trading',$3::uuid),($1::uuid,$2::uuid,'Northwind Supplies','search',$3::uuid) ON CONFLICT DO NOTHING`,[coordinate.tenantId,fixture.id,coordinate.actorId]);
  await client.query(`INSERT INTO master.address(id,tenant_id,address_type,address_kind,line1,city,region,postal_code,country_code,normalized_hash,formatted_address,validation_status,validation_provider,validation_confidence,validated_at,metadata,status,created_by) VALUES($1::uuid,$2::uuid,'registered','street','1 Merchant Square','London','Greater London','E14 9GE','GB',$3,'1 Merchant Square, London E14 9GE, United Kingdom','valid','development_fixture',100,clock_timestamp(),$4::jsonb,'active',$5::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[addressId,coordinate.tenantId,addressHash,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.address_link(id,tenant_id,owner_type_id,owner_id,address_id,purpose,is_primary,effective_from,metadata,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'default',true,$6::date,$7::jsonb,$8::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[addressLinkId,coordinate.tenantId,context.business_partner_owner_type_id,fixture.id,addressId,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.address_event(id,tenant_id,event_type,subject_address_id,provider,result_status,confidence,evidence_hash,payload,occurred_at,created_by) VALUES($1::uuid,$2::uuid,'VALIDATION_RECORDED',$3::uuid,'development_fixture','valid',100,$4,$5::jsonb,'2026-08-30T00:00:00Z',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[addressEventId,coordinate.tenantId,addressId,addressHash,JSON.stringify({fixture:true}),coordinate.actorId]);
  await client.query(`INSERT INTO master.contact_person(id,tenant_id,owner_type_id,owner_id,contact_name,business_title,department_name,is_primary,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'Amelia Hart','Supplier Account Manager','Customer Operations',true,$5::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[contactPersonId,coordinate.tenantId,context.business_partner_owner_type_id,fixture.id,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.contact_person_role(id,tenant_id,contact_person_id,role_code,effective_from,is_primary,metadata,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'commercial',$4::date,true,$5::jsonb,$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[contactRoleId,coordinate.tenantId,contactPersonId,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  for(const channel of [{id:emailId,type:'email',value:'amelia.hart@northwind.example.test',purpose:'business',signature:'fixture-email'},{id:phoneId,type:'phone',value:'+442079460180',purpose:'business',signature:'fixture-phone'}])await client.query(`INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,purpose,is_primary,is_verified,verified_at,verification_provider,verification_evidence,verification_signature,effective_from,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,true,true,'2026-08-30T00:00:00Z','development_fixture',$8::jsonb,$9,$10::timestamptz,$11::jsonb,'active',$12::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[channel.id,coordinate.tenantId,context.contact_person_owner_type_id,contactPersonId,channel.type,channel.value,channel.purpose,JSON.stringify({fixture:true}),channel.signature,`${EFFECTIVE_FROM}T00:00:00Z`,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.contact_email(contact_link_id,tenant_id,mx_checked_at,mx_valid,metadata,created_by) VALUES($1::uuid,$2::uuid,'2026-08-30T00:00:00Z',true,$3::jsonb,$4::uuid) ON CONFLICT(contact_link_id) DO NOTHING`,[emailId,coordinate.tenantId,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.contact_phone(contact_link_id,tenant_id,line_type,metadata,created_by) VALUES($1::uuid,$2::uuid,'landline',$3::jsonb,$4::uuid) ON CONFLICT(contact_link_id) DO NOTHING`,[phoneId,coordinate.tenantId,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_identifier(id,tenant_id,business_partner_id,scheme_code,identifier_value,issuing_authority,issuing_country_code,issued_at,is_primary,verified_at,verified_by,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'business_registration','08765432','Companies House','GB','2008-04-15',true,'2026-08-30T00:00:00Z',$4::uuid,$5::jsonb,'active',$4::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[identifierId,coordinate.tenantId,fixture.id,coordinate.actorId,JSON.stringify({...JSON.parse(metadata),maskedValue:'••••5432',protected:true})]);
  await client.query(`INSERT INTO master.tax_jurisdiction(id,tenant_id,code,name,jurisdiction_type,country_code,authority_name,metadata,status,created_by) VALUES($1::uuid,$2::uuid,'GB-HMRC','United Kingdom','country','GB','HM Revenue & Customs',$3::jsonb,'active',$4::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`,[jurisdictionId,coordinate.tenantId,metadata,coordinate.actorId]);
  const jurisdiction=await one<{id:string}>(client,"SELECT id::text FROM master.tax_jurisdiction WHERE tenant_id=$1::uuid AND code='GB-HMRC'",[coordinate.tenantId]);
  await client.query(`INSERT INTO master.business_partner_tax_registration(id,tenant_id,business_partner_id,jurisdiction_id,registration_type_code,registration_number,effective_from,is_primary,verified_at,verified_by,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'vat','GB123456789',$5::date,true,'2026-08-30T00:00:00Z',$6::uuid,$7::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[taxId,coordinate.tenantId,fixture.id,jurisdiction.id,EFFECTIVE_FROM,coordinate.actorId,JSON.stringify({...JSON.parse(metadata),maskedValue:'GB••••••789',protected:true})]);
  await client.query(`INSERT INTO master.commodity_category(id,tenant_id,code,name,description,metadata,status,created_by) VALUES($1::uuid,$2::uuid,'industrial_supplies','Industrial supplies','Industrial components and maintenance supplies',$3::jsonb,'active',$4::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`,[commodityId,coordinate.tenantId,metadata,coordinate.actorId]);
  const commodity=await one<{id:string}>(client,"SELECT id::text FROM master.commodity_category WHERE tenant_id=$1::uuid AND code='industrial_supplies'",[coordinate.tenantId]);
  await client.query(`INSERT INTO master.business_partner_commodity_capability(id,tenant_id,business_partner_id,commodity_category_id,partner_role,effective_from,notes,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'supplier',$5::date,'Primary industrial supply capability',$6::jsonb,'active',$7::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[capabilityId,coordinate.tenantId,fixture.id,commodity.id,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_industry_classification(id,tenant_id,business_partner_id,industry_domain_code,industry_code_id,assignment_kind,is_primary,confidence,effective_from,verified_at,verified_by,source_system,source_reference,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'isic',$4::uuid,'verified',true,100,$5::date,'2026-08-30T00:00:00Z',$6::uuid,'development_fixture','CATL-BP-001',$7::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[classificationId,coordinate.tenantId,fixture.id,context.industry_code_id,EFFECTIVE_FROM,coordinate.actorId,metadata]);
  await client.query(`INSERT INTO master.bank_account(id,tenant_id,code,name,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,is_verified,verified_at,verified_by,verification_method,metadata,status,created_by) VALUES($1::uuid,$2::uuid,'northwind_gbp','Northwind GBP remittance','Northwind Industrial Supplies Ltd','iban','GB29NWBK60161331926819','6819','GBP','Northwind Bank','GB',true,'2026-08-30T00:00:00Z',$3::uuid,'manual_document',$4::jsonb,'active',$3::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[bankId,coordinate.tenantId,coordinate.actorId,metadata]);
  await client.query(`INSERT INTO master.bank_account_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,company_code_id,purpose,is_primary,effective_from,metadata,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'business_partner',$4::uuid,'beneficiary',$5::uuid,$6::uuid,'disbursement',true,$7::date,$8::jsonb,$9::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[bankLinkId,coordinate.tenantId,context.business_partner_owner_type_id,fixture.id,bankId,context.company_code_id,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.company_code_supplier_profile(id,tenant_id,supplier_id,company_code_id,currency_code,preferred_remittance_bank_link_id,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'GBP',$5::uuid,$6::jsonb,'active',$7::uuid) ON CONFLICT(tenant_id,supplier_id,company_code_id) DO NOTHING`,[profileId,coordinate.tenantId,fixture.supplierId,context.company_code_id,bankLinkId,metadata,coordinate.actorId]);
  const related=await one<{id:string}>(client,"SELECT id::text FROM master.business_partner WHERE tenant_id=$1::uuid AND code='CATL-BP-002'",[coordinate.tenantId]);
  await client.query(`INSERT INTO master.business_partner_relationship(id,tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,country_code,effective_from,notes,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'distributor','GB',$5::date,'Regional distribution relationship',$6::jsonb,'active',$7::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[relationshipId,coordinate.tenantId,fixture.id,related.id,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_governance_relation(id,tenant_id,business_partner_id,relation_type_code,member_name,member_type,member_country_code,business_title,appointed_date,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'director','Eleanor North','individual','GB','Managing Director','2018-05-01',$4::jsonb,'active',$5::uuid) ON CONFLICT(tenant_id,id) DO UPDATE SET ownership_pct=NULL,updated_at=clock_timestamp(),updated_by=EXCLUDED.created_by`,[governanceId,coordinate.tenantId,fixture.id,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_governance_relation(id,tenant_id,business_partner_id,relation_type_code,member_name,member_type,member_country_code,ownership_pct,voting_pct,beneficial_ownership_pct,appointed_date,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'shareholder','Eleanor North','individual','GB',35,35,35,'2018-05-01',$4::jsonb,'active',$5::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[individualShareholderId,coordinate.tenantId,fixture.id,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.business_partner_governance_relation(id,tenant_id,business_partner_id,relation_type_code,member_name,member_type,member_country_code,ownership_pct,voting_pct,beneficial_ownership_pct,appointed_date,metadata,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'shareholder','Northwind Holdings Ltd','organization','GB',65,65,65,'2018-05-01',$4::jsonb,'active',$5::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[corporateShareholderId,coordinate.tenantId,fixture.id,metadata,coordinate.actorId]);
  const fingerprint=createHash("sha256").update(`${FIXTURE_PACK}:${fixture.code}:approved`).digest("hex");
  const reviewer=await one<{id:string}>(client,"SELECT id::text FROM master.principal WHERE tenant_id=$1::uuid AND code='catl.owner' AND status='active' AND id<>$2::uuid",[coordinate.tenantId,coordinate.actorId]);
  await client.query(`INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,operating_organization_id,company_code_id,commodity_capability_id,qualification_type_code,idempotency_key,decision,decision_reason,effective_from,reviewed_at,reviewed_by,approved_at,approved_by,next_review_at,decision_idempotency_key,decision_fingerprint,metadata,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,'supplier',$4::uuid,$5::uuid,$6::uuid,'compliance','northwind-qualification-v1','approved','Development acceptance evidence',$7::date,'2026-08-30T00:00:00Z',$8::uuid,'2026-08-30T00:00:00Z',$8::uuid,'2027-08-30','northwind-qualification-decision-v1',$9,$10::jsonb,$11::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[qualificationId,coordinate.tenantId,fixture.id,context.organization_id,context.company_code_id,capabilityId,EFFECTIVE_FROM,reviewer.id,fingerprint,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO control.supplier_preference_designation(id,tenant_id,business_partner_id,supplier_id,operating_organization_id,company_code_id,commodity_category_id,effective_from,rationale,status,idempotency_key,metadata,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::date,'Preferred development supplier for industrial supplies','pending','northwind-preference-v1',$9::jsonb,$10::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[preferenceId,coordinate.tenantId,fixture.id,fixture.supplierId,context.organization_id,context.company_code_id,commodity.id,EFFECTIVE_FROM,metadata,coordinate.actorId]);
  await client.query(`INSERT INTO master.certification(id,tenant_id,owner_type,owner_id,custom_name,certificate_number,certified_by,certified_location,effective_from,effective_until,company_code_id,metadata,status,created_by) VALUES($1::uuid,$2::uuid,'business_partner',$3::uuid,'ISO 9001:2015','QMS-GB-2026-001','British Standards Institution','London','2026-01-01','2029-12-31',$4::uuid,$5::jsonb,'active',$6::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`,[certificationId,coordinate.tenantId,fixture.id,context.company_code_id,metadata,coordinate.actorId]);
  const coverage=await one<{addresses:number;contacts:number;identifiers:number;supplier_profiles:number;bank_accounts:number;controls:number}>(client,`SELECT
    (SELECT count(*)::int FROM master.address_link WHERE tenant_id=$1::uuid AND owner_id=$2::uuid) addresses,
    (SELECT count(*)::int FROM master.contact_person WHERE tenant_id=$1::uuid AND owner_id=$2::uuid) contacts,
    ((SELECT count(*)::int FROM master.business_partner_identifier WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid)+(SELECT count(*)::int FROM master.business_partner_tax_registration WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid)) identifiers,
    (SELECT count(*)::int FROM master.company_code_supplier_profile WHERE tenant_id=$1::uuid AND supplier_id=$3::uuid) supplier_profiles,
    (SELECT count(*)::int FROM master.bank_account_link WHERE tenant_id=$1::uuid AND owner_id=$2::uuid) bank_accounts,
    ((SELECT count(*)::int FROM control.business_partner_qualification WHERE tenant_id=$1::uuid AND business_partner_id=$2::uuid)+(SELECT count(*)::int FROM master.certification WHERE tenant_id=$1::uuid AND owner_id=$2::uuid)) controls`,[coordinate.tenantId,fixture.id,fixture.supplierId]);
  if(Object.values(coverage).some((value)=>Number(value)<1))throw new Error(`CATL-BP-001 360 fixture coverage is incomplete: ${JSON.stringify(coverage)}`);
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
