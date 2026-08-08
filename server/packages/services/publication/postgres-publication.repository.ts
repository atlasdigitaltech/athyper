import { sql, type Kysely } from "kysely";
import type {
  ActiveRelease,
  ActiveEntityProjection,
  AppliedRelease,
  DeploymentBundle,
  DeploymentStatus,
  LoadedPublicationArtifact,
  LocalPublicationRepository,
  PublicationAuthorityRepository,
} from "./publication.contract.js";

export class PostgresPublicationAuthorityRepository implements PublicationAuthorityRepository {
  constructor(private readonly db: Kysely<any>) {}

  async getDeployment(deploymentId: string): Promise<DeploymentBundle | null> {
    const result = await sql<any>`
      SELECT d.id AS deployment_id, d.status AS deployment_status,
             d.target_plane, d.target_environment, d.target_instance,
             r.release_key AS publication_key, r.id AS source_release_id,
             r.release_no AS source_release_no, a.artifact_uri, a.content_hash AS artifact_hash,
             a.signature_algorithm, a.signing_key_id, a.signature
        FROM publication.deployment d
        JOIN publication.artifact a ON a.id = d.artifact_id
        JOIN publication.release r ON r.id = a.publication_release_id
       WHERE d.id = ${deploymentId}::uuid
         AND r.status = 'published'
         AND a.status = 'signed'
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      deploymentId: row.deployment_id,
      deploymentStatus: row.deployment_status,
      targetPlane: row.target_plane,
      targetEnvironment: row.target_environment,
      targetInstance: row.target_instance,
      publicationKey: row.publication_key,
      sourceReleaseId: row.source_release_id,
      sourceReleaseNo: Number(row.source_release_no),
      artifactUri: row.artifact_uri,
      artifactHash: row.artifact_hash,
      signatureAlgorithm: row.signature_algorithm,
      signingKeyId: row.signing_key_id,
      signature: row.signature,
    };
  }

  async transition(
    deploymentId: string,
    status: DeploymentStatus,
    evidence: Record<string, unknown> = {},
  ): Promise<void> {
    await sql`SELECT publication.fn_transition_deployment(
      ${deploymentId}::uuid, ${status}::publication.deployment_status_d, ${JSON.stringify(evidence)}::jsonb
    )`.execute(this.db);
  }

  async acknowledge(input: {
    deploymentId: string;
    targetInstance: string;
    activeReleaseHash: string;
    localAppliedReleaseId: string;
    evidence?: Record<string, unknown>;
  }): Promise<void> {
    await sql`SELECT publication.fn_acknowledge_activation(
      ${input.deploymentId}::uuid, ${input.targetInstance}, ${input.activeReleaseHash},
      ${input.localAppliedReleaseId}::uuid, ${JSON.stringify(input.evidence ?? {})}::jsonb
    )`.execute(this.db);
  }
}

function applied(row: any): AppliedRelease {
  return {
    id: row.id,
    publicationKey: row.publication_key,
    deploymentId: row.deployment_id,
    sourceReleaseId: row.source_release_id,
    sourceReleaseNo: Number(row.source_release_no),
    artifactHash: row.artifact_hash,
    manifest: row.manifest,
    status: row.status,
  };
}

export class PostgresLocalPublicationRepository implements LocalPublicationRepository {
  constructor(private readonly db: Kysely<any>) {}

  async stage(bundle: DeploymentBundle, artifact: LoadedPublicationArtifact): Promise<AppliedRelease> {
    if (bundle.publicationKey.startsWith("metadata.entity.") && !artifact.entityProjection) {
      throw new Error("ENTITY_RUNTIME_PROJECTION_REQUIRED");
    }
    const entityProjection = artifact.entityProjection
      ? {
          contract: {
            ...artifact.entityProjection.contract,
            release_id: bundle.sourceReleaseId,
            release_no: bundle.sourceReleaseNo,
            publication_key: bundle.publicationKey,
            signature_algorithm: bundle.signatureAlgorithm,
            signing_key_id: bundle.signingKeyId,
            signature: bundle.signature,
          },
          descriptor: {
            ...artifact.entityProjection.descriptor,
            plane_code: bundle.targetPlane,
            descriptor_kind: bundle.targetPlane === "athyper" ? "admin_preview" : "entity_runtime",
          },
        }
      : null;
    const result = await sql<any>`SELECT * FROM runtime_meta.fn_stage_release_projection(
      ${bundle.publicationKey}, ${bundle.sourceReleaseId}::uuid, ${bundle.sourceReleaseNo},
      ${bundle.deploymentId}::uuid, ${bundle.artifactHash}, ${JSON.stringify(artifact.manifest)}::jsonb,
      ${entityProjection ? JSON.stringify(entityProjection) : null}::jsonb
    )`.execute(this.db);
    return applied(result.rows[0]);
  }

  async verify(appliedReleaseId: string, artifact: LoadedPublicationArtifact): Promise<AppliedRelease> {
    const evidence = {
      ...artifact.evidence,
      signature_verified: artifact.signatureVerified,
      manifest_valid: artifact.manifestValid,
      runtime_compatible: artifact.runtimeCompatible,
    };
    const result = await sql<any>`SELECT * FROM runtime_meta.fn_verify_release(
      ${appliedReleaseId}::uuid, ${artifact.computedArtifactHash}, ${JSON.stringify(evidence)}::jsonb
    )`.execute(this.db);
    return applied(result.rows[0]);
  }

  async activate(
    appliedReleaseId: string,
    evidence: Record<string, unknown> = {},
  ): Promise<ActiveRelease> {
    await sql`SELECT runtime_meta.fn_activate_release(
      ${appliedReleaseId}::uuid, ${JSON.stringify(evidence)}::jsonb
    )`.execute(this.db);
    const result = await sql<any>`
      SELECT a.*, h.activated_at
        FROM runtime_meta.applied_release a
        JOIN runtime_meta.release_activation_head h ON h.applied_release_id = a.id
       WHERE a.id = ${appliedReleaseId}::uuid
    `.execute(this.db);
    return { ...applied(result.rows[0]), activatedAt: new Date(result.rows[0].activated_at).toISOString() };
  }

  async findByDeployment(deploymentId: string): Promise<AppliedRelease | null> {
    const result = await sql<any>`SELECT * FROM runtime_meta.applied_release WHERE deployment_id=${deploymentId}::uuid`.execute(this.db);
    return result.rows[0] ? applied(result.rows[0]) : null;
  }

  async active(publicationKey: string): Promise<ActiveRelease | null> {
    const result = await sql<any>`
      SELECT a.*, h.activated_at
        FROM runtime_meta.release_activation_head h
        JOIN runtime_meta.applied_release a ON a.id = h.applied_release_id
       WHERE h.publication_key=${publicationKey} AND a.status='active'
    `.execute(this.db);
    if (!result.rows[0]) return null;
    return { ...applied(result.rows[0]), activatedAt: new Date(result.rows[0].activated_at).toISOString() };
  }

  async activeEntity(
    publicationKey: string,
    descriptorKind = "entity_runtime",
  ): Promise<ActiveEntityProjection | null> {
    const result = await sql<any>`SELECT * FROM runtime_meta.fn_active_entity_descriptor(
      ${publicationKey}, ${descriptorKind}
    )`.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      entityContractId: row.entity_contract_id,
      entityDescriptorId: row.entity_descriptor_id,
      tenantId: row.tenant_id,
      entityId: row.entity_id,
      entityCode: row.entity_code,
      releaseId: row.release_id,
      releaseNo: Number(row.release_no),
      contractHash: row.contract_hash,
      contract: row.contract_json,
      plane: row.plane_code,
      descriptorKind: row.descriptor_kind,
      compiledHash: row.compiled_hash,
      descriptor: row.compiled_json,
      activatedAt: new Date(row.activated_at).toISOString(),
    };
  }

  async rollback(
    publicationKey: string,
    targetAppliedReleaseId: string,
    evidence: Record<string, unknown> = {},
  ): Promise<ActiveRelease> {
    await sql`SELECT runtime_meta.fn_rollback_release(
      ${publicationKey},${targetAppliedReleaseId}::uuid,${JSON.stringify(evidence)}::jsonb
    )`.execute(this.db);
    const active = await this.active(publicationKey);
    if (!active || active.id !== targetAppliedReleaseId) {
      throw new Error("LOCAL_ROLLBACK_HEAD_MISMATCH");
    }
    return active;
  }
}
