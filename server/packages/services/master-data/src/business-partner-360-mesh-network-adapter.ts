import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {BusinessPartner360MeshNetworkSummary} from "@athyper/server-contract-master-data";

export interface BusinessPartner360MeshNetworkAdapter {
  read(input:{readonly context:VerifiedRequestContext;readonly sourceTenantId:string;readonly sourceNetworkAccountId:string;readonly recipientNetworkAccountId:string;readonly networkRelationshipId:string;readonly signal:AbortSignal}):Promise<BusinessPartner360MeshNetworkSummary>;
}
export interface BusinessPartner360MeshNetworkAuthority {authorize(input:{readonly principalId:string;readonly recipientTenantId:string;readonly sourceTenantId:string;readonly sourceNetworkAccountId:string;readonly recipientNetworkAccountId:string;readonly networkRelationshipId:string;readonly permissionCode:"mesh.business_partner_profile.read"}):Promise<boolean>;}
export interface BusinessPartner360MeshNetworkSummarySource {read(input:{readonly sourceTenantId:string;readonly sourceNetworkAccountId:string;readonly recipientNetworkAccountId:string;readonly networkRelationshipId:string;readonly signal:AbortSignal}):Promise<Omit<BusinessPartner360MeshNetworkSummary,"authorization">>;}

export function createBusinessPartner360MeshNetworkAdapter(options:{readonly authority:BusinessPartner360MeshNetworkAuthority;readonly source:BusinessPartner360MeshNetworkSummarySource}):BusinessPartner360MeshNetworkAdapter{return{async read(input){const permissionCode="mesh.business_partner_profile.read" as const,allowed=await options.authority.authorize({principalId:input.context.principalId,recipientTenantId:input.context.tenantId,sourceTenantId:input.sourceTenantId,sourceNetworkAccountId:input.sourceNetworkAccountId,recipientNetworkAccountId:input.recipientNetworkAccountId,networkRelationshipId:input.networkRelationshipId,permissionCode});if(!allowed)throw adapterError("MESH_FORBIDDEN");const summary=await options.source.read({sourceTenantId:input.sourceTenantId,sourceNetworkAccountId:input.sourceNetworkAccountId,recipientNetworkAccountId:input.recipientNetworkAccountId,networkRelationshipId:input.networkRelationshipId,signal:input.signal});return{...summary,authorization:{decision:"granted",permissionCode,networkRelationshipId:input.networkRelationshipId}};}};}

export type BusinessPartner360MeshReadResult=
  |Readonly<{state:"ready";summary:BusinessPartner360MeshNetworkSummary}>
  |Readonly<{state:"stale";reasonCode:string;summary:BusinessPartner360MeshNetworkSummary}>
  |Readonly<{state:"denied"|"unavailable";reasonCode:string}>;

export async function readBusinessPartner360MeshNetwork(adapter:BusinessPartner360MeshNetworkAdapter|undefined,input:Omit<Parameters<BusinessPartner360MeshNetworkAdapter["read"]>[0],"signal">,timeoutMs:number):Promise<BusinessPartner360MeshReadResult>{
  if(!adapter)return{state:"unavailable",reasonCode:"MESH_ADAPTER_UNAVAILABLE"};
  const controller=new AbortController(),boundedTimeout=Math.min(Math.max(timeoutMs,50),3000);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort("MESH_TIMEOUT");reject(adapterError("MESH_TIMEOUT"));},boundedTimeout);}),summary=await Promise.race([adapter.read({...input,signal:controller.signal}),timeout]);
    validate(summary,input.networkRelationshipId);
    return summary.provenance.some(item=>item.freshness==="stale")?{state:"stale",reasonCode:"MESH_LIVE_SUMMARY_STALE",summary}:{state:"ready",summary};
  }catch(error){
    if(controller.signal.aborted||code(error)==="MESH_TIMEOUT")return{state:"unavailable",reasonCode:"MESH_TIMEOUT"};
    if(code(error)==="MESH_FORBIDDEN")return{state:"denied",reasonCode:"MESH_FORBIDDEN"};
    if(code(error)==="MESH_SCHEMA_INCOMPATIBLE")return{state:"unavailable",reasonCode:"MESH_SCHEMA_INCOMPATIBLE"};
    return{state:"unavailable",reasonCode:"MESH_RESPONSE_INVALID"};
  }finally{if(timer)clearTimeout(timer);}
}

function validate(value:BusinessPartner360MeshNetworkSummary,relationshipId:string){
  if(!value||value.authorization?.decision!=="granted"||value.authorization.networkRelationshipId!==relationshipId||value.relationship?.id!==relationshipId)throw adapterError("MESH_FORBIDDEN");
  if(!value.authorization.permissionCode.startsWith("mesh."))throw adapterError("MESH_FORBIDDEN");
  if(!Array.isArray(value.provenance)||value.provenance.length<1||value.provenance.some(item=>item.authority!=="mesh"||item.schemaCode!=="mesh.network_summary"||item.schemaVersion!==1||item.fieldSetCode!=="relationship_publication_summary_v1"))throw adapterError("MESH_SCHEMA_INCOMPATIBLE");
  if(value.provenance.some(item=>!/^[a-f0-9]{64}$/.test(item.hash)||Number.isNaN(Date.parse(item.observedAt))))throw adapterError("MESH_RESPONSE_INVALID");
  if(/"(?:person|workforce|employee|employment|bankAccount|accountLast4|payload|evidence)"\s*:/i.test(JSON.stringify(value)))throw adapterError("MESH_RESPONSE_INVALID");
}
function code(error:unknown){return error&&typeof error==="object"&&"code" in error?String((error as {code:unknown}).code):undefined;}function adapterError(value:string){return Object.assign(new Error(value),{code:value});}
