import type { createEntityRuntimeResourceService } from "@athyper/server-platform-experience";
import type {
  createBusinessPartner360Service,
  createPartnerClassificationService,
  createPartnerDecisionViews,
  createPartnerCompanyProfileViews,
} from "@athyper/server-service-master-data";
import { rethrowBusinessPartnerReadError } from "../business-partner-read-contract.js";
type RuntimeOptions = Parameters<typeof createEntityRuntimeResourceService>[0];
export type RecordProviders = Pick<
  RuntimeOptions,
  "headers" | "sections" | "summaries"
>;
export type SectionProviders = RecordProviders["sections"];
export type PartnerService = ReturnType<typeof createBusinessPartner360Service>;
export type ClassificationService = ReturnType<
  typeof createPartnerClassificationService
>;
export type DecisionViews = ReturnType<typeof createPartnerDecisionViews>;
export type CompanyProfiles = ReturnType<
  typeof createPartnerCompanyProfileViews
>;
/** Preserve the authorized service boundary and its existing error translation. */
export function createPartnerSectionReader(service: PartnerService) {
  return <T = unknown>(input: Parameters<PartnerService["section"]>[0]) =>
    service.section<T>(input).catch(rethrowBusinessPartnerReadError);
}
