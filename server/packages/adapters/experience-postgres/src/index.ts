import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ExperienceCatalogRecord, ExperienceFeatureRecord, ExperienceIdentityRecord, ExperienceOperatingOrganizationRecord, ExperiencePlaneRepository, ExperienceProfileRecord, ExperienceWorkContextRecord } from "@athyper/server-platform-experience/ports";
import { sql, type Kysely } from "kysely";

type Database = Kysely<Record<string, never>>;
export type ExperienceDatabaseRunner = <Result>(
  context: VerifiedRequestContext,
  work: (database: Database) => Promise<Result>,
) => Promise<Result>;

/** DDL-native, read-only projection. The supplied database must be the exact physical plane selected by the host. */
export class KyselyExperiencePlaneRepository implements ExperiencePlaneRepository {
  constructor(private readonly database: Database, private readonly runner?: ExperienceDatabaseRunner) {}

  private withContext<Result>(context: VerifiedRequestContext, work: (database: Database) => Promise<Result>): Promise<Result> {
    return this.runner ? this.runner(context, work) : work(this.database);
  }

  async readIdentity(context: VerifiedRequestContext, at: Date): Promise<ExperienceIdentityRecord | undefined> {
    return this.withContext(context, async (database) => {
    const result = await sql<{
      tenantCode: string; tenantDisplayName: string;
      tenantStatus: string; tenantRealmKey: string; subscriptionPlanId: string | null; tenantRevision: string;
      principalCode: string; principalDisplayName: string; principalSecondaryLabel: string | null;
      principalStatus: string; principalAuthEpoch: number; principalRevision: string; identityBindingActive: boolean;
      membershipActive: boolean; membershipRevision: string | null;
    }>`
      SELECT t.code AS "tenantCode", COALESCE(NULLIF(btrim(t.display_name),''), t.name, t.code) AS "tenantDisplayName",
             t.status::text AS "tenantStatus", t.realm_key AS "tenantRealmKey",
             t.subscription_plan_id::text AS "subscriptionPlanId", COALESCE(t.updated_at, t.created_at)::text AS "tenantRevision",
             p.code AS "principalCode", COALESCE(NULLIF(btrim(pp.display_name),''), NULLIF(btrim(pp.preferred_name),''), p.name, p.code) AS "principalDisplayName",
             (SELECT NULLIF(btrim(b.username),'') FROM master.principal_identity_binding b WHERE b.tenant_id=t.id AND b.principal_id=p.id AND b.realm_key=${context.realmKey} AND b.status='active' ORDER BY b.is_primary DESC, b.created_at LIMIT 1) AS "principalSecondaryLabel",
             p.status::text AS "principalStatus", p.auth_epoch AS "principalAuthEpoch",
             COALESCE(p.updated_at, p.created_at)::text AS "principalRevision",
             EXISTS (
               SELECT 1 FROM master.principal_identity_binding b
               WHERE b.tenant_id = t.id AND b.principal_id = p.id AND b.realm_key = ${context.realmKey} AND b.status = 'active'
             ) AS "identityBindingActive",
             EXISTS (
               SELECT 1 FROM authz.plane_membership pm
               WHERE pm.tenant_id = t.id AND pm.principal_id = p.id AND pm.status = 'active'
                 AND pm.effective_from <= ${at} AND (pm.effective_until IS NULL OR pm.effective_until > ${at})
             ) AS "membershipActive",
             (SELECT COALESCE(pm.updated_at, pm.created_at)::text FROM authz.plane_membership pm
               WHERE pm.tenant_id = t.id AND pm.principal_id = p.id AND pm.status = 'active'
                 AND pm.effective_from <= ${at} AND (pm.effective_until IS NULL OR pm.effective_until > ${at})
               ORDER BY COALESCE(pm.updated_at, pm.created_at) DESC LIMIT 1) AS "membershipRevision"
      FROM master.tenant t
      JOIN master.principal p ON p.tenant_id = t.id AND p.id = ${context.principalId}::uuid
      LEFT JOIN master.principal_profile pp ON pp.tenant_id=p.tenant_id AND pp.principal_id=p.id
      WHERE t.id = ${context.tenantId}::uuid
      LIMIT 1
    `.execute(database);
    const row = result.rows[0];
    if (!row) return undefined;
    return { tenantCode: row.tenantCode, tenantDisplayName: row.tenantDisplayName, tenantStatus: row.tenantStatus, tenantRealmKey: row.tenantRealmKey, ...(row.subscriptionPlanId ? { subscriptionPlanId: row.subscriptionPlanId } : {}), tenantRevision: row.tenantRevision, principalCode: row.principalCode, principalDisplayName: row.principalDisplayName, ...(row.principalSecondaryLabel ? { principalSecondaryLabel: row.principalSecondaryLabel } : {}), principalStatus: row.principalStatus, principalAuthEpoch: row.principalAuthEpoch, principalRevision: row.principalRevision, identityBindingActive: row.identityBindingActive, membershipActive: row.membershipActive, ...(row.membershipRevision ? { membershipRevision: row.membershipRevision } : {}) };
    });
  }

