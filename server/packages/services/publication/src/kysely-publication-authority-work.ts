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
}

export class KyselyPublicationAuthorityWork implements PublicationAuthorityWork {
  constructor(private readonly options: KyselyPublicationAuthorityWorkOptions) {}

  async compile(releaseId: string): Promise<{ readonly compilationIds: readonly string[] }> {
    const result = await sql<Row>`SELECT pr.id publication_release_id,pr.release_key,pr.release_no,pr.release_kind,
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
      WHERE pr.id=${releaseId}::uuid ORDER BY a.plane_key`.execute(this.options.database);
    if (!result.rows.length) throw permanent("PUBLICATION_COMPILATION_SOURCE_NOT_FOUND");

    const compilationIds: string[] = [];
    const selected=result.rows.filter(row=>this.options.targetPlanes.includes(planeValue(row["plane_key"])));
    if(selected.length!==this.options.targetPlanes.length)throw permanent("PUBLICATION_TARGET_COMPILATION_SOURCE_MISSING");
    for (const row of selected) {
      const plane = planeValue(row["plane_key"]);
      const unsigned = buildUnsigned(row, plane, this.options.signingKeyId, this.options.canonicalizer);
      const unsignedHash = this.options.canonicalizer.sha256(this.options.canonicalizer.canonicalBytes(unsigned));
      const id = stableUuid(`publication-compilation:${releaseId}:${plane}:entity_runtime`);
      await sql`INSERT INTO publication.artifact_compilation
        (id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by)
        VALUES(${id}::uuid,${releaseId}::uuid,${plane},'entity_runtime',${JSON.stringify(unsigned)}::jsonb,${unsignedHash},
          'athyper.entity-release-artifact','1.0.0',${string(row,"published_by")}::uuid)
        ON CONFLICT(publication_release_id,plane_code,artifact_kind) DO NOTHING`.execute(this.options.database);
      const replay = await sql<Row>`SELECT id,unsigned_hash FROM publication.artifact_compilation
        WHERE publication_release_id=${releaseId}::uuid AND plane_code=${plane} AND artifact_kind='entity_runtime'`.execute(this.options.database);
      const saved = required(replay.rows[0], "PUBLICATION_COMPILATION_NOT_FOUND");
      if (string(saved, "unsigned_hash") !== unsignedHash) throw permanent("PUBLICATION_COMPILATION_CONFLICT");
      compilationIds.push(string(saved, "id"));
    }
    return { compilationIds };
  }

  async sign(compilationId: string): Promise<{ readonly deploymentId: string }> {
    const result = await sql<Row>`SELECT c.*,r.release_key,r.release_no,r.created_by
      FROM publication.artifact_compilation c JOIN publication.release r ON r.id=c.publication_release_id
      WHERE c.id=${compilationId}::uuid`.execute(this.options.database);
    const row = required(result.rows[0], "PUBLICATION_COMPILATION_NOT_FOUND");
    const plane = planeValue(row["plane_code"]);
    const unsigned = object(row, "unsigned_document");
    const unsignedBytes = this.options.canonicalizer.canonicalBytes(unsigned);
    if (this.options.canonicalizer.sha256(unsignedBytes) !== string(row, "unsigned_hash")) throw permanent("PUBLICATION_COMPILATION_HASH_MISMATCH");
    const signed = await this.options.signer.sign({ keyId: this.options.signingKeyId, algorithm: "Ed25519", bytes: unsignedBytes });
    const document = { ...unsigned, signature: signed.signature } as unknown as PublicationArtifactDocumentV1;
    const bytes = this.options.canonicalizer.canonicalBytes(document);
    const contentHash = this.options.canonicalizer.sha256(bytes);
    const releaseId = string(row, "publication_release_id");
    const artifactId = stableUuid(`publication-artifact:${releaseId}:${plane}:entity_runtime`);
    const key = publicationArtifactKey({ publicationKey: string(row,"release_key"), releaseNo: number(row,"release_no"), releaseId, targetPlane: plane, contentHash });
    await this.options.store.putImmutable({ key, bytes, contentType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1, sha256: contentHash, metadata: { releaseId, targetPlane: plane, signingKeyId: this.options.signingKeyId } });
    const artifact=await this.options.authority.createArtifact({ id: artifactId, releaseId, plane, artifactKind: "entity_runtime", artifactUri: publicationArtifactUri(this.options.bucket,key), contentHash, actorId: string(row,"created_by") });
    if(artifact.status==="compiled")await this.options.authority.transitionArtifact({ artifactId, status: "validated" });
    await this.options.authority.transitionArtifact({ artifactId, status: "signed", signatureAlgorithm: "Ed25519", signingKeyId: this.options.signingKeyId, signature: signed.signature });
    const targetInstance = this.options.targetInstance ?? "*";
    const commandId = stableUuid(`publication-deployment:${artifactId}:${this.options.targetEnvironment}:${targetInstance}:1`);
    const deployment = await this.options.authority.createDeployment({ commandId, artifactId, targetPlane: plane, targetEnvironment: this.options.targetEnvironment, targetInstance, attempt: 1, actorId: string(row,"created_by") });
    return { deploymentId: deployment.deploymentId };
  }

