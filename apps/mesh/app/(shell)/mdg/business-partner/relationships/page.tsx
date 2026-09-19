import type { Metadata } from "next";
import { BusinessPartnerNetworkList } from "@athyper/product-mesh-business-partner";
export const metadata: Metadata = { title: "Business Partner Relationships" };
export default function BusinessPartnerRelationshipsPage(){return <BusinessPartnerNetworkList/>;}
