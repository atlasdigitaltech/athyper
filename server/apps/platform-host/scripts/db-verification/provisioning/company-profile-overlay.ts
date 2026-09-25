/** Pin unrelated live artifacts; publish only the BP-owned company-profile read contract. */
export const companyProfileArtifactKeys=["supplier_company_profile/core","customer_company_profile/core","business_partner/presentation.section.supplier-company","business_partner/presentation.section.customer-company","business_partner/core","business_partner/presentation.detail"] as const;
type Json=Record<string,any>;
export const capabilityArtifactKeys=[...companyProfileArtifactKeys,'business_partner/operation'] as const;
export function capabilityOverlay(baseline:readonly Json[],sources:readonly Json[]):Json[]{
 if(sources.length!==capabilityArtifactKeys.length||new Set(sources.map(s=>s.artifactKey)).size!==capabilityArtifactKeys.length)throw Error('CAPABILITY_OVERLAY_SCOPE_INVALID');
 const source=sources.find(s=>s.artifactKey==='business_partner/operation');
 const result=companyProfileOverlay(baseline,sources.filter(s=>s.artifactKey!=='business_partner/operation'));
 const target=result.find(s=>s.artifactKey==='business_partner/operation');
 if(!target?.operations||!source?.operations)throw Error('CAPABILITY_OPERATION_BASELINE_REQUIRED');
 for(const role of ['supplier','customer']){
  const key=`capability_${role}_manage`,op=source.operations.find((o:Json)=>o.key===key);
  if(op?.permissionCode!==`neon.relationship.business_partner.${key}`||op.execution?.handlerKey!==`neon.bp.capability.${role}.v1`||op.idempotency!=='required')throw Error('CAPABILITY_OPERATION_CONTRACT_INVALID');
  const i=target.operations.findIndex((o:Json)=>o.key===key);
  if(i<0)target.operations.push(structuredClone(op));else target.operations[i]=structuredClone(op);
 }
 return result;
}
export function companyProfileOverlay(baseline:readonly Json[],sources:readonly Json[]):Json[]{
 const source=new Map(sources.map(x=>[x.artifactKey,x]));
 if(sources.length!==companyProfileArtifactKeys.length||source.size!==companyProfileArtifactKeys.length||companyProfileArtifactKeys.some(k=>!source.has(k)))throw Error("COMPANY_PROFILE_OVERLAY_SCOPE_INVALID");
 const result=structuredClone([...baseline]);
 for(const key of companyProfileArtifactKeys.slice(0,4)){
  const index=result.findIndex(x=>x.artifactKey===key);if(index<0)throw Error("COMPANY_PROFILE_BASELINE_REQUIRED");
  const proposed=structuredClone(source.get(key)!);
  if(key.endsWith('/core')){
   if(proposed.storage?.genericWriteEnabled!==false||!proposed.fields?.some((f:Json)=>f.key==='business_partner_id'&&f.binding?.column==='business_partner_id'))throw Error("COMPANY_PROFILE_READ_CONTRACT_REQUIRED");
   result[index]=proposed;
  }else result[index].fieldBindings=proposed.fieldBindings;
 }
 const bp=result.find(x=>x.artifactKey==='business_partner/core'),proposed=source.get('business_partner/core')!;
 if(!bp?.fields||!bp?.relations)throw Error("COMPANY_PROFILE_BP_BASELINE_REQUIRED");
 for(const key of ['supplier_enabled','customer_enabled']){
  const field=proposed.fields.find((f:Json)=>f.key===key);
  if(!field||field.writePolicy!=='system_managed')throw Error("COMPANY_PROFILE_CAPABILITY_READ_ONLY_REQUIRED");
  const index=bp.fields.findIndex((f:Json)=>f.key===key);if(index<0)bp.fields.push(field);else bp.fields[index]=field;
 }
 for(const role of ['supplier','customer']){
  const key=`business_partner.${role}_company_profile`,relation=proposed.relations.find((r:Json)=>r.relationKey===key);
  const index=bp.relations.findIndex((r:Json)=>r.relationKey===key);
  if(!relation||index<0)throw Error("COMPANY_PROFILE_RELATION_REQUIRED");bp.relations[index]=relation;
 }
 const detail=result.find(x=>x.artifactKey==='business_partner/presentation.detail');
 const tab=source.get('business_partner/presentation.detail')?.navigation?.tabs?.find((t:Json)=>t.key==='roles');
 const index=detail?.navigation?.tabs?.findIndex((t:Json)=>t.key==='roles');
 if(!tab||index===undefined||index<0)throw Error("COMPANY_PROFILE_NAVIGATION_REQUIRED");
 detail.navigation.tabs[index]=structuredClone(tab);
 return result;
}