  async dispatch(deploymentId: string): Promise<PublicationCoordinatePayload> {
    const deployment = await this.options.authority.getDeployment(deploymentId);
    if (!deployment) throw permanent("DEPLOYMENT_NOT_FOUND");
    if (deployment.deploymentStatus === "pending") await this.options.authority.transitionDeployment({ deploymentId, status: "dispatched", evidence: { authorityWorker: "publication.v1" } });
    return { deploymentId, targetPlane: deployment.targetPlane };
  }

  async acknowledge(): Promise<void> { /* Activation acknowledges in the target orchestrator transaction flow. */ }
  async recoverStalled(): Promise<readonly PublicationCoordinatePayload[]> {
    return (await this.options.authority.listRecoverableDeployments(200)).map(item => ({ deploymentId:item.deploymentId,targetPlane:item.targetPlane }));
  }
}

function buildUnsigned(row: Row, plane: PublicationPlane, signingKeyId: string, canonicalizer: PublicationCanonicalizer) {
  const payload = {
    entityContract: {
      id:string(row,"revision_id"),entityId:string(row,"entity_id"),entityCode:string(row,"entity_code"),releaseId:string(row,"publication_release_id"),revisionId:string(row,"revision_id"),releaseNo:number(row,"release_no"),contractSchemaCode:string(row,"contract_schema_code"),contractSchemaVersion:string(row,"contract_schema_version"),contractHash:string(row,"contract_hash"),contract:object(row,"contract_json"),publicationKey:string(row,"release_key"),signature:{algorithm:string(row,"signature_algorithm"),keyId:string(row,"contract_signing_key_id"),signature:string(row,"contract_signature")},publishedAt:date(row,"published_at"),
    },
    entityDescriptor: {
      id:string(row,"descriptor_id"),plane,descriptorKind:"entity_runtime" as const,descriptorSchemaVersion:"1.0.0",sourceContractHash:string(row,"contract_hash"),compiledHash:string(row,"compiled_hash"),descriptor:object(row,"compiled_json"),compilerVersion:"athyper.entity-release-artifact/1.0.0",compatibilityLevel:string(row,"compatibility_level"),generatedAt:date(row,"created_at"),
    },
  };
  const envelope = { schema:PUBLICATION_ARTIFACT_SCHEMA_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),releaseKind:string(row,"release_kind"),targetPlane:plane,artifactKind:"entity_runtime" as const,generatedAt:date(row,"created_at"),...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),compatibilityLevel:string(row,"compatibility_level"),payload };
  const manifest = { artifactSchema:PUBLICATION_ARTIFACT_SCHEMA_V1,mediaType:PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,publicationKey:string(row,"release_key"),releaseId:string(row,"publication_release_id"),releaseNo:number(row,"release_no"),targetPlane:plane,artifactKind:"entity_runtime" as const,payloadSha256:canonicalizer.sha256(canonicalizer.canonicalBytes(payload)),compiler:{name:"athyper.entity-release-artifact",version:"1.0.0"},contractSchemaVersion:string(row,"contract_schema_version"),descriptorSchemaVersion:"1.0.0",...(row["minimum_runtime_version"]?{minimumRuntimeVersion:string(row,"minimum_runtime_version")} : {}),signatureAlgorithm:"Ed25519",signingKeyId,createdAt:date(row,"created_at") };
  return { envelope, manifest };
}

function stableUuid(value:string){const hex=createHash("sha256").update(value).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=["8","9","a","b"][parseInt(hex[16]!,16)%4]!;const h=hex.join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function permanent(code:string){return Object.assign(new Error(code),{code,retryable:false});}
function required(row:Row|undefined,code:string){if(!row)throw permanent(code);return row;}
function string(row:Row,key:string){const value=row[key];if(typeof value!=="string"||!value)throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value;}
function number(row:Row,key:string){const value=Number(row[key]);if(!Number.isSafeInteger(value))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value;}
function object(row:Row,key:string){const value=row[key];if(!value||typeof value!=="object"||Array.isArray(value))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return value as Record<string,unknown>;}
function date(row:Row,key:string){const value=row[key];const parsed=value instanceof Date?value:new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw permanent(`PUBLICATION_SOURCE_INVALID_${key.toUpperCase()}`);return parsed.toISOString();}
function planeValue(value:unknown):PublicationPlane{if(value!=="studio"&&value!=="neon"&&value!=="mesh")throw permanent("PUBLICATION_SOURCE_PLANE_INVALID");return value;}
