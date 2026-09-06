import { randomUUID } from "node:crypto";
import {
  BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,
  type BusinessPartnerDefinitionBundleV1,
  type PublicationAuthorityRepository,
  type PublicationCanonicalizer,
  type PublicationPlane,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";
import { compileBusinessPartnerDefinition } from "./business-partner-definition-compiler.js";

type Database=Record<string,never>;type Row=Record<string,unknown>;

export class BusinessPartnerDefinitionError extends Error {
  constructor(readonly code:string,message=code){super(message);this.name="BusinessPartnerDefinitionError";}
}

export class BusinessPartnerDefinitionService {
  constructor(private readonly options:{readonly database:Kysely<Database>;readonly authority:PublicationAuthorityRepository;readonly canonicalizer:PublicationCanonicalizer}){}

  private async scoped<T>(tenantId:string,actorId:string|undefined,work:(service:BusinessPartnerDefinitionService)=>Promise<T>):Promise<T>{
    return this.options.database.transaction().execute(async database=>{
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${actorId??""},true)`.execute(database);
      return work(new BusinessPartnerDefinitionService({...this.options,database,authority:new KyselyPublicationAuthorityRepository(database)}));
    });
  }
  author(input:Parameters<BusinessPartnerDefinitionService["authorScoped"]>[0]){return this.scoped(input.tenantId,input.actorId,service=>service.authorScoped(input));}
  get(tenantId:string,revisionId:string){return this.scoped(tenantId,undefined,service=>service.getScoped(tenantId,revisionId));}
  publish(input:Parameters<BusinessPartnerDefinitionService["publishScoped"]>[0]){return this.scoped(input.tenantId,input.actorId,service=>service.publishScoped(input));}

  private async authorScoped(input:{readonly tenantId:string;readonly actorId:string;readonly idempotencyKey:string;readonly bundle:unknown;readonly targetPlanes:readonly PublicationPlane[]}){
    const bundle=parseBusinessPartnerDefinitionBundle(input.bundle);const targetPlanes=uniquePlanes(input.targetPlanes);
    const bundleHash=this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(bundle));
    const id=randomUUID();
    const inserted=await sql<Row>`INSERT INTO snapshot.business_partner_definition_revision
      (id,tenant_id,bundle_code,semantic_version,bundle_schema_version,bundle_json,bundle_hash,target_planes,idempotency_key,created_by)
      VALUES(${id}::uuid,${input.tenantId}::uuid,${bundle.bundleCode},${bundle.semanticVersion},'1.0.0',${JSON.stringify(bundle)}::jsonb,${bundleHash},${targetPlanes}::text[],${required(input.idempotencyKey,"idempotencyKey")},${input.actorId}::uuid)
      ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`.execute(this.options.database);
    const selected=inserted.rows[0]??(await sql<Row>`SELECT * FROM snapshot.business_partner_definition_revision WHERE tenant_id=${input.tenantId}::uuid AND idempotency_key=${input.idempotencyKey}`.execute(this.options.database)).rows[0];
    if(!selected)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_AUTHOR_FAILED");
    if(text(selected,"bundle_hash")!==bundleHash)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_IDEMPOTENCY_CONFLICT");
    return mapRevision(selected);
  }

  private async getScoped(tenantId:string,revisionId:string){const result=await sql<Row>`SELECT * FROM snapshot.business_partner_definition_revision WHERE tenant_id=${tenantId}::uuid AND id=${revisionId}::uuid`.execute(this.options.database);return result.rows[0]?mapRevision(result.rows[0]):null;}

  async simulate(input:{readonly tenantId:string;readonly bundle:unknown;readonly targetPlanes:readonly PublicationPlane[];readonly againstRevisionId?:string}){
    const prior=input.againstRevisionId?await this.get(input.tenantId,input.againstRevisionId):null;
    if(input.againstRevisionId&&!prior)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_NOT_FOUND");
    return simulateBusinessPartnerDefinition({bundle:input.bundle,targetPlanes:input.targetPlanes,canonicalizer:this.options.canonicalizer,...(prior?{prior:{revisionId:prior.id,bundle:prior.bundle}}:{})});
  }

  private async publishScoped(input:{readonly tenantId:string;readonly revisionId:string;readonly actorId:string;readonly idempotencyKey:string;readonly minimumRuntimeVersion?:string}){
    const revisionResult=await sql<Row>`SELECT * FROM snapshot.business_partner_definition_revision WHERE tenant_id=${input.tenantId}::uuid AND id=${input.revisionId}::uuid`.execute(this.options.database);
    const revision=revisionResult.rows[0];if(!revision)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_NOT_FOUND");
    if(text(revision,"created_by")===input.actorId)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SELF_PUBLISH_FORBIDDEN");
    const prior=(await sql<Row>`SELECT prior.semantic_version,prior.bundle_json FROM snapshot.business_partner_definition_revision prior JOIN publication.business_partner_definition_release_link link ON link.definition_revision_id=prior.id JOIN publication.release release ON release.id=link.publication_release_id WHERE prior.tenant_id=${input.tenantId}::uuid AND prior.bundle_code=${text(revision,"bundle_code")} AND prior.id<>${input.revisionId}::uuid AND release.status IN('approved','published') ORDER BY release.release_no DESC LIMIT 1`.execute(this.options.database)).rows[0];
    if(prior){if(compareVersions(text(revision,"semantic_version"),text(prior,"semantic_version"))<=0)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN");assertBackwardCompatible(parseBusinessPartnerDefinitionBundle(revision["bundle_json"]),parseBusinessPartnerDefinitionBundle(prior["bundle_json"]));}
    const key=`studio.business_partner.definition.${text(revision,"bundle_code")}`,publishKey=required(input.idempotencyKey,"idempotencyKey");
    const releaseId=await (async (transaction:Kysely<Database>)=>{
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(transaction);
      const replay=await sql<Row>`SELECT publication_release_id,definition_revision_id FROM publication.business_partner_definition_release_link WHERE publish_idempotency_key=${publishKey}`.execute(transaction);
      if(replay.rows[0]){if(text(replay.rows[0],"definition_revision_id")!==input.revisionId)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_PUBLISH_IDEMPOTENCY_CONFLICT");return text(replay.rows[0],"publication_release_id");}
      const existing=await sql<Row>`SELECT publication_release_id FROM publication.business_partner_definition_release_link WHERE definition_revision_id=${input.revisionId}::uuid`.execute(transaction);
      if(existing.rows[0])return text(existing.rows[0],"publication_release_id");
      const numberResult=await sql<Row>`SELECT COALESCE(max(release_no),0)+1 release_no FROM publication.release WHERE release_key=${key}`.execute(transaction);
      const releaseNo=Number(numberResult.rows[0]?.["release_no"]);const id=randomUUID();
      const manifestHash=this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes({revisionId:input.revisionId,bundleHash:text(revision,"bundle_hash"),releaseNo,targetPlanes:revision["target_planes"]}));
      await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
        VALUES(${id}::uuid,${input.tenantId}::uuid,${key},${releaseNo},'publish','preparing','backward_compatible',${text(revision,"bundle_hash")},${manifestHash},${input.minimumRuntimeVersion??null},${input.actorId}::uuid,${JSON.stringify({publishIdempotencyKey:publishKey,definitionSemanticVersion:text(revision,"semantic_version")})}::jsonb)`.execute(transaction);
      await sql`INSERT INTO publication.business_partner_definition_release_link(publication_release_id,definition_revision_id,publish_idempotency_key,created_by) VALUES(${id}::uuid,${input.revisionId}::uuid,${publishKey},${input.actorId}::uuid)`.execute(transaction);
      return id;
    })(this.options.database);
    const release=await this.options.authority.getRelease(releaseId);if(!release)throw new BusinessPartnerDefinitionError("PUBLICATION_RELEASE_NOT_FOUND");
    return release.status==="preparing"?this.options.authority.transitionRelease({releaseId:release.id,status:"approved",actorId:input.actorId,evidence:{definitionRevisionId:input.revisionId,noSelfPublish:true}}):release;
  }
}

