import { notFound } from "next/navigation";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getNeonServerSession } from "@/lib/server/session";
import { resolveFxRateTenantCode } from "@/lib/server/fx-rate-runtime-context";
import { FxRateGovernedForm } from "../../FxRateGovernedForm";

export default async function GovernedEntityReplaceRoute({
  params,
}:{
  params:Promise<{entity:string;id:string}>;
}) {
  const {entity,id}=await params;
  if(entity!=="fx_rate")notFound();
  const descriptor=await getMetaEntityRuntimeDescriptor(entity);
  if(!descriptor)notFound();
  const session=await getNeonServerSession();
  const tenantCode=session?resolveFxRateTenantCode(session):null;
  if(!tenantCode)notFound();
  const recordId=normalizeRouteRecordId(id);
  const detail=await getMetaEntityRecordDetail(entity,recordId,descriptor);
  if(!detail.record||detail.state.status==="unavailable")notFound();
  return <FxRateGovernedForm tenantCode={tenantCode} descriptor={descriptor} mode="replace" record={detail.record}/>;
}
