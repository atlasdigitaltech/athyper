import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Business Partner Workflows" };
export default function Page() {
  return (
    <PageFrame width="full">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Workflows"
        description="Inspect flows, lifecycle bindings, and separately versioned workflow declarations."
      />
      <BusinessPartnerInspection tab="workflows" />
    </PageFrame>
  );
}
