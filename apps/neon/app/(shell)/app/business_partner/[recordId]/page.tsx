import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessPartnerAggregateDetail } from "@athyper/product-neon-business-partner";
export const metadata:Metadata={title:"Business Partner"};
export default async function BusinessPartnerDetailPage({params}:{readonly params:Promise<{readonly recordId:string}>}){const{recordId}=await params;if(!/^[0-9a-f-]{36}$/i.test(recordId))notFound();return <><div className="bp-actions"><a className="a-button a-button--secondary" href={`/app/business_partner/${encodeURIComponent(recordId)}/scope/new`}>Assign organization / configure company</a><a className="a-button a-button--primary" href={`/app/business_partner/${encodeURIComponent(recordId)}/roles/new`}>Add supplier/customer role</a></div><BusinessPartnerAggregateDetail businessPartnerId={recordId}/></>;}
