import type { LocalProjectionRepository,PublicationCanonicalizer } from "@athyper/server-contract-publication";
import { BusinessPartnerDefinitionError } from "./business-partner-definition-service.js";
import { validateCompleteBusinessPartnerDefinition } from "./business-partner-definition-compiler.js";

export const BUSINESS_PARTNER_ONBOARDING_PUBLICATION_KEY="studio.business_partner.definition.business_partner.onboarding";

export class LocalBusinessPartnerDefinitionConsumer {
 constructor(private readonly options:{readonly local:Pick<LocalProjectionRepository,"findActiveBusinessPartnerDefinition">;readonly canonicalizer:PublicationCanonicalizer;readonly publicationKey?:string}){}
 async requestSchema(input:{readonly kind:string;readonly requestedRole?:string;readonly sourceKind:string}){
  const active=await this.active(),key=requestKey(input.kind,input.requestedRole),schema=active.bundle.requestSchemas[key];
  if(!record(schema))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_REQUEST_SCHEMA_MISSING",key);
  const source=input.sourceKind==="manual"?"internal":input.sourceKind,supported=schema["supportedSources"];
  if(!Array.isArray(supported)||!supported.includes(source))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SOURCE_MAPPING_MISSING",source);
  return{code:`neon.business_partner_request.${key}`,version:active.releaseNo,hash:this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes({bundleHash:active.bundleHash,key,schema}))};
 }
 async workflow(input:{readonly kind:string;readonly requestedRole?:string}){
  const active=await this.active(),journey=journeyFor(input.kind,input.requestedRole),definition=active.bundle.workflowDefinitions[journey];
  if(!record(definition)||!Array.isArray(definition["stages"])||!record(definition["stages"][0]))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_WORKFLOW_MISSING",journey);
  const stage=definition["stages"][0] as Record<string,unknown>,hash=this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes({bundleHash:active.bundleHash,journey,definition}));
  return{code:`neon.business_partner.${journey}.onboarding`,version:active.releaseNo,hash,stageCode:String(stage["code"]),stageName:String(stage["code"]).replaceAll("_"," "),definition};
 }
 async descriptors(){const active=await this.active();return{bundleHash:active.bundleHash,releaseNo:active.releaseNo,forms:active.bundle.formDescriptors,views:active.bundle.viewDescriptors};}
 private async active(){const projection=await this.options.local.findActiveBusinessPartnerDefinition?.(this.options.publicationKey??BUSINESS_PARTNER_ONBOARDING_PUBLICATION_KEY);if(!projection)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_LOCAL_ACTIVE_REQUIRED");validateCompleteBusinessPartnerDefinition(projection.bundle);return projection;}
}

export interface MeshOrganizationProfileSchema {readonly schemaVersion:number;readonly fieldSetCode:string;readonly allowedPaths:readonly string[];readonly prohibitedPatterns:readonly string[];readonly bundleHash:string;readonly releaseNo:number;}

export class LocalMeshBusinessPartnerDefinitionConsumer {
 constructor(private readonly options:{readonly local:Pick<LocalProjectionRepository,"findActiveBusinessPartnerDefinition">;readonly publicationKey?:string}){}
 async organizationProfileSchema():Promise<MeshOrganizationProfileSchema>{
  const projection=await this.options.local.findActiveBusinessPartnerDefinition?.(this.options.publicationKey??BUSINESS_PARTNER_ONBOARDING_PUBLICATION_KEY);
  if(!projection)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_LOCAL_ACTIVE_REQUIRED");
  const schema=projection.bundle.meshSafeSchemas["organizationProfile"];
  if(!record(schema)||!Number.isSafeInteger(schema["schemaVersion"])||Number(schema["schemaVersion"])<1||typeof schema["fieldSetCode"]!=="string"||!Array.isArray(schema["fields"])||schema["fields"].some(value=>typeof value!=="string")||!Array.isArray(schema["prohibitedPatterns"])||schema["prohibitedPatterns"].some(value=>typeof value!=="string"))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_MESH_SCHEMA_INVALID");
  return{schemaVersion:Number(schema["schemaVersion"]),fieldSetCode:String(schema["fieldSetCode"]),allowedPaths:schema["fields"] as string[],prohibitedPatterns:schema["prohibitedPatterns"] as string[],bundleHash:projection.bundleHash,releaseNo:projection.releaseNo};
 }
}

function requestKey(kind:string,role?:string){switch(kind){case"new_partner":return `${requiredRole(role)}.new`;case"add_supplier":return"supplier.add";case"add_customer":return"customer.add";case"add_workforce":return"workforce.add";case"configure_company":return`${commercialRole(role)}.company`;case"change_bank":return"supplier.bank";case"change_employment":return"workforce.change";case"amend_partner":return"partner.amend";case"assign_organization":return"partner.assign";case"deactivate":return"partner.deactivate";case"reactivate":return"partner.reactivate";case"archive":return"partner.archive";default:throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_REQUEST_KIND_UNDECLARED",kind);}}
function journeyFor(kind:string,role?:string){if(kind==="add_supplier"||kind==="change_bank")return"supplier";if(kind==="add_customer")return"customer";if(kind==="add_workforce"||kind==="change_employment")return"workforce";if(["amend_partner","assign_organization","deactivate","reactivate","archive"].includes(kind))return"governance";return requiredRole(role);}
function requiredRole(role?:string){if(role!=="supplier"&&role!=="customer"&&role!=="workforce")throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_ROLE_REQUIRED");return role;}
function commercialRole(role?:string){if(role!=="supplier"&&role!=="customer")throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_COMMERCIAL_ROLE_REQUIRED");return role;}
function record(value:unknown):value is Record<string,unknown>{return!!value&&typeof value==="object"&&!Array.isArray(value);}
