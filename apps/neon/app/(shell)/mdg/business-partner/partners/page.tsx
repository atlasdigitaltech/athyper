import { redirect } from "next/navigation";
import { entityRouteAlias } from "@/lib/entity-route-alias";
export default async function BusinessPartnerListAlias({searchParams}:{readonly searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<never>{
  redirect(entityRouteAlias("/mdg/business-partner/manage",await searchParams));
}
