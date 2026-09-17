import type { Metadata } from "next";
import { PageFrame } from "@athyper/platform-shell";
import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Business Partner Workflows" };
export default function Page() {
  return (
    <PageFrame width="full">
      <BusinessPartnerInspection tab="workflows" />
    </PageFrame>
  );
}
