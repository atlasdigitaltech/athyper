import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Business Partner Matching" };
export default function Page() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Matching"
        description="Inspect stored matching declarations and distinguish them from search configuration."
      />
      <BusinessPartnerInspection tab="matching" />
    </PageFrame>
  );
}
