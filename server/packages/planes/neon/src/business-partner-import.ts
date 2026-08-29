import { sql, type Transaction } from "kysely";
import type { GovernedImportAdapter, RecordCollectionScopeResolution } from "@athyper/server-contract-records";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;
type Scope = Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>;

export function createNeonBusinessPartnerImportAdapter(): GovernedImportAdapter<Tx> {
  const adapter: GovernedImportAdapter<Tx> = {
    key: "neon.business_partner.operating_organization.v1",
    supports: descriptor => descriptor.planeKey === "neon" && descriptor.entityCode === "business_partner" && descriptor.storage.schema === "master" && descriptor.storage.object === "business_partner",
    operations: () => Object.freeze(["create", "update", "upsert", "delete", "replace"] as const),
    async validate({ row, rowNumber, session, scope }) {
      const errors: string[] = [];
      const constraint = neonScope(scope);
      if (!constraint) errors.push("IMPORT_SCOPE_INVALID:scope:The operating-organization scope is required");
      requiredText(row, "code", errors);
      if (session.operation === "create" || session.operation === "upsert" || session.operation === "replace") requiredText(row, "name", errors);
      optionalEnum(row, "partner_role", ["supplier", "customer"], errors);
      optionalEnum(row, "status", ["draft", "active"], errors);
      optionalJsonObject(row, "metadata", errors);
      return { rowNumber, valid: errors.length === 0, errors };
    },
    async apply({ context, row, session, scope, transaction }) {
      const organizationId = requiredNeonScope(scope);
      const code = text(row, "code");
      const existing = (await sql<{ id: string }>`SELECT id FROM master.business_partner WHERE tenant_id=${context.tenantId}::uuid AND code=${code} FOR UPDATE`.execute(transaction)).rows[0];
      if (session.operation === "delete") {
        if (!existing) return conflict(session.conflictPolicy, `Business partner ${code} was not found`);
        const ended = await sql`UPDATE master.business_partner_operating_organization_assignment
          SET status='archived',status_changed_at=clock_timestamp(),status_changed_by=${context.principalId}::uuid,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid
          WHERE tenant_id=${context.tenantId}::uuid AND business_partner_id=${existing.id}::uuid AND operating_organization_id=${organizationId}::uuid AND status IN ('draft','active')`.execute(transaction);
        if (!Number(ended.numAffectedRows)) return conflict(session.conflictPolicy, `Business partner ${code} is not assigned to the selected organization`);
        return { outcome: "deleted" as const, recordId: existing.id };
      }
      if (existing && session.operation === "create") return conflict(session.conflictPolicy, `Business partner ${code} already exists`);
      if (!existing && session.operation === "update") return conflict(session.conflictPolicy, `Business partner ${code} was not found`);
      const partnerId = existing?.id ?? (await sql<{ id: string }>`INSERT INTO master.business_partner(
          tenant_id,code,name,display_name,legal_name,partner_category,legal_form,registration_country_code,incorporation_date,website_url,description,aliases,metadata,status,created_by
        ) VALUES(
          ${context.tenantId}::uuid,${code},${text(row,"name")},${nullableText(row,"display_name")},${nullableText(row,"legal_name")},${nullableText(row,"partner_category")??"organization"},${nullableText(row,"legal_form")},${nullableText(row,"registration_country_code")},${nullableText(row,"incorporation_date")}::date,${nullableText(row,"website_url")},${nullableText(row,"description")},${textArray(row,"aliases")},${JSON.stringify(object(row,"metadata"))}::jsonb,${nullableText(row,"status")??"draft"},${context.principalId}::uuid
        ) RETURNING id`.execute(transaction)).rows[0]!.id;
      if (existing) await sql`UPDATE master.business_partner SET
          name=COALESCE(${nullableText(row,"name")},name),display_name=COALESCE(${nullableText(row,"display_name")},display_name),legal_name=COALESCE(${nullableText(row,"legal_name")},legal_name),partner_category=COALESCE(${nullableText(row,"partner_category")},partner_category),legal_form=COALESCE(${nullableText(row,"legal_form")},legal_form),registration_country_code=COALESCE(${nullableText(row,"registration_country_code")},registration_country_code),incorporation_date=COALESCE(${nullableText(row,"incorporation_date")}::date,incorporation_date),website_url=COALESCE(${nullableText(row,"website_url")},website_url),description=COALESCE(${nullableText(row,"description")},description),metadata=CASE WHEN ${has(row,"metadata")} THEN ${JSON.stringify(object(row,"metadata"))}::jsonb ELSE metadata END,updated_at=clock_timestamp(),updated_by=${context.principalId}::uuid
          WHERE tenant_id=${context.tenantId}::uuid AND id=${partnerId}::uuid`.execute(transaction);
      const role = nullableText(row, "partner_role") ?? "supplier";
      if (role === "supplier") await sql`INSERT INTO master.supplier(tenant_id,business_partner_id,supplier_code,supplier_type,metadata,status,created_by)
        VALUES(${context.tenantId}::uuid,${partnerId}::uuid,${code},'general',${JSON.stringify(object(row,"role_metadata"))}::jsonb,'active',${context.principalId}::uuid)
        ON CONFLICT(tenant_id,business_partner_id) DO NOTHING`.execute(transaction);
      if (role === "customer") await sql`INSERT INTO master.customer(tenant_id,business_partner_id,customer_code,customer_type,metadata,status,created_by)
        VALUES(${context.tenantId}::uuid,${partnerId}::uuid,${code},'corporate',${JSON.stringify(object(row,"role_metadata"))}::jsonb,'active',${context.principalId}::uuid)
        ON CONFLICT(tenant_id,business_partner_id) DO NOTHING`.execute(transaction);
      await sql`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,metadata,status,created_by)
        VALUES(${context.tenantId}::uuid,${partnerId}::uuid,${organizationId}::uuid,${role},COALESCE(${nullableText(row,"effective_from")}::date,CURRENT_DATE),${JSON.stringify(object(row,"assignment_metadata"))}::jsonb,'active',${context.principalId}::uuid)
        ON CONFLICT DO NOTHING`.execute(transaction);
      return { outcome: existing ? "updated" as const : "created" as const, recordId: partnerId };
    },
  };
  return Object.freeze(adapter);
}

