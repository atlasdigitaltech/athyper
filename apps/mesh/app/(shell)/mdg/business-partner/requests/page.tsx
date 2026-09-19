import type { Metadata } from "next";
import { BusinessPartnerChangeRequests } from "@athyper/product-mesh-business-partner";
export const metadata: Metadata = { title: "Business Partner Change Requests" };
export default function BusinessPartnerRequestsPage(){return <BusinessPartnerChangeRequests/>;}
