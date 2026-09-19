import type{SecretStore}from"@athyper/server-contract-secrets";
import type{BusinessPartnerProtectedValueResolver}from"./business-partner-360-service.js";

/** Resolves opaque tokens beneath a tenant namespace; raw values and cross-tenant lookup are impossible. */
export function createSecretStoreProtectedValueResolver(secrets:SecretStore):BusinessPartnerProtectedValueResolver{return{async reveal(input){
  if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,511}$/.test(input.token)||input.token.includes("..")||input.token.includes("//"))throw protectedError("PROTECTED_VALUE_REFERENCE_INVALID");
  const resolved=await secrets.resolve(`protected-values/${input.tenantId}/${input.token}`),value=new TextDecoder("utf-8",{fatal:true}).decode(resolved.bytes);
  if(!value||value.length>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw protectedError("PROTECTED_VALUE_INVALID");
  return value;
}};}

function protectedError(code:string){return Object.assign(new Error(code),{code});}
