import {notFound} from "next/navigation";
import {isEntityId} from "@/lib/route-params";
import {BankingWorkspace} from "@athyper/product-neon-business-partner";
export default async function Page({params,searchParams}:{params:Promise<{recordId:string}>;searchParams:Promise<{companyCodeId?:string;bankProjectionId?:string}>}){
 const {recordId}=await params;const query=await searchParams;
 if(!isEntityId(recordId))notFound();
 return <BankingWorkspace businessPartnerId={recordId} mode="manage" initialCompanyCodeId={typeof query.companyCodeId==="string"?query.companyCodeId:""} initialBankProjectionId={typeof query.bankProjectionId==="string"?query.bankProjectionId:""}/>;
}