export function simulateBusinessPartnerDefinition(input:{readonly bundle:unknown;readonly targetPlanes:readonly PublicationPlane[];readonly canonicalizer:PublicationCanonicalizer;readonly prior?:{readonly revisionId:string;readonly bundle:unknown}}){
  const bundle=parseBusinessPartnerDefinitionBundle(input.bundle),targetPlanes=uniquePlanes(input.targetPlanes),prior=input.prior?parseBusinessPartnerDefinitionBundle(input.prior.bundle):undefined;
  if(prior){
    if(prior.bundleCode!==bundle.bundleCode)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_BUNDLE_MISMATCH");
    if(compareVersions(bundle.semanticVersion,prior.semanticVersion)<=0)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_DOWNGRADE_FORBIDDEN");
    assertBackwardCompatible(bundle,prior);
  }
  const planes=targetPlanes.map(plane=>{
    const compiled=compileBusinessPartnerDefinition({bundle,plane,canonicalizer:input.canonicalizer,...(prior?{priorSemanticVersion:prior.semanticVersion}:{})});
    return Object.freeze({plane,sourceBundleHash:compiled.sourceBundleHash,compiledBundleHash:compiled.compiledBundleHash,report:compiled.report});
  });
  return Object.freeze({schema:"athyper.business-partner-definition-simulation/1" as const,readOnly:true,publicationAuthorized:false,bundleCode:bundle.bundleCode,semanticVersion:bundle.semanticVersion,...(input.prior?{againstRevisionId:input.prior.revisionId,againstSemanticVersion:prior!.semanticVersion}:{}),compatible:true as const,planes:Object.freeze(planes)});
}

