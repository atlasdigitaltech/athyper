import { notFound } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { resolveFxRateTenantCode } from "@/lib/server/fx-rate-runtime-context";
import { FxRateEntityExport } from "../FxRateEntityExport";

export default async function GovernedEntityExportRoute({
  params,
}:{
  params:Promise<{entity:string}>;
}) {
  const {entity}=await params;
  if(entity!=="fx_rate")notFound();
  const session=await getNeonServerSession();
  const tenantCode=session?resolveFxRateTenantCode(session):null;
  if(!tenantCode)notFound();
  return <FxRateEntityExport tenantCode={tenantCode}/>;
}
