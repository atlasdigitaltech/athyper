import type{SecretStore}from"@athyper/server-contract-secrets";
import type{BusinessPartner360MeshNetworkSummary}from"@athyper/server-contract-master-data";
import type{BusinessPartner360MeshNetworkAdapter}from"./business-partner-360-mesh-network-adapter.js";

/** Service-to-service transport; the MESH endpoint performs its own principal/relationship authorization. */
export function createHttpBusinessPartner360MeshNetworkAdapter(options:{readonly baseUrl:string;readonly credentialReference:string;readonly secrets:SecretStore;readonly fetch?:typeof fetch}):BusinessPartner360MeshNetworkAdapter{
 const base=new URL(options.baseUrl);if(base.protocol!=="https:"&&!(["localhost","127.0.0.1","::1"].includes(base.hostname)))throw new TypeError("BP360 MESH live transport requires HTTPS");
 const transport=options.fetch??fetch;
 return{async read(input){const credential=await options.secrets.resolve(options.credentialReference),token=new TextDecoder("utf-8",{fatal:true}).decode(credential.bytes);if(!token)throw coded("MESH_CREDENTIAL_UNAVAILABLE");const response=await transport(new URL("/api/mesh/v1/business-partner/network-summary",base),{method:"POST",signal:input.signal,headers:{authorization:`Bearer ${token}`,"content-type":"application/json","x-athyper-principal-id":input.context.principalId,"x-athyper-recipient-tenant-id":input.context.tenantId,"x-athyper-request-id":input.context.requestId},body:JSON.stringify({sourceTenantId:input.sourceTenantId,sourceNetworkAccountId:input.sourceNetworkAccountId,recipientNetworkAccountId:input.recipientNetworkAccountId,networkRelationshipId:input.networkRelationshipId})});if(response.status===403||response.status===404)throw coded("MESH_FORBIDDEN");if(!response.ok)throw coded("MESH_UNAVAILABLE");const value=await response.json();return value as BusinessPartner360MeshNetworkSummary;}};
}
function coded(code:string){return Object.assign(new Error(code),{code});}
