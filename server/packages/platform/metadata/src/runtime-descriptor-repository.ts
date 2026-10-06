import type { PlaneKey } from "@athyper/server-foundation/context";
import type { EntityDescriptorRepository } from "@athyper/server-contract-metadata";
import {
  parseCompiledEntityArtifact,
  parseCompiledEntityReleaseEnvelope,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";
import {
  parseEntityRuntimeDescriptor,
  type RuntimeDescriptorRow,
} from "./descriptor-parser.js";
import type {
  CompiledEntityArtifactReadCoordinate,
  CompiledEntityReleaseCoordinate,
  CompiledEntityReleaseSource,
} from "./artifact-resolution.js";

type Database = Kysely<Record<string, never>>;

export interface RuntimeDescriptorRepositoryOptions {
  readonly databases: Partial<Readonly<Record<PlaneKey, Database>>>;
  readonly withTenantTransaction?: <Result>(
    planeKey: PlaneKey,
    actor: { readonly tenantId: string; readonly principalId: string },
    work: (database: Database) => Promise<Result>,
  ) => Promise<Result>;
}

export function createRuntimeDescriptorRepository(
  options: RuntimeDescriptorRepositoryOptions,
): EntityDescriptorRepository {
  return {
    async findActive(coordinate) {
      const database = options.databases[coordinate.planeKey];
      if (!database)
        throw new Error(
          `No runtime metadata database registered for ${coordinate.planeKey}`,
        );
      const execute = async (executor: Database) =>
        sql<RuntimeDescriptorRow>`
        SELECT c.entity_code, c.release_id::text, c.release_no, c.entity_contract_hash,
               d.plane_code, d.compiled_hash, d.compiled_json
          FROM runtime_meta.release_activation_head AS head
          JOIN runtime_meta.applied_release AS applied
            ON applied.id = head.applied_release_id AND applied.status = 'active'
          JOIN runtime_meta.entity_descriptor AS d
            ON d.applied_release_id = applied.id AND d.status = 'active'
           AND d.descriptor_kind = 'entity_runtime'
          JOIN runtime_meta.entity_contract AS c
            ON c.id = d.entity_contract_id AND c.status = 'published'
         WHERE d.plane_code = ${coordinate.planeKey}
           AND c.entity_code = ${coordinate.entityCode}
           AND (c.tenant_id IS NULL OR c.tenant_id = ${coordinate.tenantId}::uuid)
         ORDER BY (c.tenant_id IS NOT NULL) DESC, c.release_no DESC
         LIMIT 1
      `.execute(executor);
      const result = options.withTenantTransaction
        ? await options.withTenantTransaction(
            coordinate.planeKey,
            coordinate,
            execute,
          )
        : await execute(database);
      const row = result.rows[0];
      return row ? parseEntityRuntimeDescriptor(row) : null;
    },
  };
}

/**
 * Reads only activated v2 release payloads. A payload contains the signed release
 * envelope and immutable artifacts; it is produced by publication, never compiled
 * here. The JSON shape is intentionally explicit so a future object-store source can
 * keep the same reader contract while fetching each artifact by its manifest hash.
 */
export function createRuntimeMetaCompiledEntityReleaseSource(
  options: RuntimeDescriptorRepositoryOptions,
): CompiledEntityReleaseSource {
  return {
    async findAdmittedRelease(coordinate: CompiledEntityReleaseCoordinate) {
      const database = options.databases[coordinate.planeKey];
      if (!database)
        throw new Error(
          `No runtime metadata database registered for ${coordinate.planeKey}`,
        );
      const execute = async (executor: Database) =>
        sql<{ runtime_payload: unknown }>`
        SELECT payload.payload_json::text AS runtime_payload
          FROM runtime_meta.release_activation_head AS head
          JOIN runtime_meta.applied_release AS applied
            ON applied.id=head.applied_release_id AND applied.status='active'
          JOIN runtime_meta.applied_release_payload AS payload
            ON payload.applied_release_id=applied.id
         WHERE payload.artifact_kind='compiled_entity_runtime'
           AND (payload.coordinates->>'entityCode'=${coordinate.entityCode}
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(payload.payload_json->'release'->'artifacts') member
                WHERE member->>'artifactKey'=${`${coordinate.entityCode}/core`}
                  AND member->>'artifactType'='core'
                  AND member->>'entityCode'=${coordinate.entityCode}
             ))
           AND (payload.tenant_id IS NULL OR payload.tenant_id=${coordinate.tenantId}::uuid)
           AND (${coordinate.releaseId ?? null}::text IS NULL OR payload.payload_json->'release'->>'releaseId'=${coordinate.releaseId ?? null})
           AND (${coordinate.releaseHash ?? null}::text IS NULL OR payload.payload_json->'release'->>'releaseHash'=${coordinate.releaseHash ?? null})
         -- An entity's own publication outranks incidental reference members in
         -- another entity's bundle. Tenant precedence applies within that tier.
         -- Missing owner coordinates must not sort ahead of explicit ownership.
         ORDER BY CASE WHEN payload.coordinates->>'entityCode'=${coordinate.entityCode} THEN 0 ELSE 1 END,
                  (payload.tenant_id IS NOT NULL) DESC,
                  applied.activated_at DESC
         LIMIT 1
      `.execute(executor);
      const result = options.withTenantTransaction
        ? await options.withTenantTransaction(
            coordinate.planeKey,
            coordinate,
            execute,
          )
        : await execute(database);
      const row = result.rows[0];
      return row
        ? parseCompiledEntityReleaseEnvelope(
            releaseFromPayload(row.runtime_payload),
          )
        : null;
    },
    async findPublicationCoordinate(input) {
      const coordinate = input.coordinate;
      const database = options.databases[coordinate.planeKey];
      if (!database)
        throw new Error(
          `No runtime metadata database registered for ${coordinate.planeKey}`,
        );
      const execute = async (executor: Database) =>
        sql<{ release_id: string; release_no: number; contract_hash: string | null; entity_id: string | null; tenant_id: string | null }>`
        SELECT applied.source_release_id::text AS release_id, applied.source_release_no::int AS release_no,
               applied.manifest->'evidence'->>'sourceContractHash' AS contract_hash,
               applied.manifest->'evidence'->>'sourceEntityId' AS entity_id,
               payload.tenant_id::text AS tenant_id
          FROM runtime_meta.release_activation_head head
          JOIN runtime_meta.applied_release applied ON applied.id=head.applied_release_id AND applied.status='active'
          JOIN runtime_meta.applied_release_payload payload ON payload.applied_release_id=applied.id
         WHERE payload.artifact_kind='compiled_entity_runtime'
           AND (payload.tenant_id IS NULL OR payload.tenant_id=${coordinate.tenantId}::uuid)
           AND payload.payload_json->'release'->>'releaseHash'=${input.release.releaseHash}
           AND payload.payload_json->'release'->>'releaseId'=${input.release.releaseId}
         ORDER BY (payload.tenant_id IS NOT NULL) DESC, applied.activated_at DESC LIMIT 1
      `.execute(executor);
      const result = options.withTenantTransaction
        ? await options.withTenantTransaction(
            coordinate.planeKey,
            coordinate,
            execute,
          )
        : await execute(database);
      const row = result.rows[0];
      return row
        ? Object.freeze({
            releaseId: row.release_id,
            releaseNo: row.release_no,
            ...(row.contract_hash ? { contractHash: row.contract_hash.replace(/^sha256:/, "") } : {}),
            ...(row.entity_id ? { entityId: row.entity_id } : {}),
            tenantId: row.tenant_id,
          })
        : null;
    },
    async findArtifact(input: CompiledEntityArtifactReadCoordinate) {
      const planeKey = input.coordinate.planeKey;
      if (!input.release.targetPlanes.includes(planeKey))
        throw new Error("COMPILED_ENTITY_RELEASE_PLANE_NOT_ADMITTED");
      const database = options.databases[planeKey];
      if (!database)
        throw new Error(
          `No runtime metadata database registered for ${planeKey}`,
        );
      const execute = async (executor: Database) =>
        sql<{ artifact: unknown }>`
        SELECT artifact.value::text AS artifact
          FROM runtime_meta.applied_release AS applied
          JOIN runtime_meta.applied_release_payload AS payload
            ON payload.applied_release_id=applied.id
          CROSS JOIN LATERAL jsonb_array_elements(payload.payload_json->'artifacts') AS artifact(value)
         WHERE applied.status='active'
           AND payload.artifact_kind='compiled_entity_runtime'
           AND (payload.tenant_id IS NULL OR payload.tenant_id=${input.coordinate.tenantId}::uuid)
           AND payload.payload_json->'release'->>'releaseHash'=${input.release.releaseHash}
           AND payload.payload_json->'release'->>'releaseId'=${input.release.releaseId}
           AND artifact.value->>'artifactKey'=${input.entry.artifactKey}
         LIMIT 1
      `.execute(executor);
      const result = options.withTenantTransaction
        ? await options.withTenantTransaction(
            planeKey,
            input.coordinate,
            execute,
          )
        : await execute(database);
      const row = result.rows[0];
      return row
        ? parseCompiledEntityArtifact(artifactFromPayload(row.artifact))
        : null;
    },
  };
}

/** pg drivers differ: json/jsonb may arrive as an object or a serialized string. */
function jsonValue(value: unknown): unknown {
  let current = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  // Some pg type parsers return JSON text; some return a JSON string containing
  // JSON. Normalize both representations before contract validation.
  for (let pass = 0; pass < 2 && typeof current === "string"; pass += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      throw new Error("COMPILED_ENTITY_RUNTIME_JSON_INVALID");
    }
  }
  return current;
}