  async readProfile(context: VerifiedRequestContext): Promise<ExperienceProfileRecord> {
    return this.withContext(context, async (database) => {
    const result = await sql<{ tenant: Record<string, unknown> | null; principal: Record<string, unknown> | null; revision: string }>`
      SELECT CASE WHEN tp.id IS NULL THEN NULL ELSE jsonb_build_object(
               'localeCode', tp.locale_code, 'languageCode', tp.language_code, 'timezoneCode', tp.timezone_code,
               'dateFormat', tp.date_format, 'numberFormat', tp.number_format, 'weekStart', tp.week_start, 'weekendDays', tp.weekend_days) END AS tenant,
             CASE WHEN up.id IS NULL THEN NULL ELSE jsonb_build_object(
               'localeCode', up.locale_code, 'languageCode', up.language_code, 'timezoneCode', up.timezone_code,
               'dateFormat', up.date_format, 'numberFormat', up.number_format, 'weekStart', up.week_start,
               'appearanceMode', up.appearance_mode, 'densityCode', up.density_code) END AS principal,
             concat_ws(':', COALESCE(tp.updated_at, tp.created_at)::text, COALESCE(up.updated_at, up.created_at)::text) AS revision
      FROM master.tenant t
      LEFT JOIN master.tenant_profile tp ON tp.tenant_id = t.id
      LEFT JOIN master.principal_ui_profile up ON up.tenant_id = t.id AND up.principal_id = ${context.principalId}::uuid
      WHERE t.id = ${context.tenantId}::uuid
      LIMIT 1
    `.execute(database);
    const row = result.rows[0];
    return { ...(row?.tenant ? { tenant: row.tenant } : {}), ...(row?.principal ? { principal: row.principal } : {}), revision: row?.revision ?? "profile:missing" };
    });
  }

  async readCatalog(context: VerifiedRequestContext, subscriptionPlanId: string): Promise<ExperienceCatalogRecord | undefined> {
    return this.withContext(context, async (database) => {
    const [planResult, associationResult, permissionResult] = await Promise.all([
      sql<{ active: boolean; revision: string }>`SELECT is_active AS active, COALESCE(updated_at, created_at)::text AS revision FROM control.subscription_plan WHERE id = ${subscriptionPlanId}::uuid LIMIT 1`.execute(database),
      sql<{ workspaceCode: string; workspaceName: string; workspaceIconKey: string | null; workspaceSortOrder: number; moduleId: string; moduleCode: string; moduleName: string; moduleIconKey: string | null; moduleSortOrder: number; primary: boolean; revision: string }>`
        SELECT w.code AS "workspaceCode", w.name AS "workspaceName", w.icon_key AS "workspaceIconKey", w.sort_order AS "workspaceSortOrder",
               m.id::text AS "moduleId", m.code AS "moduleCode", m.name AS "moduleName", m.icon_key AS "moduleIconKey",
               wm.sort_order AS "moduleSortOrder", wm.is_primary AS primary,
               concat_ws(':', COALESCE(spm.updated_at, spm.created_at)::text, COALESCE(w.updated_at, w.created_at)::text, COALESCE(m.updated_at, m.created_at)::text, COALESCE(wm.updated_at, wm.created_at)::text) AS revision
        FROM control.subscription_plan_module spm
        JOIN control.module m ON m.id = spm.module_id AND m.is_active
        JOIN control.workspace_module wm ON wm.module_id = m.id AND wm.is_active
        JOIN control.workspace w ON w.id = wm.workspace_id AND w.is_active
        WHERE spm.subscription_plan_id = ${subscriptionPlanId}::uuid AND spm.is_active AND spm.entitlement_mode = 'included'
        ORDER BY w.sort_order, w.code, wm.sort_order, m.code
      `.execute(database),
      sql<{ code: string; moduleId: string; revision: string }>`
        SELECT p.canonical_code AS code, p.module_id::text AS "moduleId", COALESCE(p.updated_at, p.created_at)::text AS revision
        FROM authz.permission p WHERE p.status = 'active' ORDER BY p.canonical_code
      `.execute(database),
    ]);
    const plan = planResult.rows[0];
    if (!plan) return undefined;
    return {
      planActive: plan.active, planRevision: plan.revision,
      associations: associationResult.rows.map((row) => ({ workspaceCode: row.workspaceCode, workspaceName: row.workspaceName, ...(row.workspaceIconKey ? { workspaceIconKey: row.workspaceIconKey } : {}), workspaceSortOrder: row.workspaceSortOrder, moduleId: row.moduleId, moduleCode: row.moduleCode, moduleName: row.moduleName, ...(row.moduleIconKey ? { moduleIconKey: row.moduleIconKey } : {}), moduleSortOrder: row.moduleSortOrder, primary: row.primary, revision: row.revision })),
      permissions: permissionResult.rows,
    };
    });
  }

