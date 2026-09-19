import type { QueryClient } from "./safe-provision.js";
import type { ProvisionPlane } from "./safe-provision.js";
import {
  databaseManagedScopeUuid,
  deterministicUuid,
  type ProvisionInputs,
} from "./three-plane-model.js";

const SOURCE_REF = "three-plane-demo:v1";

export async function applyNeonScenarioFoundation(
  client: QueryClient,
  inputs: ProvisionInputs,
  tenantId: string,
  tenantCode: string,
  actorId: string,
): Promise<void> {
  const pack = inputs.scenarioPacks[tenantCode];
  if (!pack) throw new Error(`missing Neon scenario pack: ${tenantCode}`);
  await client.query(
    "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
    [tenantId, actorId],
  );
  for (const company of pack.companyCodes) {
    const legalEntity = await one<{ id: string }>(client, `
      SELECT id::text AS id FROM master.legal_entity
      WHERE tenant_id=$1::uuid AND metadata->>'externalScopeKey'=$2
    `, [tenantId, company.legalEntityScopeKey]);
    await client.query(`
      INSERT INTO master.company_code (
        id,tenant_id,legal_entity_id,code,name,display_name,functional_currency,
        country_code,fiscal_year_start_month,timezone_code,locale_code,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$5,$6,$7,$8,$9,$10,$11::jsonb,'active',$12::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        legal_entity_id=EXCLUDED.legal_entity_id,name=EXCLUDED.name,display_name=EXCLUDED.display_name,
        functional_currency=EXCLUDED.functional_currency,country_code=EXCLUDED.country_code,
        fiscal_year_start_month=EXCLUDED.fiscal_year_start_month,timezone_code=EXCLUDED.timezone_code,
        locale_code=EXCLUDED.locale_code,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.company_code.legal_entity_id,master.company_code.name,master.company_code.display_name,
        master.company_code.functional_currency,master.company_code.country_code,
        master.company_code.fiscal_year_start_month,master.company_code.timezone_code,
        master.company_code.locale_code,master.company_code.metadata,master.company_code.status)
        IS DISTINCT FROM (EXCLUDED.legal_entity_id,EXCLUDED.name,EXCLUDED.display_name,
        EXCLUDED.functional_currency,EXCLUDED.country_code,EXCLUDED.fiscal_year_start_month,
        EXCLUDED.timezone_code,EXCLUDED.locale_code,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "company-code", company.code), tenantId,
      legalEntity.id, company.code, company.name, company.functionalCurrency, company.countryCode,
      company.fiscalYearStartMonth, company.timezoneCode, company.localeCode,
      JSON.stringify(seedMetadata(inputs, "neon", {
        legalEntityScopeKey: company.legalEntityScopeKey,
        companyPurpose: company.companyPurpose,
        readinessProfile: company.readinessProfile,
        ...(company.logoAssetRef ? { logoAssetRef: company.logoAssetRef } : {}),
      })), actorId]);
  }
  await applyCompanyReadinessBaselines(client, inputs, tenantId, tenantCode, pack, actorId);

  const operatingOrganizationIds = new Map<string, string>();
  for (const organization of pack.operatingOrganizations) {
    const organizationId = deterministicUuid("neon", tenantCode, "operating-organization", organization.code);
    const parentId = organization.parentCode
      ? operatingOrganizationIds.get(organization.parentCode)
      : undefined;
    if (organization.parentCode && !parentId) {
      throw new Error(`unresolved operating organization parent: ${tenantCode}/${organization.parentCode}`);
    }
    await client.query(`
      INSERT INTO master.operating_organization (
        id,tenant_id,code,name,display_name,organization_kind,parent_operating_organization_id,
        metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$5,$8::uuid,$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,display_name=EXCLUDED.display_name,organization_kind=EXCLUDED.organization_kind,
        metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.operating_organization.name,master.operating_organization.display_name,
        master.operating_organization.organization_kind,master.operating_organization.metadata,
        master.operating_organization.status) IS DISTINCT FROM
        (EXCLUDED.name,EXCLUDED.display_name,EXCLUDED.organization_kind,EXCLUDED.metadata,EXCLUDED.status)
    `, [organizationId,
      tenantId, organization.code, organization.name,
      organization.parentCode ? "shared_operations" : "company_operations",
      JSON.stringify(seedMetadata(inputs, "neon")), actorId, parentId ?? null]);
    const actual = await one<{ id: string; parentId: string | null }>(client, `
      SELECT id::text AS id,parent_operating_organization_id::text AS "parentId"
      FROM master.operating_organization WHERE tenant_id=$1::uuid AND code=$2
    `, [tenantId, organization.code]);
    if (actual.parentId !== (parentId ?? null)) {
      throw new Error(`operating organization hierarchy conflict: ${tenantCode}/${organization.code}`);
    }
    operatingOrganizationIds.set(organization.code, actual.id);
    const capabilityCodes = organization.domain === "both"
      ? ["finance", "procurement", "people", "sales", "operations", "warehouse", "projects"]
      : organization.domain === "shared_services" ? ["finance", "people"]
      : [organization.domain];
    for (const capabilityCode of capabilityCodes) await client.query(`
      INSERT INTO master.operating_organization_capability(
        tenant_id,operating_organization_id,capability_code,effective_from,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3,DATE '2025-01-01',$4::jsonb,'active',$5::uuid)
      ON CONFLICT(tenant_id,operating_organization_id,capability_code,effective_from) DO UPDATE SET
        status='active',metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    `, [tenantId, actual.id, capabilityCode, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
  }
  for (const assignment of pack.operatingOrganizationCompanyAssignments) {
    const coordinate = await one<{ organizationId: string; companyId: string }>(client, `
      SELECT organization.id::text AS "organizationId",company.id::text AS "companyId"
      FROM master.operating_organization organization
      JOIN master.company_code company ON company.tenant_id=organization.tenant_id
      WHERE organization.tenant_id=$1::uuid AND organization.code=$2 AND company.code=$3
    `, [tenantId, assignment.organizationCode, assignment.companyCode]);
    await client.query(`
      INSERT INTO master.operating_organization_company_assignment (
        id,tenant_id,operating_organization_id,company_code_id,participation_role,
        effective_from,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,DATE '2025-01-01',$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,operating_organization_id,company_code_id,effective_from) DO UPDATE SET
        participation_role=EXCLUDED.participation_role,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
      WHERE (master.operating_organization_company_assignment.participation_role,
        master.operating_organization_company_assignment.metadata,
        master.operating_organization_company_assignment.status) IS DISTINCT FROM
        (EXCLUDED.participation_role,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "operating-organization-company",
      assignment.organizationCode, assignment.companyCode), tenantId, coordinate.organizationId,
      coordinate.companyId, assignment.participationRole,
      JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
  }

  for (const type of pack.orgUnitTypes) {
    await client.query(`
      INSERT INTO control.org_unit_type (
        id,tenant_id,code,name,level_order,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,level_order=EXCLUDED.level_order,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
      WHERE (control.org_unit_type.name,control.org_unit_type.level_order,
        control.org_unit_type.metadata,control.org_unit_type.status) IS DISTINCT FROM
        (EXCLUDED.name,EXCLUDED.level_order,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "org-unit-type", type.code), tenantId,
      type.code, type.name, type.levelOrder, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
  }
  const orgUnitIds = new Map<string, string>();
  for (const unit of pack.orgUnits) {
    const type = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM control.org_unit_type WHERE tenant_id=$1::uuid AND code=$2",
      [tenantId, unit.typeCode]);
    const unitId = deterministicUuid("neon", tenantCode, "org-unit", unit.code);
    const parentId = unit.parentCode ? orgUnitIds.get(unit.parentCode) : undefined;
    if (unit.parentCode && !parentId) {
      throw new Error(`unresolved organization unit parent: ${tenantCode}/${unit.parentCode}`);
    }
    await client.query(`
      INSERT INTO master.org_unit (
        id,tenant_id,org_unit_type_id,parent_org_unit_id,code,name,display_name,
        sort_order,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$9::uuid,$4,$5,$5,$6,$7::jsonb,'active',$8::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        org_unit_type_id=EXCLUDED.org_unit_type_id,name=EXCLUDED.name,display_name=EXCLUDED.display_name,
        sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.org_unit.org_unit_type_id,master.org_unit.name,master.org_unit.display_name,
        master.org_unit.sort_order,master.org_unit.metadata,master.org_unit.status) IS DISTINCT FROM
        (EXCLUDED.org_unit_type_id,EXCLUDED.name,EXCLUDED.display_name,
        EXCLUDED.sort_order,EXCLUDED.metadata,EXCLUDED.status)
    `, [unitId, tenantId,
      type.id, unit.code, unit.name, unit.sortOrder,
      JSON.stringify(seedMetadata(inputs, "neon")), actorId, parentId ?? null]);
    const actual = await one<{ id: string; parentId: string | null }>(client, `
      SELECT id::text AS id,parent_org_unit_id::text AS "parentId"
      FROM master.org_unit WHERE tenant_id=$1::uuid AND code=$2
    `, [tenantId, unit.code]);
    if (actual.parentId !== (parentId ?? null)) {
      throw new Error(`organization unit hierarchy conflict: ${tenantCode}/${unit.code}`);
    }
    orgUnitIds.set(unit.code, actual.id);
  }
}

async function applyCompanyReadinessBaselines(
  client: QueryClient,
  inputs: ProvisionInputs,
  tenantId: string,
  tenantCode: string,
  pack: ProvisionInputs["scenarioPacks"][string],
  actorId: string,
): Promise<void> {
  const chartId = deterministicUuid("neon", tenantCode, "finance-baseline", "chart");
  await client.query(`
    INSERT INTO master.chart_of_account(
      id,tenant_id,code,name,framework,account_range,metadata,status,created_by
    ) VALUES($1::uuid,$2::uuid,$3,$4,'DEMO','1000-9999',$5::jsonb,'active',$6::uuid)
    ON CONFLICT(tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,framework=EXCLUDED.framework,account_range=EXCLUDED.account_range,
      metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
  `, [chartId, tenantId, `${tenantCode}.coa`, `${tenantCode} Demo Chart of Accounts`,
    JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: "finance_baseline_v1" })), actorId]);

  for (const [companyIndex, company] of pack.companyCodes.entries()) {
    const companyId = (await one<{ id: string }>(client,
      "SELECT id::text AS id FROM master.company_code WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
      [tenantId, company.code])).id;
    const bookId = deterministicUuid("neon", tenantCode, "finance-baseline", "book", company.code);
    await client.query(`
      INSERT INTO master.ledger_book(
        id,tenant_id,code,name,category,reporting_standard,base_currency_code,is_primary,
        metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3,$4,'statutory','DEMO',$5,$6,$7::jsonb,'active',$8::uuid)
      ON CONFLICT(tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,base_currency_code=EXCLUDED.base_currency_code,is_primary=EXCLUDED.is_primary,
        metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
    `, [bookId, tenantId, `${company.code}.primary`, `${company.name} Primary Book`, company.functionalCurrency,
      companyIndex === 0, JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: company.readinessProfile })), actorId]);
    await client.query(`
      INSERT INTO master.company_code_chart_assignment(
        id,tenant_id,company_code_id,chart_of_account_id,assignment_type,is_primary,
        effective_from,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'operating',true,DATE '2026-01-01',$5::jsonb,'active',$6::uuid)
      ON CONFLICT(tenant_id,company_code_id,chart_of_account_id,assignment_type) DO UPDATE SET
        is_primary=true,effective_from=EXCLUDED.effective_from,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
    `, [deterministicUuid("neon", tenantCode, "finance-baseline", "chart-assignment", company.code),
      tenantId, companyId, chartId, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
    await client.query(`
      INSERT INTO master.company_code_book_assignment(
        id,tenant_id,company_code_id,book_id,effective_from,priority,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,DATE '2026-01-01',100,$5::jsonb,'active',$6::uuid)
      ON CONFLICT(tenant_id,company_code_id,book_id,effective_from) DO UPDATE SET
        priority=100,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
    `, [deterministicUuid("neon", tenantCode, "finance-baseline", "book-assignment", company.code),
      tenantId, companyId, bookId, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);

    for (let period = 1; period <= 12; period += 1) {
      const start = new Date(Date.UTC(2026, company.fiscalYearStartMonth - 1 + period - 1, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      const code = `FY2026-P${String(period).padStart(2, "0")}`;
      await client.query(`
        INSERT INTO master.fiscal_period(
          id,tenant_id,company_code_id,code,name,fiscal_year,period_number,period_type,
          start_date,end_date,opened_at,opened_by,sort_order,metadata,status,created_by
        ) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,2026,$6,'normal',$7::date,$8::date,
          TIMESTAMPTZ '2026-01-01T00:00:00Z',$9::uuid,$6,$10::jsonb,'open',$9::uuid)
        ON CONFLICT(tenant_id,company_code_id,code) DO UPDATE SET
          name=EXCLUDED.name,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,
          metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
      `, [deterministicUuid("neon", tenantCode, "finance-baseline", "period", company.code, code),
        tenantId, companyId, code, `${company.name} ${code}`, period, startDate, endDate, actorId,
        JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: company.readinessProfile }))]);
    }
  }
}

export async function upsertChildScope(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  scopeKind: "legal_entity" | "network_account",
  scopeKey: string,
  targetId: string,
  name: string,
  actorId: string,
): Promise<void> {
  const root = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='tenant'",
    [tenantId]);
  const existing = await client.query<{ id: string }>(`
    SELECT id::text AS id FROM authz.scope_target
    WHERE tenant_id=$1::uuid AND scope_kind=$2 AND target_id=$3::uuid
  `, [tenantId, scopeKind, targetId]);
  if (existing.rows.length > 1) throw new Error(`duplicate ${plane} resource scope: ${scopeKind}/${targetId}`);
  if (existing.rows[0]) {
    await client.query(`
      UPDATE authz.scope_target
      SET display_name=$2,status='active',metadata=metadata || $3::jsonb,updated_by=$4::uuid
      WHERE id=$1::uuid
        AND (display_name IS DISTINCT FROM $2 OR status IS DISTINCT FROM 'active' OR metadata IS DISTINCT FROM metadata || $3::jsonb)
    `, [existing.rows[0].id, name,
      JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: scopeKey })), actorId]);
    return;
  }
  await client.query(`
    INSERT INTO authz.scope_target (
      id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,
      display_name,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,'active',$8::jsonb,$9::uuid)
    ON CONFLICT (tenant_id,scope_kind,scope_key) DO UPDATE SET
      display_name=EXCLUDED.display_name,status='active',metadata=EXCLUDED.metadata,
      updated_by=EXCLUDED.created_by
    WHERE (authz.scope_target.display_name,authz.scope_target.status,authz.scope_target.metadata)
      IS DISTINCT FROM (EXCLUDED.display_name,'active'::authz.scope_status_d,EXCLUDED.metadata)
  `, [databaseManagedScopeUuid(tenantId, scopeKind, targetId), tenantId,
    scopeKind, scopeKey, targetId, root.id, name,
    JSON.stringify(seedMetadata(inputs, plane)), actorId]);
}


function seedMetadata(
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ...extra,
    _seed: {
      source: SOURCE_REF,
      manifestVersion: inputs.manifest.manifestVersion,
      manifestSha256: inputs.manifestSha256,
      plane,
    },
  };
}

async function one<Row extends object>(
  client: QueryClient,
  text: string,
  values: unknown[],
): Promise<Row> {
  const result = await client.query<Row>(text, values);
  if (result.rows.length !== 1) throw new Error(`expected one row, found ${result.rows.length}`);
  return result.rows[0]!;
}