function releaseFromPayload(value: unknown): unknown {
  const payload = jsonValue(value);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error(
      `COMPILED_ENTITY_RUNTIME_PAYLOAD_INVALID:${typeof payload}`,
    );
  const release = (payload as Record<string, unknown>).release;
  if (!release)
    throw new Error(
      `COMPILED_ENTITY_RUNTIME_RELEASE_MISSING:${Object.keys(payload as Record<string, unknown>).join(",")}`,
    );
  return jsonValue(release);
}

function artifactFromPayload(value: unknown): unknown {
  const artifact = jsonValue(value);
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact))
    return artifact;
  const content = (artifact as Record<string, unknown>).content;
  return content && typeof content === "object" && !Array.isArray(content)
    ? content
    : artifact;
}

/** Candidate discovery is metadata-owner SQL, never a model-supplied query. */
export function createPublishedEntityCatalogue(
  options: RuntimeDescriptorRepositoryOptions,
) {
  return async (
    context: Parameters<
      import("@athyper/server-contract-metadata").MetadataReader["getEntityDescriptor"]
    >[0],
  ): Promise<readonly string[]> => {
    const database = options.databases[context.planeKey];
    if (!database || !options.withTenantTransaction)
      throw new Error("Tenant metadata transaction required");
    const result = await options.withTenantTransaction(
      context.planeKey,
      context,
      async (executor) =>
        sql<{ entity_code: string }>`
      SELECT DISTINCT entity_code FROM (
        SELECT c.entity_code
        FROM runtime_meta.release_activation_head h
        JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
        JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active' AND d.descriptor_kind='entity_runtime'
        JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published'
        WHERE d.plane_code=${context.planeKey} AND (c.tenant_id IS NULL OR c.tenant_id=${context.tenantId}::uuid)
        UNION
        SELECT p.coordinates->>'entityCode' AS entity_code
        FROM runtime_meta.release_activation_head h
        JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
        JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=a.id AND p.artifact_kind='compiled_entity_runtime'
        WHERE (p.tenant_id IS NULL OR p.tenant_id=${context.tenantId}::uuid)
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.payload_json->'artifacts') artifact WHERE artifact->>'artifactType'='runtime_contract')
      ) candidates WHERE entity_code IS NOT NULL ORDER BY entity_code LIMIT 257
    `.execute(executor),
    );
    return result.rows.map((row) => row.entity_code);
  };
}
