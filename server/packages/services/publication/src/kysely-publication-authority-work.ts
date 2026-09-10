import { compileEntityAuthorizationPublication, type EntityAuthorizationPublicationInput } from "./entity-authorization-compiler.js";
import type { EntityRuntimeProjection } from "@athyper/server-contract-publication";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import { createHash } from "node:crypto";
import {
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  type PublicationArtifactDocumentV1,
  type PublicationArtifactStore,
  type PublicationCanonicalizer,
  type PublicationPlane,
  type PublicationSigner,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";
import type { PublicationAuthorityWork, PublicationCoordinatePayload } from "./publication-jobs.js";
import { publicationArtifactKey, publicationArtifactUri } from "./publication-artifact-store.js";
import { BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION,compileBusinessPartnerDefinition } from "./business-partner-definition-compiler.js";

type Row = Record<string, unknown>;
type Database = Record<string, never>;

export interface KyselyPublicationAuthorityWorkOptions {
  readonly database: Kysely<Database>;
  readonly authority: KyselyPublicationAuthorityRepository;
  readonly store: PublicationArtifactStore;
  readonly signer: PublicationSigner;
  readonly canonicalizer: PublicationCanonicalizer;
  readonly bucket: string;
  readonly signingKeyId: string;
  readonly targetEnvironment: string;
  readonly targetPlanes: readonly PublicationPlane[];
  readonly targetInstance?: string;
  /** Absent means authorization releases may be signed but cannot dispatch. */
  readonly authorizeEntityActivation?: (releaseId: string) => Promise<void>;
  readonly authorizationCompilation?: {
    readonly runtime: EntityAuthorizationPublicationInput["runtime"];
    readonly review?: EntityAuthorizationPublicationInput["review"];
    catalog(plane: PublicationPlane): Promise<EntityAuthorizationPublicationInput["catalog"]>;
  };
}

export class KyselyPublicationAuthorityWork implements PublicationAuthorityWork {
  constructor(private readonly options: KyselyPublicationAuthorityWorkOptions) {}

  private scoped<T>(work:(worker:KyselyPublicationAuthorityWork)=>Promise<T>):Promise<T>{
    const context=tryGetRequestContext();
    if(!context?.tenantId)return work(this);
    return this.options.database.transaction().execute(async database=>{
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId!},true),set_config('app.current_principal_id',${context.principalId??""},true)`.execute(database);
      return work(new KyselyPublicationAuthorityWork({...this.options,database,authority:new KyselyPublicationAuthorityRepository(database)}));
    });
  }
  compile(id:string){return this.scoped(worker=>worker.compileScoped(id));}
  sign(id:string){return this.scoped(worker=>worker.signScoped(id));}
  dispatch(id:string){return this.scoped(worker=>worker.dispatchScoped(id));}

  private async compileScoped(releaseId: string): Promise<{ readonly compilationIds: readonly string[] }> {
    let result = await sql<Row>`SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind,
        pr.compatibility_level,pr.minimum_runtime_version,r.id revision_id,r.bundle_code,r.semantic_version,
        r.bundle_schema_version,r.bundle_json,r.bundle_hash,r.created_at,r.created_by,
        unnest(r.target_planes) plane_key
        FROM publication.release pr
        JOIN publication.business_partner_definition_release_link l ON l.publication_release_id=pr.id
        JOIN snapshot.business_partner_definition_revision r ON r.id=l.definition_revision_id
        WHERE pr.id=${releaseId}::uuid AND pr.status IN ('approved','published') ORDER BY plane_key`.execute(this.options.database);
    let artifactKind: import("@athyper/server-contract-publication").PublicationArtifactKind = "business_partner_definition_bundle";
    let caseContract = false;
    if (!result.rows.length) {
      const banks = await sql<Row>`SELECT pr.id publication_release_id,pr.release_key,pr.release_no,pr.release_kind,
        pr.compatibility_level,pr.minimum_runtime_version,pr.created_at,pr.created_by,l.directory_release
        FROM publication.release pr JOIN publication.bank_directory_release_link l ON l.publication_release_id=pr.id
        JOIN publication.bank_directory_review review ON review.revision_id=l.revision_id AND review.decision='approved'
        WHERE pr.id=${releaseId}::uuid AND pr.status IN('approved','published')`.execute(this.options.database);
      if (banks.rows.length) {
        artifactKind = "bank_directory";
        if (!["studio","neon","mesh"].every(p=>this.options.targetPlanes.includes(p as PublicationPlane))) throw permanent("BANK_DIRECTORY_ALL_PLANES_REQUIRED");
        result = {...banks,rows:this.options.targetPlanes.map(plane=>({...banks.rows[0]!,plane_key:plane}))};
      }
    }

    if (!result.rows.length) {
      const cases = await sql<Row>`SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind,
        pr.compatibility_level,pr.minimum_runtime_version,pr.created_by published_by,r.id revision_id,r.entity_id,
        r.contract_json,r.contract_hash,r.previous_contract_id,r.previous_contract_hash,r.previous_release_no,r.created_at
        FROM publication.release pr JOIN publication.business_partner_case_contract_release_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
        JOIN snapshot.business_partner_case_contract_revision r ON r.id=l.revision_id AND r.tenant_id=l.tenant_id
        WHERE pr.id=${releaseId}::uuid AND pr.status IN('approved','published')`.execute(this.options.database);
      if (cases.rows.length) {
        caseContract = true; artifactKind = "entity_runtime";
        const row = cases.rows[0]!;
        const contractBytes=this.options.canonicalizer.canonicalBytes(row["contract_json"]);
        if (this.options.canonicalizer.sha256(contractBytes)!==row["contract_hash"]) throw permanent("PUBLICATION_COMPILATION_HASH_MISMATCH");
        const signature=await this.options.signer.sign({keyId:this.options.signingKeyId,algorithm:"Ed25519",bytes:contractBytes});
        const descriptor={schema:"athyper.entity-case-runtime-descriptor/1.0",entityCode:"master.business_partner",planeKey:"neon",lifecycleStore:"document.entity_case",operation_scope_bindings:[],caseContractBase:{id:row["previous_contract_id"],hash:row["previous_contract_hash"],releaseNo:Number(row["previous_release_no"])}};
        result={...cases,rows:[{...row,entity_code:"master.business_partner",contract_schema_code:"athyper.entity-contract",contract_schema_version:"1.0.0",published_at:row["created_at"],plane_key:"neon",descriptor_kind:"entity_case_runtime",descriptor_id:stableUuid(`case-contract-descriptor:${releaseId}:neon`),compiled_json:descriptor,compiled_hash:this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(descriptor)),contract_signature:signature.signature,signature_algorithm:"Ed25519",contract_signing_key_id:this.options.signingKeyId}]};
      }
    }
    if (!result.rows.length) {
      result = await sql<Row>`SELECT * FROM publication.fn_initial_baseline_compilation_source(${releaseId}::uuid)`.execute(this.options.database);
      if (!result.rows.length) {
        const available=(await sql<Row>`SELECT to_regprocedure('publication.fn_authorization_successor_compilation_source(uuid)') IS NOT NULL AS available`.execute(this.options.database)).rows[0]?.["available"];
        if(available) result=await sql<Row>`SELECT * FROM publication.fn_authorization_successor_compilation_source(${releaseId}::uuid)`.execute(this.options.database);
      }
      if (result.rows.length) artifactKind = "entity_runtime";
    }
    if (!result.rows.length) {
      result = await sql<Row>`SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind,
      pr.compatibility_level,pr.minimum_runtime_version,er.revision_id,er.contract_schema_code,
      er.contract_schema_version,er.contract_hash,er.contract_signature,er.signature_algorithm,
      er.signing_key_id contract_signing_key_id,er.published_at,er.published_by,e.id entity_id,e.entity_code,
      r.contract_json,a.id descriptor_id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at
      FROM publication.release pr
      JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
      JOIN metadata.entity_release er ON er.id=l.entity_release_id
      JOIN metadata.entity e ON e.id=er.entity_id
      JOIN snapshot.entity_contract_revision r ON r.id=er.revision_id
      JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id
      WHERE pr.id=${releaseId}::uuid AND pr.status IN ('approved','published') ORDER BY a.plane_key`.execute(this.options.database);
      artifactKind = "entity_runtime";
    }
    if (!result.rows.length) throw permanent("PUBLICATION_COMPILATION_SOURCE_NOT_FOUND");

    const compilationIds: string[] = [];
    const selected=result.rows.filter(row=>this.options.targetPlanes.includes(planeValue(row["plane_key"])));
    if(selected.length!==((caseContract || result.rows.some(row=>row["imported_baseline"]!==undefined))?1:this.options.targetPlanes.length))throw permanent("PUBLICATION_TARGET_COMPILATION_SOURCE_MISSING");
    for (const sourceRow of selected) {
      let row = sourceRow;
      const plane = planeValue(row["plane_key"]);
      // Studio snapshot hashes bind SQL ledger coordinates. Runtime verification
      // uses canonical content hashes and a signature over the actual contract.
      // Vocabulary derivatives explicitly bridge these two existing contracts.
      if (artifactKind === "entity_runtime" && (row["imported_baseline"] !== undefined || (object(row,"compiled_json")["ai"] as {vocabulary?:unknown}|undefined)?.vocabulary)) {
        const contractBytes = this.options.canonicalizer.canonicalBytes(row["contract_json"]);
        const signed = await this.options.signer.sign({keyId:this.options.signingKeyId,algorithm:"Ed25519",bytes:contractBytes});
        row = {...row,contract_hash:this.options.canonicalizer.sha256(contractBytes),compiled_hash:this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(row["compiled_json"])),contract_signature:signed.signature,signature_algorithm:"Ed25519",contract_signing_key_id:this.options.signingKeyId};
      }
      let unsigned = artifactKind === "entity_runtime"
        ? buildUnsigned(row, plane, this.options.signingKeyId, this.options.canonicalizer)
        : artifactKind === "bank_directory" ? buildBankDirectoryUnsigned(row, plane, this.options.signingKeyId, this.options.canonicalizer)
        : buildBusinessPartnerDefinitionUnsigned(row, plane, this.options.signingKeyId, this.options.canonicalizer);
      if (artifactKind === "entity_runtime" && object(row,"compiled_json")["authorizationRuntime"] !== undefined) {
        const configuration = this.options.authorizationCompilation;
        if (!configuration) throw permanent("ENTITY_AUTHORIZATION_COMPILER_UNAVAILABLE");
        if (row["release_kind"] !== "publish") throw permanent("ENTITY_AUTHORIZATION_ROLLBACK_REQUIRES_COMPATIBLE_ARTIFACT");
        const native = buildUnsigned(row, plane, this.options.signingKeyId, this.options.canonicalizer);
        const contract = object(row,"contract_json");
        const authored = contract["operations"];
        if (!Array.isArray(authored)) throw permanent("ENTITY_AUTHORIZATION_AUTHORED_OPERATIONS_REQUIRED");
        const operationIds: Record<string,string> = {};
        for (const operation of authored) {
          if (operation.status === "deprecated") continue;
          if (typeof operation.operationKey !== "string" || typeof operation.id !== "string" || Object.hasOwn(operationIds,operation.operationKey)) throw permanent("ENTITY_AUTHORIZATION_AUTHORED_OPERATIONS_INVALID");
          operationIds[operation.operationKey] = operation.id;
        }
        const compiled = await compileEntityAuthorizationPublication({
          projection: native.envelope.payload as EntityRuntimeProjection, operationIds,
          catalog: await configuration.catalog(plane), runtime: configuration.runtime,
          ...(configuration.review ? {review:configuration.review} : {}),
          signer: this.options.signer, canonicalizer: this.options.canonicalizer,
          signingKeyId: this.options.signingKeyId, minimumRuntimeVersion: string(row,"minimum_runtime_version"),
        });
        unsigned = { envelope: compiled.envelope, manifest: {...compiled.manifest, evidence: {...native.manifest.evidence, ...compiled.manifest.evidence}} } as typeof unsigned;
      }
      const unsignedHash = this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(unsigned));
      const id = stableUuid(`publication-compilation:${releaseId}:${plane}:${artifactKind}`);
      await sql`INSERT INTO publication.artifact_compilation
        (id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by)
        VALUES(${id}::uuid,${releaseId}::uuid,${plane},${artifactKind},${JSON.stringify(unsigned)}::jsonb,${unsignedHash},
          ${artifactKind === "bank_directory" ? "athyper.bank-directory-artifact" : artifactKind === "entity_runtime" ? "athyper.entity-release-artifact" : "athyper.business-partner-definition-artifact"},'1.0.0',${string(row,artifactKind === "entity_runtime" ? "published_by" : "created_by")}::uuid)
        ON CONFLICT(publication_release_id,plane_code,artifact_kind) DO NOTHING`.execute(this.options.database);
      const replay = await sql<Row>`SELECT id,unsigned_hash FROM publication.artifact_compilation
        WHERE publication_release_id=${releaseId}::uuid AND plane_code=${plane} AND artifact_kind=${artifactKind}`.execute(this.options.database);
      const saved = required(replay.rows[0], "PUBLICATION_COMPILATION_NOT_FOUND");
      if (string(saved, "unsigned_hash") !== unsignedHash) throw permanent("PUBLICATION_COMPILATION_CONFLICT");
      compilationIds.push(string(saved, "id"));
    }
    return { compilationIds };
  }

  private async signScoped(compilationId: string): Promise<{ readonly deploymentId: string }> {
    const result = await sql<Row>`SELECT c.*,r.release_key,r.release_no,r.created_by
      FROM publication.artifact_compilation c JOIN publication.release r ON r.id=c.publication_release_id
      WHERE c.id=${compilationId}::uuid`.execute(this.options.database);
    const row = required(result.rows[0], "PUBLICATION_COMPILATION_NOT_FOUND");
    const plane = planeValue(row["plane_code"]);
    const artifactKind = artifactKindValue(row["artifact_kind"]);
    const unsigned = object(row, "unsigned_document");
    const unsignedBytes = this.options.canonicalizer.canonicalBytes(unsigned);
    if (this.options.canonicalizer.sha256(unsignedBytes) !== string(row, "unsigned_hash")) throw permanent("PUBLICATION_COMPILATION_HASH_MISMATCH");
    const projection=(unsigned as unknown as {envelope:{payload:EntityRuntimeProjection}}).envelope?.payload;
    if(projection?.entityDescriptor?.descriptor["authorizationRuntime"]!==undefined){
      const configuration=this.options.authorizationCompilation;
      if(!configuration?.review)throw permanent("ENTITY_AUTHORIZATION_SIGNING_REVIEW_REQUIRED");
      const c=projection.entityContract,d=projection.entityDescriptor;
      const profile=d.descriptor["authorization"] as {operations:readonly {key:string}[]};
      const runtime=d.descriptor["authorizationRuntime"];
      configuration.runtime.qualify(profile,runtime);
      const hash=(value:unknown)=>this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(value));
      const review=await configuration.review.qualify({releaseId:c.releaseId,releaseNo:c.releaseNo,tenantId:c.tenantId??null,plane:d.plane,entityCode:c.entityCode,contractHash:hash(c.contract),profileHash:hash(profile),runtimeHash:hash(runtime),catalogHash:hash(await configuration.catalog(d.plane)),operationKeys:profile.operations.map(o=>o.key).sort()});
      const evidence=(unsigned as any).manifest?.evidence;
      if(review.receiptSha256!==evidence?.authorizationReviewReceiptSha256)throw permanent("ENTITY_AUTHORIZATION_SIGNING_REVIEW_CHANGED");
    }
    const signed = await this.options.signer.sign({ keyId: this.options.signingKeyId, algorithm: "Ed25519", bytes: unsignedBytes });
    const document = { ...unsigned, signature: signed.signature } as unknown as PublicationArtifactDocumentV1;
    const bytes = this.options.canonicalizer.canonicalBytes(document);
    const contentHash = this.options.canonicalizer.sha256(bytes);
    const releaseId = string(row, "publication_release_id");
    const artifactId = stableUuid(`publication-artifact:${releaseId}:${plane}:${artifactKind}`);
    const key = publicationArtifactKey({ publicationKey: string(row,"release_key"), releaseNo: number(row,"release_no"), releaseId, targetPlane: plane, artifactKind, contentHash });
    await this.options.store.putImmutable({ key, bytes, contentType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1, sha256: contentHash, metadata: { releaseId, targetPlane: plane, signingKeyId: this.options.signingKeyId } });
    const artifact=await this.options.authority.createArtifact({ id: artifactId, releaseId, plane, artifactKind, artifactUri: publicationArtifactUri(this.options.bucket,key), contentHash, actorId: string(row,"created_by") });
    if(artifact.status==="compiled")await this.options.authority.transitionArtifact({ artifactId, status: "validated" });
    await this.options.authority.transitionArtifact({ artifactId, status: "signed", signatureAlgorithm: "Ed25519", signingKeyId: this.options.signingKeyId, signature: signed.signature });
    const targetInstance = this.options.targetInstance ?? "*";
    const commandId = stableUuid(`publication-deployment:${artifactId}:${this.options.targetEnvironment}:${targetInstance}:1`);
    const deployment = await this.options.authority.createDeployment({ commandId, artifactId, targetPlane: plane, targetEnvironment: this.options.targetEnvironment, targetInstance, attempt: 1, actorId: string(row,"created_by") });
    return { deploymentId: deployment.deploymentId };
  }

  private async dispatchScoped(deploymentId: string): Promise<PublicationCoordinatePayload> {
    const deployment = await this.options.authority.getDeployment(deploymentId);
    if (!deployment) throw permanent("DEPLOYMENT_NOT_FOUND");
    await this.assertActivationApproved(deploymentId);
    if (deployment.deploymentStatus === "pending") await this.options.authority.transitionDeployment({ deploymentId, status: "dispatched", evidence: { authorityWorker: "publication.v1" } });
    return { deploymentId, targetPlane: deployment.targetPlane };
  }

  private async assertActivationApproved(deploymentId: string): Promise<void> {
    const rows=(await sql<Row>`SELECT a.publication_release_id FROM publication.deployment d
      JOIN publication.artifact a ON a.id=d.artifact_id
      JOIN publication.artifact_compilation c ON c.publication_release_id=a.publication_release_id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind
      WHERE d.id=${deploymentId}::uuid AND c.unsigned_document #> '{envelope,payload,entityDescriptor,descriptor,authorizationRuntime}' IS NOT NULL`.execute(this.options.database)).rows;
    if(rows.length){
      if(!this.options.authorizeEntityActivation)throw permanent("ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED");
      await this.options.authorizeEntityActivation(string(rows[0]!,"publication_release_id"));
    }
  }

  async acknowledge(): Promise<void> { /* Activation acknowledges in the target orchestrator transaction flow. */ }
  async recoverStalled(): Promise<readonly PublicationCoordinatePayload[]> {
    const eligible: PublicationCoordinatePayload[]=[];
    for(const item of await this.options.authority.listRecoverableDeployments(200)){
      try{await this.assertActivationApproved(item.deploymentId);eligible.push({deploymentId:item.deploymentId,targetPlane:item.targetPlane});}
      catch(error){if((error as Error).message!=="ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED")throw error;}
    }
    return eligible;
  }
}

function buildUnsigned(row: Row, plane: PublicationPlane, signingKeyId: string, canonicalizer: PublicationCanonicalizer) {
  const payload = {
    entityContract: {
      id:string(row,"revision_id"),...(row["tenant_id"]?{tenantId:string(row,"tenant_id")}:{}),entityId:string(row,"entity_id"),entityCode:string(row,"entity_code"),releaseId:string(row,"publication_release_id"),revisionId:string(row,"revision_id"),releaseNo:number(row,"release_no"),contractSchemaCode:string(row,"contract_schema_code"),contractSchemaVersion:string(row,"contract_schema_version"),contractHash:string(row,"contract_hash"),contract:object(row,"contract_json"),publicationKey:string(row,"release_key"),signature:{algorithm:string(row,"signature_algorithm"),keyId:string(row,"contract_signing_key_id"),signature:string(row,"contract_signature")},publishedAt:date(row,"published_at"),
    },
    entityDescriptor: {
      id:string(row,"descriptor_id"),plane,descriptorKind:(row["descriptor_kind"] === "entity_case_runtime" ? "entity_case_runtime" : "entity_runtime") as "entity_case_runtime" | "entity_runtime",descriptorSchemaVersion:"1.0.0",sourceContractHash:string(row,"contract_hash"),compiledHash:string(row,"compiled_hash"),descriptor:object(row,"compiled_json"),compilerVersion:"athyper.entity-release-artifact/1.0.0",compatibilityLevel:string(row,"compatibility_level"),generatedAt:date(row,"created_at"),
    },
  };
  const envelope = { schema:PUBLICATION_ARTIFACT_SCHEMA_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),releaseKind:string(row,"release_kind"),targetPlane:plane,artifactKind:"entity_runtime" as const,generatedAt:date(row,"created_at"),...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),compatibilityLevel:string(row,"compatibility_level"),payload };
  const manifest = { ...(row["imported_baseline"] ? {evidence:{importedBaseline:object(row,"imported_baseline")}} : {}), artifactSchema:PUBLICATION_ARTIFACT_SCHEMA_V1,mediaType:PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),targetPlane:plane,artifactKind:"entity_runtime" as const,payloadSha256:canonicalizer.sha256(canonicalizer.canonicalBytes(payload)),compiler:{name:"athyper.entity-release-artifact",version:"1.0.0"},contractSchemaVersion:string(row,"contract_schema_version"),descriptorSchemaVersion:"1.0.0",...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),signatureAlgorithm:"Ed25519",signingKeyId,createdAt:date(row,"created_at") };
  return { envelope, manifest };
}

