import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Business Partner Validation" };
export default function Page() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Validation"
        description="Inspect declared constraints and policy references for the selected version."
      />
      <BusinessPartnerInspection tab="validation" />
    </PageFrame>
  );
}
