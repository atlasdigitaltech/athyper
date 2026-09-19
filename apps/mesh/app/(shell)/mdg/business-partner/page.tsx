import type { Metadata } from "next";
import { BusinessPartnerOverview } from "@athyper/product-mesh-business-partner";

export const metadata: Metadata = { title: "Business Partner" };

export default function BusinessPartnerPage() {
  return <BusinessPartnerOverview/>;
}
