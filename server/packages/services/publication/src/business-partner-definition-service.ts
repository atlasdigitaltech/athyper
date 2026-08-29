import { randomUUID } from "node:crypto";
import {
  BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1,
  type BusinessPartnerDefinitionBundleV1,
  type PublicationAuthorityRepository,
  type PublicationCanonicalizer,
  type PublicationPlane,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";

type Database=Record<string,never>;type Row=Record<string,unknown>;

export class BusinessPartnerDefinitionError extends Error {
  constructor(readonly code:string,message=code){super(message);this.name="BusinessPartnerDefinitionError";}
}

export class BusinessPartnerDefinitionService {
  constructor(private readonly options:{readonly database:Kysely<Database>;readonly authority:PublicationAuthorityRepository;readonly canonicalizer:PublicationCanonicalizer}){}

  async author(input:{readonly tenantId:string;readonly actorId:string;readonly idempotencyKey:string;readonly bundle:unknown;readonly targetPlanes:readonly PublicationPlane[]}){
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

  async get(tenantId:string,revisionId:string){const result=await sql<Row>`SELECT * FROM snapshot.business_partner_definition_revision WHERE tenant_id=${tenantId}::uuid AND id=${revisionId}::uuid`.execute(this.options.database);return result.rows[0]?mapRevision(result.rows[0]):null;}

  async publish(input:{readonly tenantId:string;readonly revisionId:string;readonly actorId:string;readonly idempotencyKey:string;readonly minimumRuntimeVersion?:string}){
    const revisionResult=await sql<Row>`SELECT * FROM snapshot.business_partner_definition_revision WHERE tenant_id=${input.tenantId}::uuid AND id=${input.revisionId}::uuid`.execute(this.options.database);
    const revision=revisionResult.rows[0];if(!revision)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_NOT_FOUND");
    if(text(revision,"created_by")===input.actorId)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SELF_PUBLISH_FORBIDDEN");
    const key=`studio.business_partner.definition.${text(revision,"bundle_code")}`,publishKey=required(input.idempotencyKey,"idempotencyKey");
    const releaseId=await this.options.database.transaction().execute(async transaction=>{
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(transaction);
      const replay=await sql<Row>`SELECT publication_release_id,definition_revision_id FROM publication.business_partner_definition_release_link WHERE publish_idempotency_key=${publishKey}`.execute(transaction);
      if(replay.rows[0]){if(text(replay.rows[0],"definition_revision_id")!==input.revisionId)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_PUBLISH_IDEMPOTENCY_CONFLICT");return text(replay.rows[0],"publication_release_id");}
      const numberResult=await sql<Row>`SELECT COALESCE(max(release_no),0)+1 release_no FROM publication.release WHERE release_key=${key}`.execute(transaction);
      const releaseNo=Number(numberResult.rows[0]?.["release_no"]);const id=randomUUID();
      const manifestHash=this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes({revisionId:input.revisionId,bundleHash:text(revision,"bundle_hash"),releaseNo,targetPlanes:revision["target_planes"]}));
      await sql`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
        VALUES(${id}::uuid,${input.tenantId}::uuid,${key},${releaseNo},'publish','preparing','backward_compatible',${text(revision,"bundle_hash")},${manifestHash},${input.minimumRuntimeVersion??null},${input.actorId}::uuid,${JSON.stringify({publishIdempotencyKey:publishKey,definitionSemanticVersion:text(revision,"semantic_version")})}::jsonb)`.execute(transaction);
      await sql`INSERT INTO publication.business_partner_definition_release_link(publication_release_id,definition_revision_id,publish_idempotency_key,created_by) VALUES(${id}::uuid,${input.revisionId}::uuid,${publishKey},${input.actorId}::uuid)`.execute(transaction);
      return id;
    });
    const release=await this.options.authority.getRelease(releaseId);if(!release)throw new BusinessPartnerDefinitionError("PUBLICATION_RELEASE_NOT_FOUND");
    return release.status==="preparing"?this.options.authority.transitionRelease({releaseId:release.id,status:"approved",actorId:input.actorId,evidence:{definitionRevisionId:input.revisionId,noSelfPublish:true}}):release;
  }
}

export function parseBusinessPartnerDefinitionBundle(value:unknown):BusinessPartnerDefinitionBundleV1{
  if(!record(value)||value.schema!==BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1)throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_SCHEMA_INVALID");
  const bundleCode=required(value.bundleCode,"bundleCode"),semanticVersion=required(value.semanticVersion,"semanticVersion");
  if(!/^[a-z][a-z0-9_.-]{1,126}$/.test(bundleCode)||!/^[0-9]+\.[0-9]+\.[0-9]+(?:[+-][A-Za-z0-9.-]+)?$/.test(semanticVersion))throw new BusinessPartnerDefinitionError("BUSINESS_PARTNER_DEFINITION_VERSION_INVALID");
  for(const key of ["requestSchemas","formDescriptors","viewDescriptors","mappingContracts","workflowDefinitions","compatibilityRules","sourceContractHashes"] as const)if(!record(value[key]))throw new BusinessPartnerDefinitionError(`BUSINESS_PARTNER_DEFINITION_${key.toUpperCase()}_INVALID`);
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