function buildBusinessPartnerDefinitionUnsigned(row:Row,plane:PublicationPlane,signingKeyId:string,canonicalizer:PublicationCanonicalizer){
  const compiled=compileBusinessPartnerDefinition({bundle:object(row,"bundle_json"),plane,canonicalizer});
  if(compiled.sourceBundleHash!==string(row,"bundle_hash"))throw permanent("BUSINESS_PARTNER_DEFINITION_SOURCE_HASH_MISMATCH");
  const payload={id:stableUuid(`business-partner-definition-projection:${string(row,"publication_release_id")}:${plane}`),tenantId:string(row,"tenant_id"),revisionId:string(row,"revision_id"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),publicationKey:string(row,"release_key"),plane,bundleCode:string(row,"bundle_code"),semanticVersion:string(row,"semantic_version"),bundleSchemaVersion:string(row,"bundle_schema_version"),bundleHash:compiled.compiledBundleHash,sourceBundleHash:compiled.sourceBundleHash,bundle:compiled.bundle,compileReport:compiled.report,generatedAt:date(row,"created_at")};
  const envelope={schema:PUBLICATION_ARTIFACT_SCHEMA_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),releaseKind:string(row,"release_kind"),targetPlane:plane,artifactKind:"business_partner_definition_bundle" as const,generatedAt:date(row,"created_at"),...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),compatibilityLevel:string(row,"compatibility_level"),payload};
  const manifest={artifactSchema:PUBLICATION_ARTIFACT_SCHEMA_V1,mediaType:PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),targetPlane:plane,artifactKind:"business_partner_definition_bundle" as const,payloadSha256:canonicalizer.sha256(canonicalizer.canonicalBytes(payload)),compiler:{name:"athyper.business-partner-definition-artifact",version:BUSINESS_PARTNER_DEFINITION_COMPILER_VERSION},contractSchemaVersion:string(row,"bundle_schema_version"),descriptorSchemaVersion:string(row,"bundle_schema_version"),...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),signatureAlgorithm:"Ed25519",signingKeyId,createdAt:date(row,"created_at"),evidence:{sourceBundleHash:compiled.sourceBundleHash,compiledBundleHash:compiled.compiledBundleHash,compileReportHash:canonicalizer.sha256(canonicalizer.canonicalBytes(compiled.report))}};
  return{envelope,manifest};
}

