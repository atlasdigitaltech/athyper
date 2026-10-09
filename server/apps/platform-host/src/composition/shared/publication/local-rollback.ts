import { sql, type Kysely } from "kysely";
import {
  assertLocalPublicationRequest,
  type LocalPublicationRequest,
} from "@athyper/server-contract-publication";
import { createTenantRollbackExecutor } from "./tenant-rollback.js";
import { assertRollbackEntityReadiness } from "./rollback-readiness.js";
import { assertLocalRollbackCompatible } from "./local-rollback-compatibility.js";
import { readLocalRollbackTargets } from "./local-rollback-inputs.js";
import { publicationCompilerIdentity } from "./compiler-build.js";
import { resolveLocalPublicationAuthority } from "./local-publication-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
/** Invoked by the existing durable local-request job. Each destination rechecks
 * current standing authority under publisher attribution before touching its head.
 * The existing rollback routine records operationId and handles exact retries. */
export function createLocalRollbackExecution(options: {
  database: Database;
  databases: Partial<Record<"studio" | "neon" | "mesh", Database>>;
  configuration: PublicationWorkloadConfiguration;
  readiness: Parameters<typeof assertRollbackEntityReadiness>[3];
}) {
  const c = options.configuration;
  const read = async (hash: string) =>
    options.database.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${c.tenantId},true),set_config('app.current_principal_id',${c.publisher.principalId},true)`.execute(
        tx,
      );
      const checked = (
        await sql<{
          value: { request: LocalPublicationRequest };
        }>`SELECT publication.read_local_publication_request(${hash}) AS value`.execute(
          tx,
        )
      ).rows[0]?.value;
      if (!checked || checked.request.hash !== hash)
        throw Error("LOCAL_ROLLBACK_REQUEST_UNAVAILABLE");
      const request = checked.request;
      if (request.admission.action !== "rollback") return null;
      if (
        !c.localAuthority ||
        request.authority.id !== c.localAuthority.id ||
        request.authority.hash !== c.localAuthority.hash ||
        request.authority.version !== c.localAuthority.version
      )
        throw Error("LOCAL_ROLLBACK_AUTHORITY_CHANGED");
      const authority = await resolveLocalPublicationAuthority({
        transaction: tx,
        context: {
          tenantId: c.tenantId,
          principalId: c.publisher.principalId,
          planeKey: "studio",
        },
        pin: c.localAuthority,
      });
      assertLocalPublicationRequest(request, authority, request.admission, {
        ...request.inputs,
        compilerHash: publicationCompilerIdentity().buildHash,
      });
      await sql`SELECT set_config('app.local_publication_request_hash',${hash},true)`.execute(
        tx,
      );
      const targets = await readLocalRollbackTargets(
        tx,
        request.inputs.changeSetId,
      );
      if (
        targets.length !== request.inputs.targets.length ||
        targets.some(
          (t) =>
            !request.inputs.targets.some(
              (p) =>
                p.plane === t.target_plane &&
                p.artifactHash === t.artifact_hash,
            ),
        )
      )
        throw Error("LOCAL_ROLLBACK_TARGET_CHANGED");
      return { request, targets };
    });
  return async (hash: string): Promise<boolean> => {
    const initial = await read(hash);
    if (!initial) return false;
    for (const target of initial.targets) {
      const database = options.databases[target.target_plane];
      if (!database) throw Error("LOCAL_ROLLBACK_DATABASE_REQUIRED");
      const pin = initial.request.inputs.targets.find(
        (p) => p.plane === target.target_plane,
      )!;
      const executor = createTenantRollbackExecutor(
        database,
        options.database,
        target.target_plane,
        async (tx, id, plane) => {
          const fresh = await read(hash);
          if (!fresh || fresh.request.hash !== initial.request.hash)
            throw Error("LOCAL_ROLLBACK_AUTHORITY_CHANGED");
          const rows = (
            await sql<{
              current_id: string;
              current_hash: string;
              current_payload: unknown;
              target_payload: unknown;
              target_hash: string;
            }>`
          SELECT h.applied_release_id::text current_id,h.artifact_hash current_hash,p.payload_json current_payload,
           t.payload_json target_payload,a.artifact_hash target_hash FROM runtime_meta.release_activation_head h
          JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=h.applied_release_id AND p.artifact_kind='compiled_entity_runtime'
          JOIN runtime_meta.applied_release a ON a.id=${id}::uuid AND a.publication_key=h.publication_key
          JOIN runtime_meta.applied_release_payload t ON t.applied_release_id=a.id AND t.artifact_kind='compiled_entity_runtime'
          WHERE h.publication_key=${target.publication_key}`.execute(tx)
          ).rows;
          const row = rows[0];
          if (
            rows.length !== 1 ||
            !row ||
            row.target_hash !== pin.artifactHash ||
            (row.current_hash !== pin.predecessorHash &&
              !(row.current_id === id && row.current_hash === pin.artifactHash))
          )
            throw Error("LOCAL_ROLLBACK_HEAD_CHANGED");
          assertLocalRollbackCompatible(
            row.current_payload,
            row.target_payload,
          );
          await assertRollbackEntityReadiness(tx, id, plane, options.readiness);
        },
      );
      await executor.rollback({
        tenantId: c.tenantId,
        actorId: c.publisher.principalId,
        targetPlane: target.target_plane,
        publicationKey: target.publication_key,
        targetAppliedReleaseId: target.applied_release_id,
        reason: `local_development_authority:${hash}:developer:${initial.request.admission.developerPrincipalId}`,
        operationId: `local-rollback:${hash}:${target.target_plane}`,
      });
    }
    return true;
  };
}
