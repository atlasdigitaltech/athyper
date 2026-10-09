import { assertLocalPublicationEnvironment } from "@athyper/server-contract-publication";
import { withLocalPublicationRequest } from "./local-publication-database.js";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { sql, type Kysely, type Transaction } from "kysely";
import {
  compileNativePublication,
  nativePublicationTargets,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { publicationCompilerIdentity } from "./compiler-build.js";
import { resolveLocalPublicationAuthority } from "./local-publication-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import { createNativeReviewSource } from "../../control-plane/native-review-source.js";
import type { ComponentLoaderOptions } from "./active-component-source.js";
import type { AuthoringServiceOptions } from "@athyper/server-plane-studio-meta-entity-authoring";

/** Production host composition for native publication. Configuration is a private
 * deployment file, not request data or a source of publication authority. The SQL
 * reader requires the current enrolled workload for each locked source read. */
export function createNativePublicationStartup(options: {
  environment: NodeJS.ProcessEnv;
  loader: ComponentLoaderOptions;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
  localConfiguration?: PublicationWorkloadConfiguration;
  localRequests?: {
    host: Parameters<typeof withLocalPublicationRequest>[0]["host"];
    resolveCurrent: Parameters<
      typeof withLocalPublicationRequest
    >[0]["resolveCurrent"];
    run<T>(
      work: (
        tx: import("kysely").Transaction<Record<string, never>>,
      ) => Promise<T>,
    ): Promise<T>;
  };
  run<T>(work: (tx: Kysely<Record<string, never>>) => Promise<T>): Promise<T>;
}): Pick<AuthoringServiceOptions, "nativePublicationSource"> & {
  readNativeSource?: ReturnType<typeof createNativeReviewSource>;
  readLocalNativeSource?: (
    requestHash: string,
  ) => ReturnType<ReturnType<typeof createNativeReviewSource>>;
} {
  const path = options.environment.PUBLICATION_NATIVE_SOURCE_CONFIGURATION_FILE;
  if (options.localConfiguration?.localAuthority) {
    assertLocalPublicationEnvironment(options.localConfiguration);
    if (path === undefined)
      throw Error("LOCAL_PUBLICATION_NATIVE_CONFIGURATION_REQUIRED");
  }
  if (path === undefined) return {};
  if (!isAbsolute(path))
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  const info = statSync(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65536)
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  if (!options.loader.uiComponents)
    throw Error("NATIVE_PUBLICATION_COMPONENT_QUALIFICATION_REQUIRED");
  const source = createNativeReviewSource({
    configuration: JSON.parse(readFileSync(path, "utf8")),
    loader: options.loader,
    authority: "publication-worker",
    targetDatabases: options.targetDatabases,
  });
  const local = options.localConfiguration;
  if (local?.localAuthority && options.localRequests)
    throw Error("LOCAL_PUBLICATION_CONFIGURATION_AMBIGUOUS");
  const localRequests = local?.localAuthority
    ? {
        host: {
          environment: local.environment,
          instance: local.instance,
          domainSuffix: local.domainSuffix,
        },
        run: <T>(
          work: (tx: Transaction<Record<string, never>>) => Promise<T>,
        ) =>
          options.run(async (database) => {
            if (!database.isTransaction)
              throw Error("LOCAL_PUBLICATION_TRANSACTION_REQUIRED");
            const tx = database as Transaction<Record<string, never>>;
            await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${local.tenantId},true),
        set_config('app.current_principal_id',${local.publisher.principalId},true)`.execute(
              tx,
            );
            const actor =
              await sql`SELECT id FROM master.principal WHERE tenant_id=${local.tenantId}::uuid
        AND id=${local.publisher.principalId}::uuid AND code=${local.publisher.code} AND principal_type='service_account'
        AND status='active' AND auth_epoch=${local.publisher.authEpoch}`.execute(
                tx,
              );
            if (actor.rows.length !== 1)
              throw Error("LOCAL_PUBLICATION_WORKLOAD_REVOKED");
            return work(tx);
          }),
        resolveCurrent: async (
          request: Parameters<
            NonNullable<typeof options.localRequests>["resolveCurrent"]
          >[0],
          tx: Transaction<Record<string, never>>,
        ) => {
          const authority = await resolveLocalPublicationAuthority({
            transaction: tx,
            context: {
              tenantId: local.tenantId,
              principalId: local.publisher.principalId,
              planeKey: "studio",
            },
            pin: local.localAuthority!,
          });
          if (
            authority.authorWorkloadId !== local.author.principalId ||
            authority.publisherWorkloadId !== local.publisher.principalId
          )
            throw Error("LOCAL_PUBLICATION_WORKLOAD_MISMATCH");
          const resolved = await source(tx, request.inputs.changeSetId);
          const compiled = compileNativePublication(resolved);
          const current = await sql<{
            lock_version: string | number;
          }>`SELECT root_json->>'lock_version' AS lock_version FROM publication.read_native_worker_source(${request.inputs.changeSetId}::uuid,4194304)`.execute(
            tx,
          );
          if (current.rows.length !== 1)
            throw Error("LOCAL_PUBLICATION_SOURCE_UNAVAILABLE");
          const key = `metadata.${resolved.graph.entity.entityClass === "reference" ? "reference" : "entity"}.${resolved.graph.entity.entityCode}`;
          const targets = [];
          for (const target of nativePublicationTargets(
            resolved.graph,
            compiled,
          )) {
            const db =
              target.targetPlane === "studio"
                ? tx
                : options.targetDatabases?.[target.targetPlane];
            if (!db) throw Error("LOCAL_PUBLICATION_TARGET_DATABASE_REQUIRED");
            const head = await sql<{
              artifact_hash: string;
              valid: boolean;
            }>`SELECT h.artifact_hash,
          (a.status='active' AND a.publication_key=h.publication_key AND a.artifact_hash=h.artifact_hash
          AND a.source_release_no=h.source_release_no) AS valid
          FROM runtime_meta.release_activation_head h LEFT JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
          WHERE h.publication_key=${key}`.execute(db);
            if (
              head.rows.length > 1 ||
              (head.rows.length === 1 && head.rows[0]!.valid !== true)
            )
              throw Error("LOCAL_PUBLICATION_HEAD_INVALID");
            targets.push({
              plane: target.targetPlane,
              instance: local.instance,
              predecessorHash: head.rows[0]?.artifact_hash ?? null,
              artifactHash: target.artifact.descriptorHash,
            });
          }
          return {
            authority,
            inputs: {
              changeSetId: request.inputs.changeSetId,
              revision: Number(current.rows[0]!.lock_version),
              sourceHash: compiled.contractHash,
              compilerHash: publicationCompilerIdentity().buildHash,
              resourceHashes: [
                ...new Set(
                  (resolved.targetCompilers ?? [resolved.compiler]).map(
                    (context) => sha256(context),
                  ),
                ),
              ].sort(),
              targets,
            },
          };
        },
      }
    : options.localRequests;
  return {
    ...(localRequests
      ? {
          readLocalNativeSource: (requestHash: string) =>
            localRequests!.run((tx) =>
              withLocalPublicationRequest({
                transaction: tx,
                host: localRequests!.host,
                requestHash,
                resolveCurrent: localRequests!.resolveCurrent,
                execute: (request, transaction) =>
                  source(transaction, request.inputs.changeSetId),
              }),
            ),
        }
      : {}),
    readNativeSource: source,
    nativePublicationSource: (id) => options.run((tx) => source(tx, id)),
  };
}
