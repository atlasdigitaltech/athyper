import {
  businessPartnerReadScope,
  rethrowBusinessPartnerReadError,
} from "../business-partner-read-contract.js";
import { EntityRuntimeResourceError } from "@athyper/server-platform-experience";
import type { CompanyProfiles, SectionProviders } from "./contracts.js";

export function createPartnerCompanyProfileProviders(
  companyProfiles?: CompanyProfiles,
): SectionProviders {
  return {
    get(handlerKey) {
      const sectionCode =
        handlerKey === "neon.bp.section.supplier-company.v1"
          ? "supplier-company"
          : handlerKey === "neon.bp.section.customer-company.v1"
            ? "customer-company"
            : undefined;
      if (
        sectionCode === "supplier-company" ||
        sectionCode === "customer-company"
      )
        return {
          async read({ context, recordId, resourceContext }) {
            if (!companyProfiles)
              throw new EntityRuntimeResourceError(
                503,
                "PARTNER_COMPANY_PROFILES_UNAVAILABLE",
              );
            return companyProfiles
              .read({
                context,
                recordId,
                capability:
                  sectionCode === "supplier-company" ? "supplier" : "customer",
                ...businessPartnerReadScope(resourceContext),
              })
              .catch(rethrowBusinessPartnerReadError);
          },
        };

      return undefined;
    },
  };
}
