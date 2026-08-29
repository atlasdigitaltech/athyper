import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessPartnerRequestEdit } from "@athyper/product-neon-business-partner";
export const metadata:Metadata={title:"Edit Business Partner request"};
export default async function EditBusinessPartnerRequestPage({params}:{readonly params:Promise<{readonly requestId:string}>}){const{requestId}=await params;if(!/^[0-9a-f-]{36}$/i.test(requestId))notFound();return <BusinessPartnerRequestEdit requestId={requestId}/>;}
