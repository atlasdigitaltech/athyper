import { sql, type Kysely } from "kysely";
import type { LocalPublicationInputs } from "@athyper/server-contract-publication";
import { publicationCompilerIdentity } from "./compiler-build.js";

type Database = Kysely<Record<string, never>>;
export interface LocalRollbackTarget {
  publication_key: string;
  target_plane: "studio" | "neon" | "mesh";
  artifact_hash: string;
  applied_release_id: string;
  source_release_id: string;
}
/** The selected source is an existing published draft. Target coordinates come
 * from signed, acknowledged artifacts, never arbitrary client supplied hashes. */
export async function readLocalRollbackTargets(
  database: Database,
  changeSetId: string,
) {
  const rows = (
    await sql<LocalRollbackTarget>`SELECT * FROM publication.read_local_rollback_targets(${changeSetId}::uuid)`.execute(
      database,
    )
  ).rows;
  if (
    !rows.length ||
    rows.length > 3 ||
    new Set(rows.map((r) => r.target_plane)).size !== rows.length ||
    new Set(rows.map((r) => r.publication_key)).size !== 1
  )
    throw Error("LOCAL_ROLLBACK_TARGET_UNAVAILABLE");
  return rows;
}
export async function resolveLocalRollbackInputs(options: {
  database: Database;
  targetDatabases?: Partial<Record<"neon" | "mesh", Database>>;
  changeSetId: string;
  revision: number;
  sourceHash: string;
  instance: string;
}): Promise<LocalPublicationInputs> {
  const artifacts = await readLocalRollbackTargets(
    options.database,
    options.changeSetId,
  );
  const targets: LocalPublicationInputs["targets"][number][] = [];
  for (const target of artifacts) {
    const db =
      target.target_plane === "studio"
        ? options.database
        : options.targetDatabases?.[target.target_plane];
    if (!db) throw Error("LOCAL_ROLLBACK_DATABASE_REQUIRED");
    const rows =
      target.target_plane === "studio"
        ? (
            await sql<{
              artifact_hash: string;
            }>`SELECT artifact_hash FROM publication.read_local_publication_predecessor(${options.changeSetId}::uuid) WHERE publication_key=${target.publication_key}`.execute(
              db,
            )
          ).rows
        : (
            await sql<{
              artifact_hash: string;
            }>`SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key=${target.publication_key}`.execute(
              db,
            )
          ).rows;
    if (rows.length !== 1) throw Error("LOCAL_ROLLBACK_HEAD_REQUIRED");
    targets.push({
      plane: target.target_plane,
      instance: options.instance,
      predecessorHash: rows[0]!.artifact_hash,
      artifactHash: target.artifact_hash,
    });
  }
  return {
    changeSetId: options.changeSetId,
    revision: options.revision,
    sourceHash: options.sourceHash,
    compilerHash: publicationCompilerIdentity().buildHash,
    resourceHashes: [...new Set(artifacts.map((a) => a.artifact_hash))].sort(),
    targets,
  };
}
