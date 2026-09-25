import { redirectEntityRecord, type LegacyEntityRecordProps } from "@/lib/redirect-entity-record";

export default function BusinessPartnerDetailPage(props: LegacyEntityRecordProps): Promise<never> {
  return redirectEntityRecord("business_partner", props);
}
