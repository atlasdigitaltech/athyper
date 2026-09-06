import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ExperienceCatalogRecord, ExperienceFeatureRecord, ExperienceIdentityRecord, ExperienceLocalePolicyRecord, ExperienceNetworkAccountRecord, ExperienceOperatingOrganizationRecord, ExperiencePlaneRepository, ExperienceProfileRecord, ExperienceSurfaceProjectionRecord, ExperienceSurfaceReleaseRecord, ExperienceWorkContextRecord, PersonalSurfaceArrangementRecord, RouteSlugRedirectRecord } from "@athyper/server-platform-experience/ports";
import { sql, type Kysely } from "kysely";

type Database = Kysely<Record<string, never>>;
export type ExperienceDatabaseRunner = <Result>(
  context: VerifiedRequestContext,
  work: (database: Database) => Promise<Result>,
) => Promise<Result>;

/** DDL-native experience persistence. The supplied database must be the exact physical plane selected by the host. */
export class KyselyExperiencePlaneRepository implements ExperiencePlaneRepository {
  constructor(private readonly database: Database, private readonly runner?: ExperienceDatabaseRunner) {}

  private withContext<Result>(context: VerifiedRequestContext, work: (database: Database) => Promise<Result>): Promise<Result> {
    return this.runner ? this.runner(context, work) : work(this.database);
  }