function neonScope(scope: Scope) { return scope.constraints.find(item => item.kind === "neon.business_partner.operating_organization.v1"); }
function requiredNeonScope(scope: Scope) { const value = neonScope(scope); if (!value || value.kind !== "neon.business_partner.operating_organization.v1") throw new Error("Neon import scope is unavailable"); return value.operatingOrganizationId; }
function conflict(policy: "reject" | "skip", message: string) { if (policy === "skip") return { outcome: "skipped" as const }; throw Object.assign(new Error(message), { code: "IMPORT_CONFLICT", retryable: false as const }); }
function has(row: Row, key: string) { return Object.prototype.hasOwnProperty.call(row, key); }
function text(row: Row, key: string) { const value = row[key]; if (typeof value !== "string" || !value.trim()) throw new Error(`IMPORT_FIELD_REQUIRED:${key}`); return value.trim(); }
function nullableText(row: Row, key: string) { const value = row[key]; return typeof value === "string" && value.trim() ? value.trim() : null; }
function object(row: Row, key: string): Readonly<Record<string, unknown>> { const value = row[key]; return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
function textArray(row: Row, key: string): readonly string[] { const value = row[key]; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function requiredText(row: Row, key: string, errors: string[]) { if (typeof row[key] !== "string" || !String(row[key]).trim()) errors.push(`IMPORT_FIELD_REQUIRED:${key}:${key} is required`); }
function optionalEnum(row: Row, key: string, allowed: readonly string[], errors: string[]) { if (row[key] !== undefined && (!allowed.includes(String(row[key])))) errors.push(`IMPORT_FIELD_INVALID:${key}:${key} is invalid`); }
function optionalJsonObject(row: Row, key: string, errors: string[]) { const value=row[key];if(value!==undefined&&(!value||typeof value!=="object"||Array.isArray(value)))errors.push(`IMPORT_FIELD_INVALID:${key}:${key} must be an object`); }
