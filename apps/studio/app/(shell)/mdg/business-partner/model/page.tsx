import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Business Partner Data Model" };
export default function Page() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Data Model"
        description="Fields, relationships, and surfaces from the selected stored definition."
      />
      <BusinessPartnerInspection tab="model" />
    </PageFrame>
  );
}