  async readFeatures(context: VerifiedRequestContext, at: Date): Promise<readonly ExperienceFeatureRecord[]> {
    return this.withContext(context, async (database) => {
    const result = await sql<{
      id: string; code: string; moduleId: string | null; kind: "release_gate" | "kill_switch" | "experiment";
      defaultEnabled: boolean; rolloutPct: number | null; overrideEnabled: boolean | null; metadata: Record<string, unknown>; revision: string;
    }>`
      SELECT f.id::text AS id, f.code, f.module_id::text AS "moduleId", f.flag_kind AS kind,
             f.default_enabled AS "defaultEnabled", f.rollout_pct AS "rolloutPct", o.is_enabled AS "overrideEnabled",
             f.metadata, concat_ws(':', COALESCE(f.updated_at, f.created_at)::text, COALESCE(o.updated_at, o.created_at)::text) AS revision
      FROM control.feature_flag_catalog f
      LEFT JOIN control.feature_flag_override o ON o.feature_flag_id = f.id AND o.tenant_id = ${context.tenantId}::uuid
        AND o.is_active AND o.effective_from <= ${at} AND (o.effective_until IS NULL OR o.effective_until > ${at})
      WHERE f.is_active AND f.effective_from <= ${at} AND (f.effective_until IS NULL OR f.effective_until > ${at})
      ORDER BY f.code
    `.execute(database);
    return result.rows.map((row) => ({ id: row.id, code: row.code, ...(row.moduleId ? { moduleId: row.moduleId } : {}), kind: row.kind, defaultEnabled: row.defaultEnabled, ...(row.rolloutPct === null ? {} : { rolloutPct: row.rolloutPct }), ...(row.overrideEnabled === null ? {} : { overrideEnabled: row.overrideEnabled }), metadata: row.metadata, revision: row.revision }));
    });
  }

  async readWorkContexts(context: VerifiedRequestContext): Promise<readonly ExperienceWorkContextRecord[]> {
    if (context.planeKey !== "neon") return [];
    return this.withContext(context, async (database) => {
    const result = await sql<{ companyCodeId:string; companyCode:string; companyDisplayName:string; legalEntityId:string; legalEntityCode:string; legalEntityName:string; countryCode:string|null; functionalCurrency:string; revision:string }>`
      SELECT c.id::text AS "companyCodeId", c.code AS "companyCode", COALESCE(NULLIF(btrim(c.display_name),''),c.name,c.code) AS "companyDisplayName",
             le.id::text AS "legalEntityId", le.code AS "legalEntityCode", COALESCE(NULLIF(btrim(le.display_name),''),le.name,le.code) AS "legalEntityName",
             c.country_code::text AS "countryCode", c.functional_currency::text AS "functionalCurrency",
             concat_ws(':',COALESCE(c.updated_at,c.created_at)::text,COALESCE(le.updated_at,le.created_at)::text) AS revision
      FROM master.company_code c JOIN master.legal_entity le ON le.tenant_id=c.tenant_id AND le.id=c.legal_entity_id AND le.status='active'
      WHERE c.tenant_id=${context.tenantId}::uuid AND c.status='active' ORDER BY c.code,c.id
    `.execute(database);
    return result.rows.map((row)=>({ companyCodeId:row.companyCodeId,companyCode:row.companyCode,companyDisplayName:row.companyDisplayName,legalEntityId:row.legalEntityId,legalEntityCode:row.legalEntityCode,legalEntityName:row.legalEntityName,...(row.countryCode?{countryCode:row.countryCode}:{}),functionalCurrency:row.functionalCurrency.trim(),revision:row.revision }));
    });
  }