  async readIdentity(context: VerifiedRequestContext, at: Date): Promise<ExperienceIdentityRecord | undefined> {
    return this.withContext(context, async (database) => {
    const result = await sql<{
      tenantCode: string; tenantDisplayName: string; tenantCountryCode:string|null;tenantLogoAssetRef:string|null;
      tenantStatus: string; tenantRealmKey: string; subscriptionPlanId: string | null; tenantRevision: string;
      principalCode: string; principalDisplayName: string; principalSecondaryLabel: string | null;
      principalStatus: string; principalAuthEpoch: number; principalRevision: string; identityBindingActive: boolean;
      membershipActive: boolean; membershipRevision: string | null;
    }>`
      SELECT t.code AS "tenantCode", COALESCE(NULLIF(btrim(t.display_name),''), t.name, t.code) AS "tenantDisplayName",
             tp.country_code::text AS "tenantCountryCode",tp.logo_asset_ref AS "tenantLogoAssetRef",
             t.status::text AS "tenantStatus", t.realm_key AS "tenantRealmKey",
             t.subscription_plan_id::text AS "subscriptionPlanId", concat_ws(':',COALESCE(t.updated_at,t.created_at)::text,COALESCE(tp.updated_at,tp.created_at)::text) AS "tenantRevision",
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
      LEFT JOIN master.tenant_profile tp ON tp.tenant_id=t.id
      JOIN master.principal p ON p.tenant_id = t.id AND p.id = ${context.principalId}::uuid
      LEFT JOIN master.principal_profile pp ON pp.tenant_id=p.tenant_id AND pp.principal_id=p.id
      WHERE t.id = ${context.tenantId}::uuid
      LIMIT 1
    `.execute(database);
    const row = result.rows[0];
    if (!row) return undefined;
    return { tenantCode: row.tenantCode, tenantDisplayName: row.tenantDisplayName, ...(row.tenantCountryCode?{tenantCountryCode:row.tenantCountryCode.trim().toUpperCase()}:{}),...(row.tenantLogoAssetRef?{tenantLogoAssetRef:row.tenantLogoAssetRef}:{}),tenantStatus: row.tenantStatus, tenantRealmKey: row.tenantRealmKey, ...(row.subscriptionPlanId ? { subscriptionPlanId: row.subscriptionPlanId } : {}), tenantRevision: row.tenantRevision, principalCode: row.principalCode, principalDisplayName: row.principalDisplayName, ...(row.principalSecondaryLabel ? { principalSecondaryLabel: row.principalSecondaryLabel } : {}), principalStatus: row.principalStatus, principalAuthEpoch: row.principalAuthEpoch, principalRevision: row.principalRevision, identityBindingActive: row.identityBindingActive, membershipActive: row.membershipActive, ...(row.membershipRevision ? { membershipRevision: row.membershipRevision } : {}) };
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
      sql<{ workspaceCode: string; workspaceName: string; workspaceIconKey: string | null; workspaceSortOrder: number; workspaceSharedInfrastructure: boolean; moduleId: string; moduleCode: string; moduleName: string; moduleIconKey: string | null; moduleSortOrder: number; primary: boolean; revision: string }>`
        SELECT w.code AS "workspaceCode", w.name AS "workspaceName", w.icon_key AS "workspaceIconKey", w.sort_order AS "workspaceSortOrder", w.is_shared_infrastructure AS "workspaceSharedInfrastructure",
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
        FROM authz.permission p WHERE p.status = 'published' ORDER BY p.canonical_code
      `.execute(database),
    ]);
    const plan = planResult.rows[0];
    if (!plan) return undefined;
    return {
      planActive: plan.active, planRevision: plan.revision,
      associations: associationResult.rows.map((row) => ({ workspaceCode: row.workspaceCode, workspaceName: row.workspaceName, ...(row.workspaceIconKey ? { workspaceIconKey: row.workspaceIconKey } : {}), workspaceSortOrder: row.workspaceSortOrder, workspaceSharedInfrastructure: row.workspaceSharedInfrastructure, moduleId: row.moduleId, moduleCode: row.moduleCode, moduleName: row.moduleName, ...(row.moduleIconKey ? { moduleIconKey: row.moduleIconKey } : {}), moduleSortOrder: row.moduleSortOrder, primary: row.primary, revision: row.revision })),
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
    const result = await sql<{ companyCodeId:string; companyCode:string; companyDisplayName:string; legalEntityId:string; legalEntityCode:string; legalEntityName:string; logoAssetRef:string|null;countryCode:string|null; functionalCurrency:string; revision:string }>`
      SELECT c.id::text AS "companyCodeId", c.code AS "companyCode", COALESCE(NULLIF(btrim(c.display_name),''),c.name,c.code) AS "companyDisplayName",
             le.id::text AS "legalEntityId", le.code AS "legalEntityCode", COALESCE(NULLIF(btrim(le.display_name),''),le.name,le.code) AS "legalEntityName",le.logo_asset_ref AS "logoAssetRef",
             COALESCE(c.country_code,le.registration_country_code)::text AS "countryCode", c.functional_currency::text AS "functionalCurrency",
             concat_ws(':',COALESCE(c.updated_at,c.created_at)::text,COALESCE(le.updated_at,le.created_at)::text) AS revision
      FROM master.company_code c JOIN master.legal_entity le ON le.tenant_id=c.tenant_id AND le.id=c.legal_entity_id AND le.status='active'
      WHERE c.tenant_id=${context.tenantId}::uuid AND c.status='active' ORDER BY c.code,c.id
    `.execute(database);
    return result.rows.map((row)=>({ companyCodeId:row.companyCodeId,companyCode:row.companyCode,companyDisplayName:row.companyDisplayName,legalEntityId:row.legalEntityId,legalEntityCode:row.legalEntityCode,legalEntityName:row.legalEntityName,...(row.logoAssetRef?{logoAssetRef:row.logoAssetRef}:{}),...(row.countryCode?{countryCode:row.countryCode.trim().toUpperCase()}:{}),functionalCurrency:row.functionalCurrency.trim(),revision:row.revision }));
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

  async readNetworkAccounts(context: VerifiedRequestContext): Promise<readonly ExperienceNetworkAccountRecord[]> {
    if (context.planeKey !== "mesh") return [];
    return this.withContext(context, async (database) => {
      const result = await sql<{
        id:string;code:string;displayName:string;legalName:string|null;role:"buyer"|"supplier"|"both";
        countryCode:string|null;defaultCurrency:string|null;logoAssetRef:string|null;canonicalPartyId:string|null;fromNeon:boolean;revision:string;
      }>`
        SELECT account.id::text AS id, account.account_code AS code,
               account.display_name AS "displayName", account.legal_name AS "legalName",
               account.network_role::text AS role, account.country_code::text AS "countryCode",
               account.default_currency::text AS "defaultCurrency",account.logo_asset_ref AS "logoAssetRef",
               account.canonical_party_id::text AS "canonicalPartyId",
               (account.network_role='buyer' OR EXISTS (
                 SELECT 1 FROM mesh.network_account_reference reference
                  WHERE reference.tenant_id=account.tenant_id
                    AND reference.network_account_id=account.id
                    AND reference.status='active'
                    AND lower(reference.source_system) LIKE '%neon%'
               )) AS "fromNeon",
               COALESCE(account.updated_at,account.created_at)::text AS revision
          FROM mesh.network_account account
         WHERE account.tenant_id=${context.tenantId}::uuid AND account.status='active'
         ORDER BY account.network_role,account.display_name,account.account_code
      `.execute(database);
      return Object.freeze(result.rows.map((row)=>Object.freeze({id:row.id,code:row.code,displayName:row.displayName,...(row.legalName?{legalName:row.legalName}:{}),role:row.role,...(row.countryCode?{countryCode:row.countryCode.trim().toUpperCase()}:{}),...(row.defaultCurrency?{defaultCurrency:row.defaultCurrency.trim().toUpperCase()}:{}),...(row.logoAssetRef?{logoAssetRef:row.logoAssetRef}:{}),...(row.canonicalPartyId?{canonicalPartyId:row.canonicalPartyId}:{}),source:row.fromNeon?"neon_projection" as const:"mesh" as const,revision:row.revision})));
    });
  }

  async readLocalePolicy(context: VerifiedRequestContext): Promise<ExperienceLocalePolicyRecord> {
    return this.withContext(context, (database) => readTenantLocalePolicy(database, context));
  }

  async updateLocalePolicy(context: VerifiedRequestContext, policy: Omit<ExperienceLocalePolicyRecord,"revision">): Promise<ExperienceLocalePolicyRecord> {
    return this.withContext(context, async (database) => {
      const write = async (transaction: Database) => {
        const governance = Object.fromEntries((policy.catalogs ?? []).map(({localeCode, ...catalog}) => [localeCode, catalog]));
        // This upsert also locks the tenant profile, serializing concurrent policy replacements.
        // Catalog review choices belong to this tenant; never mutate the shared plane catalog.
        await sql`
          INSERT INTO master.tenant_profile(tenant_id,enabled_locale_codes,default_locale_code,fallback_locale_code,locale_catalog_governance,created_by)
          VALUES(${context.tenantId}::uuid,${policy.enabledLocales}::text[],${policy.defaultLocale},${policy.fallbackLocale},${JSON.stringify(governance)}::jsonb,${context.principalId}::uuid)
          ON CONFLICT ON CONSTRAINT tenant_profile_tenant_uq DO UPDATE
          SET enabled_locale_codes=EXCLUDED.enabled_locale_codes,default_locale_code=EXCLUDED.default_locale_code,
              fallback_locale_code=EXCLUDED.fallback_locale_code,locale_catalog_governance=EXCLUDED.locale_catalog_governance,
              updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid`.execute(transaction);
        // Separate statements are required: PostgreSQL cannot update the same row twice in a CTE.
        // Clear the partial unique-index choices before assigning the replacement default.
        await sql`
          UPDATE master.tenant_locale_activation
             SET is_default=false,is_fallback=false,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid
           WHERE tenant_id=${context.tenantId}::uuid AND (is_default OR is_fallback)`.execute(transaction);
        await sql`
          INSERT INTO master.tenant_locale_activation(tenant_id,locale_code,enabled,is_default,is_fallback,created_by)
          SELECT ${context.tenantId}::uuid,catalog.locale_code,
                 catalog.locale_code=ANY(${policy.enabledLocales}::text[]),
                 catalog.locale_code=${policy.defaultLocale},catalog.locale_code=${policy.fallbackLocale},
                 ${context.principalId}::uuid
            FROM control.ui_locale_catalog catalog
          ON CONFLICT (tenant_id,locale_code) DO UPDATE
          SET enabled=EXCLUDED.enabled,is_default=EXCLUDED.is_default,is_fallback=EXCLUDED.is_fallback,
              updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid`.execute(transaction);
        return readTenantLocalePolicy(transaction, context);
      };
      return database.isTransaction ? write(database) : database.transaction().execute(write);
    });
  }

  async updatePrincipalLocale(context: VerifiedRequestContext, localeCode: string): Promise<void> {
    await this.withContext(context, async (database) => { await sql`
      INSERT INTO master.principal_ui_profile(tenant_id,principal_id,locale_code,language_code,created_by)
      VALUES(${context.tenantId}::uuid,${context.principalId}::uuid,${localeCode},${new Intl.Locale(localeCode).language},${context.principalId}::uuid)
      ON CONFLICT ON CONSTRAINT principal_ui_profile_tenant_principal_uq DO UPDATE SET locale_code=EXCLUDED.locale_code,language_code=EXCLUDED.language_code,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid`.execute(database); });
  }

  async saveSurfaceDraft(context: VerifiedRequestContext, input: Readonly<{ targetPlane: "studio" | "neon" | "mesh"; surfaceKey: string; layer: "shared" | "tenant"; definition: Readonly<Record<string, unknown>>; contentHash: string; source: "human" | "atlas"; expectedContentHash?: string }>): Promise<ExperienceSurfaceReleaseRecord> {
    return this.withContext(context, async (database) => {
      const existing = await sql<{ id: string; revision: number; contentHash:string }>`SELECT id::text AS id,revision::int AS revision,content_hash AS "contentHash" FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${input.targetPlane} AND surface_key=${input.surfaceKey} AND layer=${input.layer} AND status='draft' FOR UPDATE`.execute(database);
      const current = existing.rows[0];
      if(current&&input.expectedContentHash!==undefined&&current.contentHash!==input.expectedContentHash)throw Object.assign(new Error("Surface draft changed after it was loaded"),{code:"EXPERIENCE_SURFACE_DRAFT_CONFLICT"});
      const revision=current?.revision??(await sql<{revision:number}>`SELECT COALESCE(MAX(revision),0)::int+1 AS revision FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${input.targetPlane} AND surface_key=${input.surfaceKey} AND layer=${input.layer}`.execute(database)).rows[0]!.revision;
      const definition={...input.definition,revision},contentHash=createHash("sha256").update(JSON.stringify(definition)).digest("hex");
      const result = current
        ? await sql<SurfaceReleaseRow>`UPDATE control.experience_surface_release SET definition=${JSON.stringify(definition)}::jsonb,content_hash=${contentHash},source=${input.source},validation_report='{"valid":true,"issues":[]}'::jsonb,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND id=${current.id}::uuid RETURNING id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt"`.execute(database)
        : await sql<SurfaceReleaseRow>`INSERT INTO control.experience_surface_release(tenant_id,target_plane,surface_key,layer,revision,status,definition,content_hash,source,created_by) VALUES(${context.tenantId}::uuid,${input.targetPlane},${input.surfaceKey},${input.layer},${revision},'draft',${JSON.stringify(definition)}::jsonb,${contentHash},${input.source},${context.principalId}::uuid) RETURNING id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt"`.execute(database);
      return surfaceRelease(result.rows[0]!);
    });
  }

  async listSurfaceReleases(context:VerifiedRequestContext,input:Readonly<{targetPlane:"studio"|"neon"|"mesh";surfaceKey:string}>):Promise<readonly ExperienceSurfaceReleaseRecord[]>{return this.withContext(context,async(database)=>(await sql<SurfaceReleaseRow>`SELECT id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt" FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${input.targetPlane} AND surface_key=${input.surfaceKey} ORDER BY revision DESC,created_at DESC LIMIT 50`.execute(database)).rows.map(surfaceRelease));}

  async rollbackSurfaceRelease(context:VerifiedRequestContext,releaseId:string):Promise<ExperienceSurfaceReleaseRecord|undefined>{return this.withContext(context,async(database)=>{const selected=(await sql<SurfaceReleaseRow>`SELECT id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt" FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND id=${releaseId}::uuid LIMIT 1`.execute(database)).rows[0];if(!selected)return undefined;await sql`UPDATE control.experience_surface_release SET status='retired',updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${selected.targetPlane} AND surface_key=${selected.surfaceKey} AND layer=${selected.layer} AND status='draft'`.execute(database);const revision=(await sql<{revision:number}>`SELECT COALESCE(MAX(revision),0)::int+1 AS revision FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${selected.targetPlane} AND surface_key=${selected.surfaceKey} AND layer=${selected.layer}`.execute(database)).rows[0]!.revision;const definition={...selected.definition,revision};const contentHash=createHash("sha256").update(JSON.stringify(definition)).digest("hex");const row=(await sql<SurfaceReleaseRow>`INSERT INTO control.experience_surface_release(tenant_id,target_plane,surface_key,layer,revision,status,definition,content_hash,source,created_by) VALUES(${context.tenantId}::uuid,${selected.targetPlane},${selected.surfaceKey},${selected.layer},${revision},'draft',${JSON.stringify(definition)}::jsonb,${contentHash},'human',${context.principalId}::uuid) RETURNING id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt"`.execute(database)).rows[0]!;return surfaceRelease(row);});}

  async publishSurfaceRelease(context: VerifiedRequestContext, releaseId: string): Promise<ExperienceSurfaceReleaseRecord | undefined> {
    return this.withContext(context, async (database) => {
      const selected = await sql<SurfaceReleaseRow>`SELECT id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt" FROM control.experience_surface_release WHERE tenant_id=${context.tenantId}::uuid AND id=${releaseId}::uuid FOR UPDATE`.execute(database);
      const release = selected.rows[0];
      if (!release) return undefined;
      if (release.status === "published") return surfaceRelease(release);
      if (release.status !== "draft") return undefined;
      await sql`UPDATE control.experience_surface_release SET status='retired',updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${release.targetPlane} AND surface_key=${release.surfaceKey} AND layer=${release.layer} AND status='published'`.execute(database);
      const published = await sql<SurfaceReleaseRow>`UPDATE control.experience_surface_release SET status='published',published_at=clock_timestamp(),published_by=${context.principalId}::uuid,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND id=${releaseId}::uuid RETURNING id::text AS id,target_plane AS "targetPlane",surface_key AS "surfaceKey",layer,revision::int,status,definition,content_hash AS "contentHash",source,published_at::text AS "publishedAt"`.execute(database);
      return surfaceRelease(published.rows[0]!);
    });
  }

  async applySurfaceProjection(context: VerifiedRequestContext, release: ExperienceSurfaceReleaseRecord): Promise<void> {
    await this.withContext(context, async (database) => {
      const already = await sql<{ present: boolean }>`SELECT EXISTS(SELECT 1 FROM runtime_meta.experience_surface_projection WHERE tenant_id=${context.tenantId}::uuid AND source_release_id=${release.id}::uuid AND status='active') AS present`.execute(database);
      if (already.rows[0]?.present) return;
      await sql`UPDATE runtime_meta.experience_surface_projection SET status='retired',retired_at=clock_timestamp(),retired_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND surface_key=${release.surfaceKey} AND layer=${release.layer} AND status='active'`.execute(database);
      await sql`INSERT INTO runtime_meta.experience_surface_projection(tenant_id,plane_code,surface_key,layer,source_release_id,source_revision,definition,content_hash,applied_by) VALUES(${context.tenantId}::uuid,${context.planeKey},${release.surfaceKey},${release.layer},${release.id}::uuid,${release.revision},${JSON.stringify(release.definition)}::jsonb,${release.contentHash},${context.principalId}::uuid) ON CONFLICT(tenant_id,source_release_id) DO NOTHING`.execute(database);
    });
  }

  async readSurfaceProjections(context: VerifiedRequestContext, surfaceKey: string): Promise<readonly ExperienceSurfaceProjectionRecord[]> {
    return this.withContext(context, async (database) => (await sql<{ surfaceKey: string; layer: "shared" | "tenant"; sourceReleaseId: string; sourceRevision: number; definition: Record<string, unknown>; contentHash: string }>`SELECT surface_key AS "surfaceKey",layer,source_release_id::text AS "sourceReleaseId",source_revision::int AS "sourceRevision",definition,content_hash AS "contentHash" FROM runtime_meta.experience_surface_projection WHERE tenant_id=${context.tenantId}::uuid AND plane_code=${context.planeKey} AND surface_key=${surfaceKey} AND status='active' ORDER BY CASE layer WHEN 'shared' THEN 1 ELSE 2 END`.execute(database)).rows);
  }

  async readPersonalSurfaceArrangement(context: VerifiedRequestContext, surfaceKey: string): Promise<PersonalSurfaceArrangementRecord | undefined> {
    return this.withContext(context, async (database) => (await sql<PersonalSurfaceArrangementRecord>`SELECT surface_key AS "surfaceKey",base_revision::int AS "baseRevision",arrangement FROM master.principal_surface_arrangement WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND plane_code=${context.planeKey} AND surface_key=${surfaceKey} LIMIT 1`.execute(database)).rows[0]);
  }

  async savePersonalSurfaceArrangement(context: VerifiedRequestContext, input: PersonalSurfaceArrangementRecord): Promise<PersonalSurfaceArrangementRecord> {
    return this.withContext(context, async (database) => {
      const result=await sql<PersonalSurfaceArrangementRecord>`INSERT INTO master.principal_surface_arrangement(tenant_id,principal_id,plane_code,surface_key,base_revision,arrangement,created_by) VALUES(${context.tenantId}::uuid,${context.principalId}::uuid,${context.planeKey},${input.surfaceKey},${input.baseRevision},${JSON.stringify(input.arrangement)}::jsonb,${context.principalId}::uuid) ON CONFLICT(tenant_id,principal_id,plane_code,surface_key) DO UPDATE SET base_revision=EXCLUDED.base_revision,arrangement=EXCLUDED.arrangement,updated_at=clock_timestamp(),updated_by=EXCLUDED.created_by RETURNING surface_key AS "surfaceKey",base_revision::int AS "baseRevision",arrangement`.execute(database);
      return result.rows[0]!;
    });
  }

  async deletePersonalSurfaceArrangement(context: VerifiedRequestContext, surfaceKey: string): Promise<void> {
    await this.withContext(context, async (database) => { await sql`DELETE FROM master.principal_surface_arrangement WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND plane_code=${context.planeKey} AND surface_key=${surfaceKey}`.execute(database); });
  }

  async readRouteSlugRedirect(context: VerifiedRequestContext, sourcePath: string, at: Date): Promise<RouteSlugRedirectRecord | undefined> {
    return this.withContext(context, async (database) => (await sql<RouteSlugRedirectRecord>`SELECT source_path AS "sourcePath",target_path AS "targetPath",redirect_status AS "redirectStatus" FROM control.route_slug_history WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${context.planeKey} AND source_path=${sourcePath} AND status='active' AND effective_from<=${at} AND (effective_until IS NULL OR effective_until>${at}) LIMIT 1`.execute(database)).rows[0]);
  }

  async registerRouteSlugRedirect(context: VerifiedRequestContext, input: Readonly<{ catalogKind: "workspace" | "module" | "entity"; catalogCode: string; sourcePath: string; targetPath: string; redirectStatus: 301 | 308; sourceReleaseId: string }>): Promise<RouteSlugRedirectRecord> {
    return this.withContext(context, async (database) => {
      const reverse = await sql<{ present:boolean }>`SELECT EXISTS(SELECT 1 FROM control.route_slug_history WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${context.planeKey} AND source_path=${input.targetPath} AND target_path=${input.sourcePath} AND status='active') AS present`.execute(database);
      if(reverse.rows[0]?.present)throw Object.assign(new Error("Route redirect would create a loop"),{code:"EXPERIENCE_ROUTE_REDIRECT_LOOP"});
      await sql`UPDATE control.route_slug_history SET status='retired',effective_until=clock_timestamp() WHERE tenant_id=${context.tenantId}::uuid AND target_plane=${context.planeKey} AND source_path=${input.sourcePath} AND status='active'`.execute(database);
      const result=await sql<RouteSlugRedirectRecord>`INSERT INTO control.route_slug_history(tenant_id,target_plane,catalog_kind,catalog_code,source_path,target_path,redirect_status,source_release_id,created_by) VALUES(${context.tenantId}::uuid,${context.planeKey},${input.catalogKind},${input.catalogCode},${input.sourcePath},${input.targetPath},${input.redirectStatus},${input.sourceReleaseId}::uuid,${context.principalId}::uuid) RETURNING source_path AS "sourcePath",target_path AS "targetPath",redirect_status AS "redirectStatus"`.execute(database);
      return result.rows[0]!;
    });
  }
}

interface SurfaceReleaseRow { readonly id: string; readonly targetPlane: "studio" | "neon" | "mesh"; readonly surfaceKey: string; readonly layer: "shared" | "tenant"; readonly revision: number; readonly status: "draft" | "published" | "retired"; readonly definition: Record<string, unknown>; readonly contentHash: string; readonly source: "human" | "atlas"; readonly publishedAt: string | null; }
function surfaceRelease(row: SurfaceReleaseRow): ExperienceSurfaceReleaseRecord { return Object.freeze({ id: row.id,targetPlane:row.targetPlane,surfaceKey:row.surfaceKey,layer:row.layer,revision:row.revision,status:row.status,definition:Object.freeze(row.definition),contentHash:row.contentHash,source:row.source,...(row.publishedAt?{publishedAt:row.publishedAt}:{}) }); }

/** Read governance and activation from one MVCC snapshot, including tenant-specific review gates. */
async function readTenantLocalePolicy(database: Database, context: VerifiedRequestContext): Promise<ExperienceLocalePolicyRecord> {
  const result = await sql<{
    catalogs: NonNullable<ExperienceLocalePolicyRecord["catalogs"]>;
    activations: {localeCode:string;enabled:boolean;isDefault:boolean;isFallback:boolean}[];
    revision: string;
  }>`
    SELECT
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'localeCode',catalog.locale_code,
        'status',catalog.status,'coveragePct',catalog.coverage_pct,
        'linguisticReviewPassed',catalog.linguistic_review_passed,
        'layoutReviewPassed',catalog.layout_review_passed,
        'automatedTestsPassed',catalog.automated_tests_passed
      ) || COALESCE(profile.locale_catalog_governance->catalog.locale_code,'{}'::jsonb)
      ORDER BY catalog.rollout_wave,catalog.locale_code),'[]'::jsonb)
       FROM control.ui_locale_catalog catalog) AS catalogs,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'localeCode',activation.locale_code,'enabled',activation.enabled,
        'isDefault',activation.is_default,'isFallback',activation.is_fallback
      ) ORDER BY activation.locale_code),'[]'::jsonb)
       FROM master.tenant_locale_activation activation WHERE activation.tenant_id=${context.tenantId}::uuid) AS activations,
      concat_ws(':',COALESCE(profile.updated_at,profile.created_at)::text,
        (SELECT MAX(COALESCE(updated_at,created_at))::text FROM control.ui_locale_catalog),
        (SELECT MAX(COALESCE(updated_at,created_at))::text FROM master.tenant_locale_activation WHERE tenant_id=${context.tenantId}::uuid)) AS revision
    FROM (SELECT 1) singleton
    LEFT JOIN master.tenant_profile profile ON profile.tenant_id=${context.tenantId}::uuid
  `.execute(database);
  const row = result.rows[0]!;
  return {
    catalogs: row.catalogs,
    enabledLocales: row.activations.filter((activation) => activation.enabled).map((activation) => activation.localeCode),
    defaultLocale: row.activations.find((activation) => activation.isDefault)?.localeCode ?? "en",
    fallbackLocale: row.activations.find((activation) => activation.isFallback)?.localeCode ?? "en",
    revision: row.revision || "locale-policy:default",
  };
}
