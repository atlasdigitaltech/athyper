import { redirect } from "next/navigation";
import { CompanyCurrencyFxSettingsPage } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";
export default async function CurrencyFxPage({params}:{params:Promise<{companyCode:string}>}){const {companyCode}=await params;const decoded=decodeURIComponent(companyCode);if(!await getNeonServerSession())redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${decoded}/currency-fx`)}`);return <CompanyCurrencyFxSettingsPage companyCode={decoded}/>;}
