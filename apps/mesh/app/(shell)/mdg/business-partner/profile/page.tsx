import type { Metadata } from "next";
import { BusinessPartnerProfile } from "@athyper/product-mesh-business-partner";
export const metadata: Metadata = { title: "My Organization" };
export default function BusinessPartnerProfilePage(){return <BusinessPartnerProfile/>;}
