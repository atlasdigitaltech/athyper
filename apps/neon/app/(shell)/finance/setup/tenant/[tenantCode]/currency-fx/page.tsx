import { redirect } from "next/navigation";
import { FxRateWorkbench } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";
export default async function FxRatePage({params}:{params:Promise<{tenantCode:string}>}){const {tenantCode}=await params;const decoded=decodeURIComponent(tenantCode);if(!await getNeonServerSession())redirect(`/login?next=${encodeURIComponent(`/finance/setup/tenant/${decoded}/currency-fx`)}`);return <FxRateWorkbench tenantCode={decoded}/>;}
