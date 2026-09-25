import type { BusinessPartnerRequestExtensions } from "@athyper/server-contract-master-data";
import { MasterDataError } from "@athyper/server-service-master-data";

/** Match the materializer's canonical lookup authority before a draft can submit. */
export async function admitBusinessPartnerProfileReferences(
  extensions: BusinessPartnerRequestExtensions | undefined,
  isActive: (domain: string, code: string) => Promise<boolean>,
): Promise<void> {
  const mappings = [
    ["relationships", "relationshipTypeCode", "master.business_partner_relationship_type"],
    ["governanceRelations", "relationTypeCode", "master.business_partner_governance_role"],
    ["identifiers", "schemeCode", "master.business_partner_identifier_scheme"],
    ["taxRegistrations", "registrationTypeCode", "master.business_partner_tax_registration_type"],
  ] as const;
  for (const [group, field, domain] of mappings) {
    for (const [index, row] of (extensions?.[group] ?? []).entries()) {
      const code = (row as unknown as Readonly<Record<string, unknown>>)[field];
      // Shape validation owns missing fields and supports incomplete draft capture.
      if (code === undefined || code === "") continue;
      if (typeof code !== "string" || !(await isActive(domain, code))) {
        throw new MasterDataError(422, "BUSINESS_PARTNER_PROFILE_REFERENCE_INVALID",
          `Unknown or inactive reference at ${group}[${index}].${field}`);
      }
    }
  }
}
