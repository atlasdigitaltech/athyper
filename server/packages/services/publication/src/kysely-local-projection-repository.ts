import {
  PublicationContractError,
  type ActiveEntityProjection,
  type BusinessPartnerDefinitionProjection,
  type ActiveReleaseProjection,
  type AppliedReleaseProjection,
  type LocalProjectionRepository,
  type PublicationArtifactDocumentV1,
  type PublicationDeploymentBundle,
  type PublicationVerificationEvidence,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

export class KyselyLocalProjectionRepository implements LocalProjectionRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async stage(input: { readonly deployment: PublicationDeploymentBundle; readonly artifact: PublicationArtifactDocumentV1 }): Promise<AppliedReleaseProjection> {
    assertArtifactCoordinates(input.deployment,input.artifact);
    const envelope=input.artifact.envelope;
    const result=await sql<Row>`SELECT * FROM runtime_meta.fn_stage_release_projection(
      ${envelope.publicationKey},${envelope.releaseId}::uuid,${envelope.releaseNo},${input.deployment.deploymentId}::uuid,
      ${input.deployment.artifactHash},${JSON.stringify(input.artifact.manifest)}::jsonb,${JSON.stringify(projectionJson(input.artifact))}::jsonb
    )`.execute(this.database);
    return mapApplied(required(result.rows[0],"APPLIED_RELEASE_NOT_FOUND"));
  }

  async verify(input:{readonly appliedReleaseId:string;readonly computedArtifactHash:string;readonly evidence:PublicationVerificationEvidence}):Promise<AppliedReleaseProjection>{
    const result=await sql<Row>`SELECT * FROM runtime_meta.fn_verify_release(${input.appliedReleaseId}::uuid,${input.computedArtifactHash},${JSON.stringify(verificationJson(input.evidence))}::jsonb)`.execute(this.database);
    return mapApplied(required(result.rows[0],"APPLIED_RELEASE_NOT_FOUND"));
  }

  async activate(input:{readonly appliedReleaseId:string;readonly evidence?:Readonly<Record<string,unknown>>}):Promise<ActiveReleaseProjection>{
    await sql`SELECT runtime_meta.fn_activate_release(${input.appliedReleaseId}::uuid,${JSON.stringify(input.evidence??{})}::jsonb)`.execute(this.database);
    const release=await this.findById(input.appliedReleaseId);
    if(!release||release.status!=="active"||!release.activatedAt)throw new Error("LOCAL_ACTIVATION_HEAD_MISMATCH");
    return {...release,status:"active",activatedAt:release.activatedAt};
  }

  async findByDeployment(deploymentId:string):Promise<AppliedReleaseProjection|null>{const result=await sql<Row>`SELECT * FROM runtime_meta.applied_release WHERE deployment_id=${deploymentId}::uuid`.execute(this.database);return result.rows[0]?mapApplied(result.rows[0]):null;}

  async findActive(publicationKey:string):Promise<ActiveReleaseProjection|null>{
    const result=await sql<Row>`SELECT * FROM runtime_meta.fn_active_release(${publicationKey})`.execute(this.database);const row=result.rows[0];if(!row)return null;
    return {id:string(row,"applied_release_id"),publicationKey,deploymentId:await this.deploymentId(string(row,"applied_release_id")),sourceReleaseId:string(row,"source_release_id"),sourceReleaseNo:number(row,"source_release_no"),artifactHash:string(row,"artifact_hash"),status:"active",stagedAt:await this.stagedAt(string(row,"applied_release_id")),activatedAt:date(row,"activated_at")};
  }

  async findActiveEntity(publicationKey:string):Promise<ActiveEntityProjection|null>{
    const result=await sql<Row>`SELECT * FROM runtime_meta.fn_active_entity_descriptor(${publicationKey},'entity_runtime')`.execute(this.database);const row=result.rows[0];if(!row)return null;
    const tenantId=nullableString(row,"tenant_id");return{entityContractId:string(row,"entity_contract_id"),entityDescriptorId:string(row,"entity_descriptor_id"),...(tenantId?{tenantId}:{}),entityId:string(row,"entity_id"),entityCode:string(row,"entity_code"),releaseId:string(row,"release_id"),releaseNo:number(row,"release_no"),contractHash:string(row,"contract_hash"),contract:object(row,"contract_json"),plane:string(row,"plane_code") as ActiveEntityProjection["plane"],descriptorKind:"entity_runtime",compiledHash:string(row,"compiled_hash"),descriptor:object(row,"compiled_json"),activatedAt:date(row,"activated_at")};
  }

  async findActiveBusinessPartnerDefinition(publicationKey:string):Promise<BusinessPartnerDefinitionProjection|null>{
    const result=await sql<Row>`SELECT active.*,payload.coordinates->>'source_bundle_hash' source_bundle_hash,payload.coordinates->'compile_report' compile_report FROM runtime_meta.fn_active_business_partner_definition(${publicationKey}) active JOIN runtime_meta.applied_release_payload payload ON payload.id=active.id`.execute(this.database);const row=result.rows[0];if(!row)return null;
    return{id:string(row,"id"),tenantId:string(row,"tenant_id"),revisionId:string(row,"revision_id"),releaseId:string(row,"release_id"),releaseNo:number(row,"release_no"),publicationKey:string(row,"publication_key"),plane:string(row,"plane_code") as BusinessPartnerDefinitionProjection["plane"],bundleCode:string(row,"bundle_code"),semanticVersion:string(row,"semantic_version"),bundleSchemaVersion:string(row,"bundle_schema_version"),bundleHash:string(row,"bundle_hash"),sourceBundleHash:string(row,"source_bundle_hash"),bundle:object(row,"bundle_json") as unknown as BusinessPartnerDefinitionProjection["bundle"],compileReport:object(row,"compile_report"),generatedAt:date(row,"generated_at")};
  }

  async rollback(input:{readonly publicationKey:string;readonly targetAppliedReleaseId:string;readonly evidence?:Readonly<Record<string,unknown>>}):Promise<ActiveReleaseProjection>{
    await sql`SELECT runtime_meta.fn_rollback_release(${input.publicationKey},${input.targetAppliedReleaseId}::uuid,${JSON.stringify(input.evidence??{})}::jsonb)`.execute(this.database);
    const release=await this.findById(input.targetAppliedReleaseId);if(!release||release.status!=="active"||!release.activatedAt)throw new Error("LOCAL_ROLLBACK_HEAD_MISMATCH");return{...release,status:"active",activatedAt:release.activatedAt};
  }

  private async findById(id:string){const result=await sql<Row>`SELECT * FROM runtime_meta.applied_release WHERE id=${id}::uuid`.execute(this.database);return result.rows[0]?mapApplied(result.rows[0]):null;}
  private async deploymentId(id:string){const result=await sql<Row>`SELECT deployment_id FROM runtime_meta.applied_release WHERE id=${id}::uuid`.execute(this.database);return string(required(result.rows[0],"APPLIED_RELEASE_NOT_FOUND"),"deployment_id");}
  private async stagedAt(id:string){const result=await sql<Row>`SELECT staged_at FROM runtime_meta.applied_release WHERE id=${id}::uuid`.execute(this.database);return date(required(result.rows[0],"APPLIED_RELEASE_NOT_FOUND"),"staged_at");}
}

