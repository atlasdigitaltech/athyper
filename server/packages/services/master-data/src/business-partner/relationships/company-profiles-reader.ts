import { sql, type Transaction } from "kysely";
import { MasterDataError } from "../../errors.js";
import type { PartnerCapability } from "../capabilities/service.js";

type Tx = Transaction<Record<string, never>>;
export interface PartnerCompanyProfileScope {
  tenantId: string;
  businessPartnerId: string;
  operatingOrganizationId: string;
  companyCodeId: string;
  capability: PartnerCapability;
}
export interface PartnerCompanyProfileRow {
  id: string;
  business_partner_id: string;
  company_code_id: string;
  currency_code: string | null;
  payment_term_id: string | null;
  default_accounting_profile_id: string | null;
  default_dimension_set_id: string | null;
  status: string;
  capability_enabled: boolean;
  partner_status: string;
  preferred_remittance_bank_link_id?: string | null;
  statement_cycle_code?: string | null;
}

/** Partner-owned profile provider. Tenant/company/org authorization applies even
 * to empty data. Operational BP assignment/capability prerequisites govern
 * activation, not viewing retained draft setup under an authorized company.
 */
export async function readPartnerCompanyProfile(
  scope: PartnerCompanyProfileScope,
  tx: Tx,
  authorize: (scope: PartnerCompanyProfileScope, tx: Tx) => Promise<boolean>,
): Promise<PartnerCompanyProfileRow | null> {
  if (!scope || !["supplier", "customer"].includes(scope.capability)
      || ![scope.tenantId, scope.businessPartnerId, scope.operatingOrganizationId, scope.companyCodeId]
        .every(id => typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) {
    throw new MasterDataError(400, "PARTNER_PROFILE_SCOPE_REQUIRED", "Explicit partner, organization, company and capability are required");
  }
  if (await authorize(scope, tx) !== true) {
    throw new MasterDataError(403, "PARTNER_PROFILE_FORBIDDEN", "Company profile access is not authorized");
  }
  const supplier = scope.capability === "supplier";
  const table = supplier ? "master.company_code_supplier_profile" : "master.company_code_customer_profile";
  const enabled = supplier ? sql`b.supplier_enabled` : sql`b.customer_enabled`;
  const extra = supplier ? sql`p.preferred_remittance_bank_link_id::text` : sql`p.statement_cycle_code`;
  const rows = await sql<PartnerCompanyProfileRow>`
    SELECT p.id::text, p.business_partner_id::text, p.company_code_id::text, p.currency_code::text,
      p.payment_term_id::text, p.default_accounting_profile_id::text, p.default_dimension_set_id::text,
      p.status::text, b.status::text AS partner_status, ${enabled} AS capability_enabled, ${extra}
    FROM ${sql.table(table)} p
    JOIN master.business_partner b ON b.tenant_id=p.tenant_id AND b.id=p.business_partner_id
    WHERE p.tenant_id=${scope.tenantId}::uuid AND p.business_partner_id=${scope.businessPartnerId}::uuid
      AND p.company_code_id=${scope.companyCodeId}::uuid
      AND EXISTS (
        SELECT 1 FROM master.operating_organization_company_assignment c
        WHERE c.tenant_id=p.tenant_id
          AND c.operating_organization_id=${scope.operatingOrganizationId}::uuid
          AND c.company_code_id=p.company_code_id
          AND c.status='active' AND c.effective_from<=CURRENT_DATE
          AND (c.effective_until IS NULL OR c.effective_until>CURRENT_DATE)
      )
  `.execute(tx);
  if (rows.rows.length > 1) throw new Error("Partner company profile coordinate is not unique");
  return rows.rows[0] ?? null;
}
