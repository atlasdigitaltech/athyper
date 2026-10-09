import { sql, type Kysely } from "kysely";
import {
  assertEntitySuccessorTargetHead,
  type EntitySuccessorTargetPin,
  type PublicationPlane,
} from "@athyper/server-contract-publication";

/** Pre-dispatch freshness check only. The target SQL activation guard performs
 * the authoritative compare-and-swap under its lock. No cross-plane atomicity. */
export async function assertSuccessorTargetHeads(
  pins: readonly EntitySuccessorTargetPin[],
  databases: Partial<Record<PublicationPlane, Kysely<Record<string, never>>>>,
): Promise<void> {
  for (const pin of pins) {
    const db = databases[pin.plane];
    if (!db) throw Error("ENTITY_SUCCESSOR_TARGET_DATABASE_REQUIRED");
    const rows = (
      await sql<{
        applied_release_id: string;
        source_release_id: string;
        source_release_no: number | string;
        artifact_hash: string;
        row_version: number | string;
        valid: boolean;
      }>`
      SELECT h.applied_release_id,a.source_release_id,h.source_release_no,h.artifact_hash,h.row_version,
        (a.publication_key=h.publication_key AND a.status='active' AND a.source_release_no=h.source_release_no AND a.artifact_hash=h.artifact_hash) AS valid
      FROM runtime_meta.release_activation_head h LEFT JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
      WHERE h.publication_key=${pin.publicationKey}`.execute(db)
    ).rows;
    if (rows.length > 1 || (rows.length === 1 && rows[0]!.valid !== true))
      throw Error("ENTITY_SUCCESSOR_TARGET_HEAD_INVALID");
    const head = rows.length === 1 ? rows[0]! : null;
    assertEntitySuccessorTargetHead(
      pin,
      head
        ? {
            plane: pin.plane,
            environment: pin.environment,
            instance: pin.instance,
            publicationKey: pin.publicationKey,
            appliedReleaseId: head.applied_release_id,
            sourceReleaseId: head.source_release_id,
            sourceReleaseNo: Number(head.source_release_no),
            artifactHash: head.artifact_hash,
            headVersion: Number(head.row_version),
          }
        : null,
    );
  }
}
