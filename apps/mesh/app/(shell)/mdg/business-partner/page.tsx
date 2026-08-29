import type { Metadata } from "next";
import { BusinessPartnerNetworkList } from "@athyper/product-mesh-business-partner";

export const metadata: Metadata = { title: "Business Partner Network" };

export default function BusinessPartnerNetworkPage() {
  return <BusinessPartnerNetworkList/>;
}