  async readOperatingOrganizations(context: VerifiedRequestContext, at: Date): Promise<readonly ExperienceOperatingOrganizationRecord[]> {
    if (context.planeKey !== "neon") return [];
    return this.withContext(context, async (database) => {
    const result = await sql<{
      id:string;code:string;displayName:string;domain:string;parentId:string|null;path:string[];
      procurementProfileConfigured:boolean;salesProfileConfigured:boolean;leadCompanyCodeId:string|null;bookingCompanyCodeId:string|null;invoicingCompanyCodeId:string|null;defaultCurrency:string|null;
      companyCodeId:string;participationRole:string;effectiveFrom:string;effectiveUntil:string|null;organizationRevision:string;assignmentRevision:string;
    }>`
      WITH RECURSIVE hierarchy AS (
        SELECT organization.id, organization.parent_operating_organization_id,
               ARRAY[COALESCE(NULLIF(btrim(organization.display_name),''),organization.name,organization.code)]::text[] AS path,
               ARRAY[organization.id]::uuid[] AS visited, 1 AS depth
          FROM master.operating_organization organization
         WHERE organization.tenant_id=${context.tenantId}::uuid
           AND organization.parent_operating_organization_id IS NULL
        UNION ALL
        SELECT child.id, child.parent_operating_organization_id,
               parent.path || COALESCE(NULLIF(btrim(child.display_name),''),child.name,child.code),
               parent.visited || child.id, parent.depth+1
          FROM master.operating_organization child
          JOIN hierarchy parent ON parent.id=child.parent_operating_organization_id
         WHERE child.tenant_id=${context.tenantId}::uuid
           AND parent.depth<12 AND NOT child.id=ANY(parent.visited)
      )
      SELECT organization.id::text AS id,organization.code,
             COALESCE(NULLIF(btrim(organization.display_name),''),organization.name,organization.code) AS "displayName",
             organization.domain::text AS domain,organization.parent_operating_organization_id::text AS "parentId",hierarchy.path,
             (procurement.operating_organization_id IS NOT NULL) AS "procurementProfileConfigured",
             (sales.operating_organization_id IS NOT NULL) AS "salesProfileConfigured",
             procurement.lead_company_code_id::text AS "leadCompanyCodeId",sales.booking_company_code_id::text AS "bookingCompanyCodeId",
             sales.invoicing_company_code_id::text AS "invoicingCompanyCodeId",COALESCE(procurement.default_currency,sales.default_currency)::text AS "defaultCurrency",
             assignment.company_code_id::text AS "companyCodeId",assignment.participation_role AS "participationRole",
             assignment.effective_from::text AS "effectiveFrom",assignment.effective_until::text AS "effectiveUntil",
             concat_ws(':',COALESCE(organization.updated_at,organization.created_at)::text,COALESCE(procurement.updated_at,procurement.created_at)::text,COALESCE(sales.updated_at,sales.created_at)::text) AS "organizationRevision",
             COALESCE(assignment.updated_at,assignment.created_at)::text AS "assignmentRevision"
        FROM hierarchy
        JOIN master.operating_organization organization ON organization.id=hierarchy.id AND organization.tenant_id=${context.tenantId}::uuid AND organization.status='active'
        JOIN master.operating_organization_company_assignment assignment ON assignment.tenant_id=organization.tenant_id AND assignment.operating_organization_id=organization.id AND assignment.status='active'
          AND assignment.effective_from<=${at}::date AND (assignment.effective_until IS NULL OR assignment.effective_until>${at}::date)
        JOIN master.company_code company ON company.tenant_id=assignment.tenant_id AND company.id=assignment.company_code_id AND company.status='active'
        LEFT JOIN master.procurement_organization_profile procurement ON procurement.tenant_id=organization.tenant_id AND procurement.operating_organization_id=organization.id
        LEFT JOIN master.sales_organization_profile sales ON sales.tenant_id=organization.tenant_id AND sales.operating_organization_id=organization.id
       ORDER BY hierarchy.path,organization.code,assignment.participation_role,company.code
    `.execute(database);
    const organizations=new Map<string,ExperienceOperatingOrganizationRecord>();
    for(const row of result.rows){
      const current=organizations.get(row.id);
      const assignment={companyCodeId:row.companyCodeId,participationRole:row.participationRole,effectiveFrom:row.effectiveFrom,...(row.effectiveUntil?{effectiveUntil:row.effectiveUntil}:{}),revision:row.assignmentRevision};
      if(current){organizations.set(row.id,{...current,assignments:Object.freeze([...current.assignments,assignment]),revision:`${current.revision}:${row.assignmentRevision}`});continue;}
      organizations.set(row.id,Object.freeze({id:row.id,code:row.code,displayName:row.displayName,domain:row.domain,...(row.parentId?{parentId:row.parentId}:{}),path:Object.freeze([...row.path]),procurementProfileConfigured:row.procurementProfileConfigured,salesProfileConfigured:row.salesProfileConfigured,...(row.leadCompanyCodeId?{leadCompanyCodeId:row.leadCompanyCodeId}:{}),...(row.bookingCompanyCodeId?{bookingCompanyCodeId:row.bookingCompanyCodeId}:{}),...(row.invoicingCompanyCodeId?{invoicingCompanyCodeId:row.invoicingCompanyCodeId}:{}),...(row.defaultCurrency?{defaultCurrency:row.defaultCurrency.trim()}:{}),assignments:Object.freeze([assignment]),revision:`${row.organizationRevision}:${row.assignmentRevision}`}));
    }
    return Object.freeze([...organizations.values()]);
    });
  }
}