function stableUuid(value:string){const hex=createHash("sha256").update(value).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=["8","9","a","b"][parseInt(hex[16]!,16)%4]!;const h=hex.join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function permanent(code:string){return Object.assign(new Error(code),{code,retryable:false});}
function required(row:Row|undefined,code:string){if(!row)throw permanent(code);return row;}
function string(row:Row,key:string){const value=row[key];if(typeof value!=="string"||!value)throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value;}
function number(row:Row,key:string){const value=Number(row[key]);if(!Number.isSafeInteger(value))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value;}
function object(row:Row,key:string){const value=row[key];if(!value||typeof value!=="object"||Array.isArray(value))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value as Record<string,unknown>;}
function date(row:Row,key:string){const value=row[key];const parsed=value instanceof Date?value:new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return parsed.toISOString();}
function planeValue(value:unknown):PublicationPlane{if(value!=="studio"&&value!=="neon"&&value!=="mesh")throw permanent("PUBLICATION_SOURCE_PLANE_INVALID");return value;}
function artifactKindValue(value:unknown):import("@athyper/server-contract-publication").PublicationArtifactKind{if(value!=="entity_runtime"&&value!=="business_partner_definition_bundle"&&value!=="bank_directory")throw permanent("PUBLICATION_ARTIFACT_KIND_INVALID");return value;}

function buildBankDirectoryUnsigned(row:Row,plane:PublicationPlane,signingKeyId:string,canonicalizer:PublicationCanonicalizer){
 const payload=object(row,"directory_release");
 const coordinates={publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),targetPlane:plane,artifactKind:"bank_directory" as const};
 return {envelope:{schema:PUBLICATION_ARTIFACT_SCHEMA_V1,...coordinates,releaseKind:string(row,"release_kind"),generatedAt:date(row,"created_at"),compatibilityLevel:string(row,"compatibility_level"),payload},
 manifest:{artifactSchema:PUBLICATION_ARTIFACT_SCHEMA_V1,mediaType:PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,...coordinates,payloadSha256:canonicalizer.sha256(canonicalizer.canonicalBytes(payload)),compiler:{name:"athyper.bank-directory-artifact",version:"1.0.0"},contractSchemaVersion:"1.0.0",descriptorSchemaVersion:"1.0.0",signatureAlgorithm:"Ed25519",signingKeyId,createdAt:date(row,"created_at")}};
}