function assertArtifactCoordinates(deployment:PublicationDeploymentBundle,artifact:PublicationArtifactDocumentV1){const envelope=artifact.envelope;const payloadPlane=envelope.artifactKind==="entity_runtime"?envelope.payload.entityDescriptor.plane:envelope.payload.plane;if(envelope.targetPlane!==deployment.targetPlane||envelope.targetPlane!==payloadPlane)throw new PublicationContractError("ARTIFACT_PLANE_INVALID","Artifact target plane does not match deployment");if(envelope.releaseId!==deployment.sourceReleaseId||envelope.releaseNo!==deployment.sourceReleaseNo||envelope.publicationKey!==deployment.publicationKey)throw new PublicationContractError("ARTIFACT_COORDINATES_INVALID","Artifact release coordinates do not match deployment");if(artifact.manifest.targetPlane!==envelope.targetPlane||artifact.manifest.releaseId!==envelope.releaseId||artifact.manifest.artifactKind!==envelope.artifactKind)throw new PublicationContractError("ARTIFACT_COORDINATES_INVALID","Artifact manifest coordinates do not match envelope");}
function projectionJson(artifact:PublicationArtifactDocumentV1){const envelope=artifact.envelope;if(envelope.artifactKind==="business_partner_definition_bundle"){const b=envelope.payload;return{applied_release_payload:{id:b.id,tenant_id:b.tenantId,artifact_kind:envelope.artifactKind,payload_schema_version:b.bundleSchemaVersion,payload_hash:b.bundleHash,payload_json:b.bundle,coordinates:{revision_id:b.revisionId,release_id:b.releaseId,release_no:b.releaseNo,publication_key:b.publicationKey,plane_code:b.plane,bundle_code:b.bundleCode,semantic_version:b.semanticVersion,source_bundle_hash:b.sourceBundleHash,compile_report:b.compileReport},generated_at:b.generatedAt}};}const c=envelope.payload.entityContract,d=envelope.payload.entityDescriptor;return{contract:{id:c.id,tenant_id:c.tenantId??null,entity_id:c.entityId,entity_code:c.entityCode,release_id:c.releaseId,revision_id:c.revisionId,release_no:c.releaseNo,contract_schema_code:c.contractSchemaCode,contract_schema_version:c.contractSchemaVersion,contract_hash:c.contractHash,contract_json:c.contract,publication_key:c.publicationKey,signature_algorithm:c.signature.algorithm,signing_key_id:c.signature.keyId,signature:c.signature.signature,published_at:c.publishedAt},descriptor:{id:d.id,plane_code:d.plane,descriptor_kind:d.descriptorKind,descriptor_schema_version:d.descriptorSchemaVersion,source_contract_hash:d.sourceContractHash,compiled_hash:d.compiledHash,compiled_json:d.descriptor,compiler_version:d.compilerVersion,compatibility_level:d.compatibilityLevel,generated_at:d.generatedAt}};}
function verificationJson(e:PublicationVerificationEvidence){return{signature_verified:e.signatureVerified,manifest_valid:e.manifestValid,runtime_compatible:e.runtimeCompatible,target_plane:e.targetPlane,...(e.contractHash?{contract_hash:e.contractHash}:{}),...(e.descriptorSourceHash?{descriptor_source_hash:e.descriptorSourceHash}:{}),...(e.contractSchemaVersion?{contract_schema_version:e.contractSchemaVersion}:{}),...(e.descriptorSchemaVersion?{descriptor_schema_version:e.descriptorSchemaVersion}:{}),...(e.definitionBundleHash?{definition_bundle_hash:e.definitionBundleHash}:{}),...(e.definitionBundleSchemaVersion?{definition_bundle_schema_version:e.definitionBundleSchemaVersion}:{}),...(e.signatureAlgorithm?{signature_algorithm:e.signatureAlgorithm}:{}),...(e.signingKeyId?{signing_key_id:e.signingKeyId}:{})};}
function mapApplied(row:Row):AppliedReleaseProjection{const verifiedAt=nullableDate(row,"verified_at"),activatedAt=nullableDate(row,"activated_at"),failureCode=nullableString(row,"failure_code");return{id:string(row,"id"),publicationKey:string(row,"publication_key"),deploymentId:string(row,"deployment_id"),sourceReleaseId:string(row,"source_release_id"),sourceReleaseNo:number(row,"source_release_no"),artifactHash:string(row,"artifact_hash"),status:string(row,"status") as AppliedReleaseProjection["status"],stagedAt:date(row,"staged_at"),...(verifiedAt?{verifiedAt}:{}),...(activatedAt?{activatedAt}:{}),...(failureCode?{failureCode}:{})};}
function required(row:Row|undefined,code:string):Row{if(!row)throw new Error(code);return row;}function string(row:Row,key:string):string{const value=row[key];if(typeof value!=="string")throw new Error(`PROJECTION_ROW_INVALID:${key}`);return value;}function nullableString(row:Row,key:string):string|undefined{const value=row[key];return typeof value==="string"?value:undefined;}function number(row:Row,key:string):number{const value=Number(row[key]);if(!Number.isSafeInteger(value))throw new Error(`PROJECTION_ROW_INVALID:${key}`);return value;}function date(row:Row,key:string):string{const value=row[key];const parsed=value instanceof Date?value:new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw new Error(`PROJECTION_ROW_INVALID:${key}`);return parsed.toISOString();}function nullableDate(row:Row,key:string):string|undefined{return row[key]==null?undefined:date(row,key);}function object(row:Row,key:string):Readonly<Record<string,unknown>>{const value=row[key];return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
