import type{BusinessPartner360DefinitionResolver}from"./business-partner-360-service.js";

/** Keeps the last verified, parse-compatible definition available during projection rollback/outage. */
export function createLastValidBusinessPartner360DefinitionResolver(delegate:BusinessPartner360DefinitionResolver):BusinessPartner360DefinitionResolver{
  let lastValid:Awaited<ReturnType<BusinessPartner360DefinitionResolver["resolve"]>>|undefined;
  return{async resolve(){try{const candidate=await delegate.resolve();validate(candidate);lastValid=structuredClone(candidate);return candidate;}catch(error){if(lastValid)return structuredClone(lastValid);throw error;}}};
}

function validate(value:Awaited<ReturnType<BusinessPartner360DefinitionResolver["resolve"]>>){
  if(!value||value.code!=="business_partner.onboarding"||typeof value.version!=="string"||!value.version||!/^[a-f0-9]{64}$/.test(value.hash))throw Object.assign(new Error("BP_360_DEFINITION_INCOMPATIBLE"),{code:"BP_360_DEFINITION_INCOMPATIBLE"});
  if("packs"in value&&(!Array.isArray(value.packs)||value.packs.length===0))throw Object.assign(new Error("BP_360_DEFINITION_INCOMPATIBLE"),{code:"BP_360_DEFINITION_INCOMPATIBLE"});
}
