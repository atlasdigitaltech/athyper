import { WorkforceRequestDetail } from "@athyper/product-neon-workforce";

export default async function WorkforceRequestPage({params}:{params:Promise<{requestId:string}>}){const{requestId}=await params;return <WorkforceRequestDetail requestId={requestId}/>;}
