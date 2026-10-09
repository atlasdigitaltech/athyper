import { sql, type Kysely } from "kysely";
import {
  compileNativePublication,
  nativePublicationTargets,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import type { LocalPublicationInputs } from "@athyper/server-contract-publication";
import type { createNativeReviewSource } from "../../control-plane/native-review-source.js";
import { publicationCompilerIdentity } from "./compiler-build.js";

/** Same trusted compilation/head resolution for developer admission and workers.
 * Request bodies supply neither artifacts nor compiler/resource/head pins. */
export async function resolveLocalPublicationInputs(options: {
  database: Kysely<Record<string, never>>;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
  source: Awaited<ReturnType<ReturnType<typeof createNativeReviewSource>>>;
  changeSetId: string;
  revision: number;
  instance: string;
}): Promise<LocalPublicationInputs> {
  const resolved = options.source;
  const compiled = compileNativePublication(resolved);
  const key = `metadata.${resolved.graph.entity.entityClass === "reference" ? "reference" : "entity"}.${resolved.graph.entity.entityCode}`;
  const targets: LocalPublicationInputs["targets"][number][] = [];
  for (const target of nativePublicationTargets(resolved.graph, compiled)) {
    const db =
      target.targetPlane === "studio"
        ? options.database
        : options.targetDatabases?.[target.targetPlane];
    if (!db) throw Error("LOCAL_PUBLICATION_TARGET_DATABASE_REQUIRED");
    const head = await sql<{
      artifact_hash: string;
      valid: boolean;
    }>`SELECT h.artifact_hash,
 (a.status='active' AND a.publication_key=h.publication_key AND a.artifact_hash=h.artifact_hash AND a.source_release_no=h.source_release_no) AS valid
 FROM runtime_meta.release_activation_head h LEFT JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
 WHERE h.publication_key=${key}`.execute(db);
    if (
      head.rows.length > 1 ||
      (head.rows.length === 1 && head.rows[0]!.valid !== true)
    )
      throw Error("LOCAL_PUBLICATION_HEAD_INVALID");
    targets.push({
      plane: target.targetPlane,
      instance: options.instance,
      predecessorHash: head.rows[0]?.artifact_hash ?? null,
      artifactHash: target.artifact.descriptorHash,
    });
  }
  return {
    changeSetId: options.changeSetId,
    revision: options.revision,
    sourceHash: compiled.contractHash,
    compilerHash: publicationCompilerIdentity().buildHash,
    resourceHashes: [
      ...new Set(
        (resolved.targetCompilers ?? [resolved.compiler]).map((context) =>
          sha256(context),
        ),
      ),
    ].sort(),
    targets,
  };
}
