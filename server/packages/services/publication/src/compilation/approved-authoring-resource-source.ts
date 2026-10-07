import { sql, type Kysely } from "kysely";
import {
  parseEntityAuthoringResource,
  type PublicationCanonicalizer,
} from "@athyper/server-contract-publication";
import type {
  EntityAuthoringResourcePublication,
  EntityAuthoringResourceSource,
} from "./entity-authoring-resource.js";
/** Generated resource snapshots are supplied by the owning resource store. The
 * publication ledger hash binds the complete snapshot, not merely its payload.
 * This adapter never writes source or treats a file's approval claim as authority. */
export function createApprovedAuthoringResourcePublication(options: {
  database: Kysely<Record<string, never>>;
  authorityTenantId: string;
  maximumBytes: number;
  canonical: PublicationCanonicalizer;
  readSnapshot(releaseId: string): Promise<unknown>;
  authorizeReview(input: {
    releaseId: string;
    authorId: string;
    reviewerId: string;
    sourceHash: string;
    phase: "compile" | "sign" | "dispatch";
  }): Promise<void>;
  qualifyResource(source: EntityAuthoringResourceSource): Promise<void>;
}): EntityAuthoringResourcePublication {
  if (
    !options.authorizeReview ||
    !options.qualifyResource ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  )
    throw Error("AUTHORING_RESOURCE_SOURCE_CONFIGURATION_INVALID");
  async function resolve(
    releaseId: string,
    phase: "compile" | "sign" | "dispatch",
  ) {
    const source = structuredClone(
      await options.readSnapshot(releaseId),
    ) as EntityAuthoringResourceSource;
    if (
      !source ||
      typeof source !== "object" ||
      Array.isArray(source) ||
      Object.keys(source).sort().join() !==
        "generatedAt,kind,payload,publicationKey,releaseId,releaseNo" ||
      source.releaseId !== releaseId ||
      !Number.isSafeInteger(source.releaseNo) ||
      source.releaseNo < 1 ||
      !Number.isFinite(Date.parse(source.generatedAt))
    )
      throw Error("AUTHORING_RESOURCE_SOURCE_INVALID");
    parseEntityAuthoringResource(source.kind, source.payload);
    const bytes = options.canonical.canonicalBytes(source);
    if (bytes.length > options.maximumBytes)
      throw Error("AUTHORING_RESOURCE_SOURCE_BUDGET_EXCEEDED");
    const sourceHash = options.canonical.sha256(bytes);
    await options.database.transaction().execute(async (tx) => {
      const rows = (
        await sql<{
          author_id: string;
          reviewer_id: string;
        }>`SELECT created_by AS author_id,approved_by AS reviewer_id FROM publication.release WHERE id=${releaseId}::uuid AND tenant_id=${options.authorityTenantId}::uuid AND release_key=${source.publicationKey} AND release_no=${source.releaseNo} AND release_kind='publish' AND compatibility_level='breaking' AND status IN ('approved','published') AND release_hash=${sourceHash} AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>created_by AND metadata->>'artifactKind'=${source.kind} FOR SHARE`.execute(
          tx,
        )
      ).rows;
      if (rows.length !== 1)
        throw Error("AUTHORING_RESOURCE_APPROVED_SOURCE_REQUIRED");
      const row = rows[0]!;
      if (source.kind === "entity_identity_review") {
        const payload = parseEntityAuthoringResource(
          source.kind,
          source.payload,
        );
        if (
          payload.schema !== "entity.legacy-identity-review/1" ||
          payload.proposerId !== row.author_id ||
          payload.reviewerId !== row.reviewer_id
        )
          throw Error("AUTHORING_RESOURCE_REVIEW_ATTRIBUTION_MISMATCH");
      }
      await options.authorizeReview({
        releaseId,
        authorId: row.author_id,
        reviewerId: row.reviewer_id,
        sourceHash,
        phase,
      });
      await options.qualifyResource(structuredClone(source));
    });
    return source;
  }
  return {
    load: (releaseId) => resolve(releaseId, "compile"),
    async qualify(source, phase) {
      const current = await resolve(source.releaseId, phase);
      if (
        options.canonical.sha256(options.canonical.canonicalBytes(current)) !==
        options.canonical.sha256(options.canonical.canonicalBytes(source))
      )
        throw Error("AUTHORING_RESOURCE_SOURCE_CHANGED");
    },
  };
}
