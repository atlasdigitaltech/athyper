import { notFound } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { resolveFxRateTenantCode } from "@/lib/server/fx-rate-runtime-context";
import { FxRateEntityImport } from "../FxRateEntityImport";

export default async function GovernedEntityImportRoute({
  params,
}:{
  params:Promise<{entity:string}>;
}) {
  const {entity}=await params;
  if(entity!=="fx_rate")notFound();
  const session=await getNeonServerSession();
  const tenantCode=session?resolveFxRateTenantCode(session):null;
  if(!tenantCode)notFound();
  return <FxRateEntityImport tenantCode={tenantCode}/>;
}
