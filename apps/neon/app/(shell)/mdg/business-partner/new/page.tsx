import type { Metadata } from "next";
import { AuthorizedNewBusinessPartnerRequest } from "@athyper/product-neon-business-partner";
export const metadata:Metadata={title:"New Business Partner request"};
export default function NewBusinessPartnerPage(){return <AuthorizedNewBusinessPartnerRequest/>;}
