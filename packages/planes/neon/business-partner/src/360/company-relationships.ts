import {useEffect,useMemo,useState} from "react";
import {useApiClient,useSessionIdentity} from "@athyper/platform-shell-app-foundation";
import {useBusinessPartner360} from "./business-partner-360-context";
import {createBusinessPartner360RoleClient} from "./business-partner-360-role-client";
export type Relationship={companyCodeId:string;companyName:string;operatingOrganizationId:string;operatingOrganizationName:string;role:"supplier"|"customer";roleStatus:string;assignmentStatus:string;profileStatus?:string};
export const relationshipStatus=(row:Relationship)=> !row.profileStatus?"Not extended":row.profileStatus==="active"&&row.assignmentStatus==="active"&&row.roleStatus==="active"?"Active": [row.profileStatus,row.assignmentStatus,row.roleStatus].some(s=>["blocked","suspended","inactive","archived"].includes(s??""))?"Inactive / blocked":"Setup incomplete";
export function relationshipCounts(rows:readonly Relationship[]) {
 return {buying:new Set(rows.filter(r=>r.role==="supplier"&&relationshipStatus(r)==="Active").map(r=>r.companyCodeId)).size,selling:new Set(rows.filter(r=>r.role==="customer"&&relationshipStatus(r)==="Active").map(r=>r.companyCodeId)).size,gaps:new Set(rows.filter(r=>relationshipStatus(r)==="Setup incomplete").map(r=>`${r.companyCodeId}:${r.role}`)).size};
}
export function useCompanyRelationships(){
 const {summary}=useBusinessPartner360(),identity=useSessionIdentity(),http=useApiClient(),client=useMemo(()=>createBusinessPartner360RoleClient(http),[http]);
 const [loaded,setLoaded]=useState<{key:string;rows:Relationship[]}>(),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const allowed=summary.sections.some(s=>s.code==="roles-scope"&&s.authorization==="granted");
 const key=[summary.identity.id,identity.scope?.tenantId,identity.scope?.principalId,identity.scope?.authEpoch,summary.completeness.readOnly?summary.asOf:"current",retry].join(":");
 useEffect(()=>{
  if(!allowed||!identity.scope)return;
  const controller=new AbortController();setError(false);
  client.read({tenantId:identity.scope.tenantId,principalId:identity.scope.principalId,authEpoch:identity.scope.authEpoch,businessPartnerId:summary.identity.id,sectionCode:"roles-scope",roleLens:"all",...(summary.completeness.readOnly?{asOf:summary.asOf}: {})},controller.signal)
   .then(v=>{if(!controller.signal.aborted)setLoaded({key,rows:Array.isArray(v.data["companies"])?v.data["companies"] as Relationship[]:[]});})
   .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[client,key,allowed]);
 return {rows:loaded?.key===key?loaded.rows:undefined,error,allowed,retry:()=>setRetry(v=>v+1)};
}
export function rolesHref(id:string,companyId?:string,organizationId?:string,subtab="buying"){
 const q=new URLSearchParams({tab:"roles",section:"roles-scope",roleTab:subtab});
 if(companyId)q.set("companyCodeId",companyId);if(organizationId)q.set("operatingOrganizationId",organizationId);
 return `/mdg/business-partner/${encodeURIComponent(id)}?${q}`;
}
