import type { Metadata } from "next";
import { BusinessPartnerRequestList } from "@athyper/product-neon-business-partner";
export const metadata:Metadata={title:"Business Partner onboarding"};
export default function BusinessPartnerRequestsPage(){return <BusinessPartnerRequestList/>;}
