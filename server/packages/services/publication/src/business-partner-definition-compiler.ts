import type { BusinessPartnerDefinitionBundleV1,PublicationCanonicalizer,PublicationPlane } from "@athyper/server-contract-publication";
import { parseBusinessPartnerDefinitionBundle,BusinessPartnerDefinitionError } from "./business-partner-definition-service.js";

export const BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION="2.0.0";
export const BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS=Object.freeze(["supplier.new","supplier.add","supplier.qualify","supplier.company","supplier.bank","customer.new","customer.add","customer.credit","customer.company","workforce.new","workforce.add","workforce.change","workforce.offboard"] as const);
const sources=["internal","portal","mesh","import","api"] as const;
const journeys=["supplier","customer","workforce"] as const;

export interface BusinessPartnerDefinitionCompileReport {readonly schema:"athyper.business-partner-definition-compile-report.v1";readonly compilerVersion:string;readonly plane:PublicationPlane;readonly sourceBundleHash:string;readonly compiledBundleHash:string;readonly requestSchemaKeys:readonly string[];readonly mappingSources:readonly string[];readonly workflowJourneys:readonly string[];readonly omittedSections:readonly string[];readonly deterministic:true;readonly compatible:true;}

export function compileBusinessPartnerDefinition(input:{readonly bundle:unknown;readonly plane:PublicationPlane;readonly canonicalizer:PublicationCanonicalizer;readonly expectedSourceContractHashes?:Readonly<Record<string,string>>;readonly priorSemanticVersion?:string}){
 const source=validateCompleteBusinessPartnerDefinition(input.bundle);
 if(input.priorSemanticVersion&&compareVersions(source.semanticVersion,input.priorSemanticVersion)<=0)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN");
 if(input.expectedSourceContractHashes)for(const[key,hash]of Object.entries(input.expectedSourceContractHashes))if(source.sourceContractHashes[key]!==hash)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SOURCE_COMPATIBILITY_REJECTED",`BUSINESS_PARTNER_DEFINITION_SOURCE_COMPATIBILITY_REJECTED:${key}`);
 const sourceBundleHash=hash(input.canonicalizer,source),bundle=input.plane==="mesh"?meshProjection(source):source,compiledBundleHash=hash(input.canonicalizer,bundle);
 const report:BusinessPartnerDefinitionCompileReport={schema:"athyper.business-partner-definition-compile-report.v1",compilerVersion:BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION,plane:input.plane,sourceBundleHash,compiledBundleHash,requestSchemaKeys:Object.keys(bundle.requestSchemas).sort(),mappingSources:Object.keys(bundle.mappingContracts).sort(),workflowJourneys:Object.keys(bundle.workflowDefinitions).sort(),omittedSections:input.plane==="mesh"?["person_fields","workforce_schemas","neon_forms","neon_views","operational_workflows","readiness_policy"]:[],deterministic:true,compatible:true};
 return Object.freeze({bundle:Object.freeze(bundle),sourceBundleHash,compiledBundleHash,report:Object.freeze(report)});
}

export function validateCompleteBusinessPartnerDefinition(value:unknown):BusinessPartnerDefinitionBundleV1{
 const bundle=parseBusinessPartnerDefinitionBundle(value),requests=Object.keys(bundle.requestSchemas).sort();
 if(BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS.some(key=>!requests.includes(key)))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_REQUEST_MATRIX_INCOMPLETE");
 for(const source of sources)if(!(source in bundle.mappingContracts))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_MAPPING_MATRIX_INCOMPLETE",source);
 for(const journey of journeys)if(!(journey in bundle.workflowDefinitions)||!(journey in bundle.evidencePolicies)||!(journey in bundle.readinessGates))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_POLICY_MATRIX_INCOMPLETE",journey);
 if(!("organization" in bundle.fieldPolicies)||!("person" in bundle.fieldPolicies)||!("organization" in bundle.duplicateRules)||!("person" in bundle.duplicateRules))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_PARTY_POLICY_INCOMPLETE");
 if(!("organizationProfile" in bundle.meshSafeSchemas)||!("selectiveAcceptance" in bundle.meshSafeSchemas))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_MESH_SCHEMA_INCOMPLETE");
 if(!Object.keys(bundle.reasonCodeCatalog).length)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_REASON_CATALOG_EMPTY");
 return bundle;
}

function meshProjection(source:BusinessPartnerDefinitionBundleV1):BusinessPartnerDefinitionBundleV1{return{...source,requestSchemas:{"mesh.organizationProfile":source.meshSafeSchemas["organizationProfile"],"mesh.selectiveAcceptance":source.meshSafeSchemas["selectiveAcceptance"]},fieldPolicies:{organization:source.fieldPolicies["organization"]},validationDeclarations:source.validationDeclarations.filter(item=>item["appliesTo"]==="organization"||item["appliesTo"]==="all"),duplicateRules:{organization:source.duplicateRules["organization"]},formDescriptors:{},viewDescriptors:{},mappingContracts:{mesh:source.mappingContracts["mesh"]},workflowDefinitions:{},evidencePolicies:{},readinessGates:{},meshSafeSchemas:source.meshSafeSchemas};}
function hash(canonicalizer:PublicationCanonicalizer,value:unknown){return canonicalizer.sha256(canonicalizer.canonicalBytes(value));}
function compareVersions(left:string,right:string){const a=left.split(/[+-]/)[0]!.split(".").map(Number),b=right.split(/[+-]/)[0]!.split(".").map(Number);for(let index=0;index<3;index++){const delta=(a[index]??0)-(b[index]??0);if(delta)return delta;}return 0;}
