import { sql, type Kysely } from "kysely";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

/** Execution adapter. Stored case ownership never comes from shell/request scope.
 * Proposed organization/company selections are checked against active catalog links.
 * Workflow preflight is supplied by the owning command service, not the shadow adapter. */
export function createBusinessPartnerStoredScopes(
  database: Kysely<Record<string, never>>,
  preflight: EntityScopeAdapter["preflight"],
): EntityScopeAdapter {
  return {
    preflight,
    async resolve(input) {
      if (
        input.context.planeKey !== "neon" ||
        ![
          "business_partner",
          "entity_case",
          "business_partner_company_setup_request",
        ].includes(input.entityCode)
      )
        return { state: "invalid" };
      return database.transaction().execute(async (tx) => {
        await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
          tx,
        );
        await sql`SET LOCAL statement_timeout='1500ms'`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${input.context.tenantId},true),set_config('app.current_principal_id',${input.context.principalId},true)`.execute(
          tx,
        );
        const companyPilot =
          input.entityCode === "business_partner_company_setup_request";
        if (companyPilot && input.resolver !== "company.record.v1")
          return { state: "invalid" as const };
        let coordinates = { ...input.coordinates };
        if (input.target === "existing") {
          if (!input.recordId) return { state: "invalid" as const };
          if (companyPilot) {
            // This entity is independently owned. Neither its parent BP nor a
            // caller-selected company substitutes for the persisted owner.
            const row = (
              await sql<{
                company_id: string | null;
                organization_id: string | null;
              }>`
              SELECT owned.owner_company_code_id::text company_id,
                     snapshot.payload_json->>'operatingOrganizationId' organization_id
              FROM document.entity_case owned
              JOIN snapshot.entity_snapshot snapshot ON snapshot.tenant_id=owned.tenant_id
                AND snapshot.snapshot_id=owned.current_snapshot_id
              WHERE owned.tenant_id=${input.context.tenantId}::uuid AND owned.id=${input.recordId}::uuid
                AND owned.entity_code='master.business_partner_company_setup_request'
                AND owned.owner_company_code_id IS NOT NULL
                AND snapshot.payload_json->>'companyCodeId'=owned.owner_company_code_id::text
            `.execute(tx)
            ).rows[0];
            if (!row?.company_id) return { state: "invalid" as const };
            coordinates = { companyCodeId: row.company_id };
          } else if (input.entityCode === "entity_case") {
            const row = (
              await sql<{
                organization_id: string | null;
                company_id: string | null;
              }>`SELECT snapshot.payload_json->>'operatingOrganizationId' organization_id,snapshot.payload_json->>'companyCodeId' company_id FROM document.entity_case owned JOIN snapshot.entity_snapshot snapshot ON snapshot.tenant_id=owned.tenant_id AND snapshot.snapshot_id=owned.current_snapshot_id WHERE owned.tenant_id=${input.context.tenantId}::uuid AND owned.id=${input.recordId}::uuid AND owned.entity_code='master.business_partner'`.execute(
                tx,
              )
            ).rows[0];
            if (!row?.organization_id) return { state: "invalid" as const };
            coordinates = {
              operatingOrganizationId: row.organization_id,
              ...(row.company_id ? { companyCodeId: row.company_id } : {}),
            };
          } else {
            if (
              !(
                await sql`SELECT 1 FROM master.business_partner WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.recordId}::uuid`.execute(
                  tx,
                )
              ).rows.length
            )
              return { state: "invalid" as const };
            if (input.resolver === "tenant.record.v1") coordinates = {};
          }
        }
        const org = coordinates.operatingOrganizationId,
          company = coordinates.companyCodeId;
        // Collection discovery uses company ownership alone. Organization is a
        // creation prerequisite, not an extra owner of every company-owned row.
        if (companyPilot && input.target === "proposed" && (!org || !company))
          return { state: "invalid" as const };
        const supported: Record<string, readonly string[]> = {
          "tenant.record.v1": [],
          "organization.record.v1": ["operatingOrganizationId"],
          "company.record.v1": ["companyCodeId"],
          "organization-company.record.v1": [
            "operatingOrganizationId",
            "companyCodeId",
          ],
        };
        const required = supported[input.resolver];
        if (!required || required.some((key) => !Reflect.get(coordinates, key)))
          return { state: "invalid" as const };
        if (
          input.entityCode === "entity_case" &&
          input.resolver !== "organization.record.v1" &&
          input.resolver !== "organization-company.record.v1"
        )
          return { state: "invalid" as const };
        if (
          org &&
          !(
            await sql`SELECT 1 FROM master.operating_organization WHERE tenant_id=${input.context.tenantId}::uuid AND id=${org}::uuid AND status='active'`.execute(
              tx,
            )
          ).rows.length
        )
          return { state: "invalid" as const };
        if (
          company &&
          !(
            await sql`SELECT 1 FROM master.company_code WHERE tenant_id=${input.context.tenantId}::uuid AND id=${company}::uuid AND status='active' AND is_active`.execute(
              tx,
            )
          ).rows.length
        )
          return { state: "invalid" as const };
        if (
          org &&
          company &&
          !(
            await sql`SELECT 1 FROM master.operating_organization_company_assignment WHERE tenant_id=${input.context.tenantId}::uuid AND operating_organization_id=${org}::uuid AND company_code_id=${company}::uuid AND status='active' AND effective_from<=current_date AND (effective_until IS NULL OR effective_until>current_date)`.execute(
              tx,
            )
          ).rows.length
        )
          return { state: "invalid" as const };
        if (
          input.entityCode === "business_partner" &&
          input.target === "existing" &&
          org &&
          !(
            await sql`SELECT 1 FROM master.business_partner_operating_organization_assignment WHERE tenant_id=${input.context.tenantId}::uuid AND business_partner_id=${input.recordId}::uuid AND operating_organization_id=${org}::uuid AND status='active' AND is_active AND effective_from<=current_date AND (effective_until IS NULL OR effective_until>current_date)`.execute(
              tx,
            )
          ).rows.length
        )
          return { state: "invalid" as const };
        return {
          state: "resolved" as const,
          coordinates: Object.fromEntries(
            required.map((key) => [key, Reflect.get(coordinates, key)]),
          ),
        };
      });
    },
  };
}
