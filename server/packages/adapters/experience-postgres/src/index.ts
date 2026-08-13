import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ExperienceCatalogRecord, ExperienceFeatureRecord, ExperienceIdentityRecord, ExperiencePlaneRepository, ExperienceProfileRecord } from "@athyper/server-platform-experience/ports";
import { sql, type Kysely } from "kysely";

type Database = Kysely<Record<string, never>>;

/** DDL-native, read-only projection. The supplied database must be the exact physical plane selected by the host. */
export class KyselyExperiencePlaneRepository implements ExperiencePlaneRepository {
  constructor(private readonly database: Database) {}

  async readIdentity(context: VerifiedRequestContext, at: Date): Promise<ExperienceIdentityRecord | undefined> {
    const result = await sql<{
      tenantStatus: string; tenantRealmKey: string; subscriptionPlanId: string | null; tenantRevision: string;
      principalStatus: string; principalAuthEpoch: number; principalRevision: string; identityBindingActive: boolean;
      membershipActive: boolean; membershipRevision: string | null;
    }>`
      SELECT t.status::text AS "tenantStatus", t.realm_key AS "tenantRealmKey",
             t.subscription_plan_id::text AS "subscriptionPlanId", COALESCE(t.updated_at, t.created_at)::text AS "tenantRevision",
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
      WHERE t.id = ${context.tenantId}::uuid
      LIMIT 1
    `.execute(this.database);
    const row = result.rows[0];
    if (!row) return undefined;
    return { tenantStatus: row.tenantStatus, tenantRealmKey: row.tenantRealmKey, ...(row.subscriptionPlanId ? { subscriptionPlanId: row.subscriptionPlanId } : {}), tenantRevision: row.tenantRevision, principalStatus: row.principalStatus, principalAuthEpoch: row.principalAuthEpoch, principalRevision: row.principalRevision, identityBindingActive: row.identityBindingActive, membershipActive: row.membershipActive, ...(row.membershipRevision ? { membershipRevision: row.membershipRevision } : {}) };
  }

  async readProfile(context: VerifiedRequestContext): Promise<ExperienceProfileRecord> {
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
    `.execute(this.database);
    const row = result.rows[0];
    return { ...(row?.tenant ? { tenant: row.tenant } : {}), ...(row?.principal ? { principal: row.principal } : {}), revision: row?.revision ?? "profile:missing" };
  }

  async readCatalog(context: VerifiedRequestContext, subscriptionPlanId: string): Promise<ExperienceCatalogRecord | undefined> {
    const [planResult, associationResult, permissionResult] = await Promise.all([
      sql<{ active: boolean; revision: string }>`SELECT is_active AS active, COALESCE(updated_at, created_at)::text AS revision FROM control.subscription_plan WHERE id = ${subscriptionPlanId}::uuid LIMIT 1`.execute(this.database),
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
      `.execute(this.database),
      sql<{ code: string; moduleId: string; revision: string }>`
        SELECT p.canonical_code AS code, p.module_id::text AS "moduleId", COALESCE(p.updated_at, p.created_at)::text AS revision
        FROM authz.permission p WHERE p.status = 'active' ORDER BY p.canonical_code
      `.execute(this.database),
    ]);
    const plan = planResult.rows[0];
    if (!plan) return undefined;
    return {
      planActive: plan.active, planRevision: plan.revision,
      associations: associationResult.rows.map((row) => ({ workspaceCode: row.workspaceCode, workspaceName: row.workspaceName, ...(row.workspaceIconKey ? { workspaceIconKey: row.workspaceIconKey } : {}), workspaceSortOrder: row.workspaceSortOrder, moduleId: row.moduleId, moduleCode: row.moduleCode, moduleName: row.moduleName, ...(row.moduleIconKey ? { moduleIconKey: row.moduleIconKey } : {}), moduleSortOrder: row.moduleSortOrder, primary: row.primary, revision: row.revision })),
      permissions: permissionResult.rows,
    };
  }

  async readFeatures(context: VerifiedRequestContext, at: Date): Promise<readonly ExperienceFeatureRecord[]> {
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
    `.execute(this.database);
    return result.rows.map((row) => ({ id: row.id, code: row.code, ...(row.moduleId ? { moduleId: row.moduleId } : {}), kind: row.kind, defaultEnabled: row.defaultEnabled, ...(row.rolloutPct === null ? {} : { rolloutPct: row.rolloutPct }), ...(row.overrideEnabled === null ? {} : { overrideEnabled: row.overrideEnabled }), metadata: row.metadata, revision: row.revision }));
  }
}
