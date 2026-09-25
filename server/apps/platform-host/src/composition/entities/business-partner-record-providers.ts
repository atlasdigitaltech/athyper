import { createPartnerRecordProviders } from "./business-partner/record.js";
import { createPartnerClassificationProviders } from "./business-partner/classifications.js";
import { createPartnerDecisionProviders } from "./business-partner/decisions.js";
import { createPartnerCompanyProfileProviders } from "./business-partner/company-profiles.js";
import type {
  PartnerService,
  ClassificationService,
  DecisionViews,
  CompanyProfiles,
  RecordProviders,
} from "./business-partner/contracts.js";

/** Composition only: providers retain their independently authorized domain readers. */
export function createBusinessPartnerRecordProviders(
  businessPartner360: PartnerService,
  partnerClassifications: ClassificationService,
  decisionViews?: DecisionViews,
  companyProfiles?: CompanyProfiles,
): RecordProviders {
  const record = createPartnerRecordProviders(businessPartner360);
  const sections = [
    createPartnerClassificationProviders(
      businessPartner360,
      partnerClassifications,
    ),
    createPartnerDecisionProviders(businessPartner360, decisionViews),
    createPartnerCompanyProfileProviders(companyProfiles),
    record.sections,
  ];
  return {
    headers: record.headers,
    summaries: record.summaries,
    sections: {
      get(handlerKey) {
        for (const provider of sections) {
          const handler = provider.get(handlerKey);
          if (handler) return handler;
        }
        return undefined;
      },
    },
  };
}
