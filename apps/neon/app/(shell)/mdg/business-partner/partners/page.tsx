import type { Metadata } from "next";
import { NeonEntityList } from "@athyper/product-neon-list-view";
export const metadata: Metadata = { title: "Business Partners" };
export default function BusinessPartnersPage(){return <NeonEntityList entityCode="business_partner"/>;}
