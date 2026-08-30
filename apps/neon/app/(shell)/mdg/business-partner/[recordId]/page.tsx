import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessPartnerRecord } from "@athyper/product-neon-business-partner";
export const metadata:Metadata={title:"Business Partner"};
export default async function BusinessPartnerDetailPage({params}:{readonly params:Promise<{readonly recordId:string}>}){const{recordId}=await params;if(!/^[0-9a-f-]{36}$/i.test(recordId))notFound();return <><div className="bp-actions"><a className="a-button a-button--secondary" href={`/mdg/business-partner/${encodeURIComponent(recordId)}/scope/new`}>Assign organization / configure company</a><a className="a-button a-button--secondary" href={`/mdg/business-partner/${encodeURIComponent(recordId)}/customer`}>Customer credit & lifecycle</a><a className="a-button a-button--primary" href={`/mdg/business-partner/${encodeURIComponent(recordId)}/roles/new`}>Add supplier/customer role</a></div><BusinessPartnerRecord businessPartnerId={recordId}/></>;}
