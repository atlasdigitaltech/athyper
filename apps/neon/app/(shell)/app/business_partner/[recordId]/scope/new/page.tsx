import { notFound } from "next/navigation";
import { BusinessPartnerScopeConfiguration } from "@athyper/product-neon-business-partner";

export default async function BusinessPartnerScopeConfigurationPage({params}:{readonly params:Promise<{readonly recordId:string}>}){
  const{recordId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(recordId))notFound();
  return <BusinessPartnerScopeConfiguration businessPartnerId={recordId}/>;
}
