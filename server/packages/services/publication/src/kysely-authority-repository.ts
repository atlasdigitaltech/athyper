import type {
  AcknowledgeDeploymentInput,
  CreatePublicationArtifactInput,
  CreatePublicationDeploymentInput,
  CreatePublicationReleaseInput,
  PublicationArtifactStatus,
  PublicationAuthorityRepository,
  PublicationDeploymentAcknowledgement,
  PublicationDeploymentBundle,
  PublicationDeploymentStatus,
  PublicationRelease,
  PublicationReleaseStatus,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

export class KyselyPublicationAuthorityRepository implements PublicationAuthorityRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async createRelease(
    input: CreatePublicationReleaseInput,
  ): Promise<PublicationRelease> {
    return this.database.transaction().execute(async (transaction) => {
      const inserted = await sql<Row>`INSERT INTO publication.release
        (id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
        VALUES (${input.id}::uuid,${input.tenantId}::uuid,${input.publicationKey},${input.releaseNo},${input.releaseKind},'preparing',
          ${input.compatibilityLevel},${input.releaseHash},${input.manifestHash},${input.minimumRuntimeVersion ?? null},${input.actorId}::uuid,${JSON.stringify(input.metadata ?? {})}::jsonb)
        ON CONFLICT (id) DO NOTHING RETURNING *`.execute(transaction);
      if (inserted.rows.length) {
        if (input.entityReleaseId) {
          await sql`INSERT INTO publication.entity_release_link(publication_release_id,entity_release_id)
            VALUES(${input.id}::uuid,${input.entityReleaseId}::uuid)`.execute(
            transaction,
          );
        } else if (input.businessPartnerDefinitionRevisionId) {
          await sql`INSERT INTO publication.business_partner_definition_release_link(publication_release_id,definition_revision_id,publish_idempotency_key,created_by)
            VALUES(${input.id}::uuid,${input.businessPartnerDefinitionRevisionId}::uuid,${String(input.metadata?.["publishIdempotencyKey"] ?? input.id)},${input.actorId}::uuid)`.execute(
            transaction,
          );
        } else {
          throw new Error("PUBLICATION_RELEASE_SOURCE_REQUIRED");
        }
      }
      const row =
        await sql<Row>`SELECT * FROM publication.release WHERE id=${input.id}::uuid`.execute(
          transaction,
        );
      const release = required(row.rows[0], "PUBLICATION_RELEASE_NOT_FOUND");
      assertReleaseReplay(release, input);
      return mapRelease(release);
    });
  }

  async getRelease(releaseId: string): Promise<PublicationRelease | null> {
    const result =
      await sql<Row>`SELECT * FROM publication.release WHERE id=${releaseId}::uuid`.execute(
        this.database,
      );
    return result.rows[0] ? mapRelease(result.rows[0]) : null;
  }

  async transitionRelease(input: {
    readonly releaseId: string;
    readonly status: PublicationReleaseStatus;
    readonly actorId: string;
    readonly correlationId?: string;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }): Promise<PublicationRelease> {
    const result =
      await sql<Row>`SELECT * FROM publication.fn_transition_release(${input.releaseId}::uuid,${input.status}::publication.release_status_d,${input.actorId}::uuid,${input.correlationId ?? null}::uuid,${JSON.stringify(input.evidence ?? {})}::jsonb)`.execute(
        this.database,
      );
    return mapRelease(
      required(result.rows[0], "PUBLICATION_RELEASE_NOT_FOUND"),
    );
  }

  async createArtifact(input: CreatePublicationArtifactInput): Promise<{
    readonly id: string;
    readonly status: PublicationArtifactStatus;
  }> {
    const result =
      await sql<Row>`INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by)
      VALUES(${input.id}::uuid,${input.releaseId}::uuid,${input.plane},${input.artifactKind},${input.artifactUri},${input.contentHash},'compiled',${input.actorId}::uuid)
      ON CONFLICT (id) DO NOTHING
      RETURNING *`.execute(this.database);
    const selected = result.rows[0]
      ? result
      : await sql<Row>`SELECT * FROM publication.artifact WHERE id=${input.id}::uuid`.execute(
          this.database,
        );
    const row = required(selected.rows[0], "PUBLICATION_ARTIFACT_NOT_FOUND");
    if (
      string(row, "publication_release_id") !== input.releaseId ||
      string(row, "plane_code") !== input.plane ||
      string(row, "artifact_kind") !== input.artifactKind ||
      string(row, "artifact_uri") !== input.artifactUri ||
      string(row, "content_hash") !== input.contentHash
    )
      throw new Error("PUBLICATION_ARTIFACT_IDEMPOTENCY_CONFLICT");
    return {
      id: string(row, "id"),
      status: string(row, "status") as PublicationArtifactStatus,
    };
  }

  async transitionArtifact(input: {
    readonly artifactId: string;
    readonly status: PublicationArtifactStatus;
    readonly signatureAlgorithm?: string;
    readonly signingKeyId?: string;
    readonly signature?: string;
  }): Promise<{
    readonly id: string;
    readonly status: PublicationArtifactStatus;
  }> {
    const result =
      await sql<Row>`SELECT * FROM publication.fn_transition_artifact(${input.artifactId}::uuid,${input.status}::publication.artifact_status_d,${input.signatureAlgorithm ?? null},${input.signingKeyId ?? null},${input.signature ?? null})`.execute(
        this.database,
      );
    const row = required(result.rows[0], "PUBLICATION_ARTIFACT_NOT_FOUND");
    return {
      id: string(row, "id"),
      status: string(row, "status") as PublicationArtifactStatus,
    };
  }

  async createDeployment(
    input: CreatePublicationDeploymentInput,
  ): Promise<PublicationDeploymentBundle> {
    await sql`SELECT publication.fn_create_deployment(${input.commandId}::uuid,${input.artifactId}::uuid,${input.targetPlane},${input.targetEnvironment},${input.targetInstance},${input.attempt},${input.correlationId ?? null}::uuid,${input.actorId}::uuid)`.execute(
      this.database,
    );
    const result = await deploymentQuery(this.database, input.commandId, true);
    return mapDeployment(required(result.rows[0], "DEPLOYMENT_NOT_FOUND"));
  }

  async getDeployment(
    deploymentId: string,
  ): Promise<PublicationDeploymentBundle | null> {
    const result = await deploymentQuery(this.database, deploymentId, false);
    return result.rows[0] ? mapDeployment(result.rows[0]) : null;
  }
  async listRecoverableDeployments(
    limit: number,
  ): Promise<readonly PublicationDeploymentBundle[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const result =
      await sql<Row>`SELECT d.*,a.artifact_uri,a.content_hash,a.signature_algorithm,a.signing_key_id,a.signature,r.release_key,r.id AS source_release_id,r.release_no
      FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id
      WHERE d.status IN ('pending','dispatched','received','staged','verified')
      ORDER BY d.created_at,d.id LIMIT ${safeLimit}`.execute(this.database);
    return result.rows.map(mapDeployment);
  }
  async transitionDeployment(input: {
    readonly deploymentId: string;
    readonly status: PublicationDeploymentStatus;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    await sql`SELECT publication.fn_transition_deployment(${input.deploymentId}::uuid,${input.status}::publication.deployment_status_d,${JSON.stringify(input.evidence ?? {})}::jsonb)`.execute(
      this.database,
    );
  }
  async acknowledge(
    input: AcknowledgeDeploymentInput,
  ): Promise<PublicationDeploymentAcknowledgement> {
    const result =
      await sql<Row>`SELECT * FROM publication.fn_acknowledge_activation(${input.deploymentId}::uuid,${input.targetInstance},${input.activeReleaseHash},${input.localAppliedReleaseId}::uuid,${JSON.stringify(input.evidence ?? {})}::jsonb)`.execute(
        this.database,
      );
    const row = required(result.rows[0], "ACKNOWLEDGEMENT_NOT_FOUND");
    return {
      id: string(row, "id"),
      deploymentId: string(row, "deployment_id"),
      targetInstance: string(row, "target_instance"),
      activeReleaseHash: string(row, "active_release_hash"),
      localAppliedReleaseId: string(row, "local_applied_release_id"),
      acknowledgedAt: date(row, "acknowledged_at"),
      evidence: object(row, "evidence"),
    };
  }
}

function deploymentQuery(
  database: Kysely<Database>,
  coordinate: string,
  byCommand: boolean,
) {
  return sql<Row>`SELECT d.*,a.artifact_uri,a.content_hash,a.signature_algorithm,a.signing_key_id,a.signature,r.release_key,r.id AS source_release_id,r.release_no FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE ${byCommand ? sql`d.command_id=${coordinate}::uuid` : sql`d.id=${coordinate}::uuid`}`.execute(
    database,
  );
}
function mapDeployment(row: Row): PublicationDeploymentBundle {
  return {
    deploymentId: string(row, "id"),
    deploymentStatus: string(row, "status") as PublicationDeploymentStatus,
    targetPlane: string(
      row,
      "target_plane",
    ) as PublicationDeploymentBundle["targetPlane"],
    targetEnvironment: string(row, "target_environment"),
    targetInstance: string(row, "target_instance"),
    publicationKey: string(row, "release_key"),
    sourceReleaseId: string(row, "source_release_id"),
    sourceReleaseNo: number(row, "release_no"),
    artifactUri: string(row, "artifact_uri"),
    artifactHash: string(row, "content_hash"),
    signatureAlgorithm: string(row, "signature_algorithm"),
    signingKeyId: string(row, "signing_key_id"),
    signature: string(row, "signature"),
  };
}
function mapRelease(row: Row): PublicationRelease {
  return {
    id: string(row, "id"),
    tenantId: string(row, "tenant_id"),
    publicationKey: string(row, "release_key"),
    releaseNo: number(row, "release_no"),
    releaseKind: string(
      row,
      "release_kind",
    ) as PublicationRelease["releaseKind"],
    status: string(row, "status") as PublicationReleaseStatus,
    createdAt: date(row, "created_at"),
    ...(row["approved_at"] ? { approvedAt: date(row, "approved_at") } : {}),
    ...(row["published_at"] ? { publishedAt: date(row, "published_at") } : {}),
    ...(row["withdrawn_at"] ? { withdrawnAt: date(row, "withdrawn_at") } : {}),
  };
}
function assertReleaseReplay(row: Row, input: CreatePublicationReleaseInput) {
  if (
    string(row, "tenant_id") !== input.tenantId ||
    string(row, "release_key") !== input.publicationKey ||
    number(row, "release_no") !== input.releaseNo ||
    string(row, "release_hash") !== input.releaseHash ||
    string(row, "manifest_hash") !== input.manifestHash
  )
    throw new Error("PUBLICATION_RELEASE_IDEMPOTENCY_CONFLICT");
}
function required(row: Row | undefined, code: string): Row {
  if (!row) throw new Error(code);
  return row;
}
function string(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string")
    throw new Error(`PUBLICATION_ROW_INVALID:${key}`);
  return value;
}
function number(row: Row, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value))
    throw new Error(`PUBLICATION_ROW_INVALID:${key}`);
  return value;
}
function date(row: Row, key: string): string {
  const value = row[key];
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf()))
    throw new Error(`PUBLICATION_ROW_INVALID:${key}`);
  return parsed.toISOString();
}
function object(row: Row, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