export function parseBusinessPartnerDefinitionBundle(value:unknown):BusinessPartnerDefinitionBundleV1{
  if(!record(value)||value.schema!==BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SCHEMA_INVALID");
  const bundleCode=required(value.bundleCode,"bundleCode"),semanticVersion=required(value.semanticVersion,"semanticVersion");
  if(!/^[a-z][a-z0-9_.-]{1,126}$/.test(bundleCode)||!/^[0-9]+\.[0-9]+\.[0-9]+(?:[+-][A-Za-z0-9.-]+)?$/.test(semanticVersion))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_VERSION_INVALID");
  for(const key of ["requestSchemas","fieldPolicies","duplicateRules","formDescriptors","viewDescriptors","mappingContracts","workflowDefinitions","evidencePolicies","readinessGates","reasonCodeCatalog","meshSafeSchemas","compatibilityRules","sourceContractHashes"] as const)if(!record(value[key]))throw new BusinessPartnerDefinitionError(`BUSINESS_PARTNER_DEFINITION_${key.toUpperCase()}_INVALID`);
  if(!Array.isArray(value.validationDeclarations)||value.validationDeclarations.some(item=>!record(item)))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_VALIDATIONS_INVALID");
  for(const hash of Object.values(value.sourceContractHashes as Record<string,unknown>))if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SOURCE_HASH_INVALID");
  const forbidden=JSON.stringify(value);if(/bankAccount|accountNumber|routingNumber|taxIdentifierValue|partnerInstance/i.test(forbidden))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_INSTANCE_DATA_FORBIDDEN");
  return value as unknown as BusinessPartnerDefinitionBundleV1;
}

function uniquePlanes(value:readonly PublicationPlane[]){const planes=[...new Set(value)];if(!planes.length||planes.some(p=>p!=="studio"&&p!=="neon"&&p!=="mesh"))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_TARGET_PLANES_INVALID");return planes;}
function mapRevision(row:Row){return{id:text(row,"id"),tenantId:text(row,"tenant_id"),bundleCode:text(row,"bundle_code"),semanticVersion:text(row,"semantic_version"),bundleSchemaVersion:text(row,"bundle_schema_version"),bundleHash:text(row,"bundle_hash"),bundle:row["bundle_json"],targetPlanes:row["target_planes"],createdAt:date(row,"created_at"),createdBy:text(row,"created_by")};}
function record(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function required(value:unknown,label:string){if(typeof value!=="string"||!value.trim())throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_INPUT_INVALID",`${label} is required`);return value.trim();}
function text(row:Row,key:string){const value=row[key];if(typeof value!=="string"||!value)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_ROW_INVALID",key);return value;}
function date(row:Row,key:string){const value=row[key];const parsed=value instanceof Date?value:new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_ROW_INVALID",key);return parsed.toISOString();}
function compareVersions(left:string,right:string){const a=left.split(/[+-]/)[0]!.split(".").map(Number),b=right.split(/[+-]/)[0]!.split(".").map(Number);for(let i=0;i<3;i++){const delta=(a[i]??0)-(b[i]??0);if(delta)return delta;}return 0;}
function assertBackwardCompatible(current:BusinessPartnerDefinitionBundleV1,prior:BusinessPartnerDefinitionBundleV1){for(const key of Object.keys(prior.requestSchemas))if(!(key in current.requestSchemas))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_REQUIRED_SCHEMA_REMOVED",key);for(const journey of Object.keys(prior.workflowDefinitions)){const before=record(prior.workflowDefinitions[journey])&&Array.isArray((prior.workflowDefinitions[journey] as Record<string,unknown>)["stages"])?(prior.workflowDefinitions[journey] as Record<string,unknown>)["stages"] as unknown[]:[],after=record(current.workflowDefinitions[journey])&&Array.isArray((current.workflowDefinitions[journey] as Record<string,unknown>)["stages"])?(current.workflowDefinitions[journey] as Record<string,unknown>)["stages"] as unknown[]:[];const codes=new Set(after.filter(record).map(stage=>stage["code"]));if(before.filter(record).some(stage=>!codes.has(stage["code"])))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_WORKFLOW_STAGE_REMOVED",journey);}}
