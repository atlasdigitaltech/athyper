import { notFound } from "next/navigation";
import { BusinessPartnerRoleExtension } from "@athyper/product-neon-business-partner";

export default async function BusinessPartnerRoleExtensionPage({params}:{readonly params:Promise<{readonly recordId:string}>}){
  const{recordId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(recordId))notFound();
  return <BusinessPartnerRoleExtension businessPartnerId={recordId}/>;
}
