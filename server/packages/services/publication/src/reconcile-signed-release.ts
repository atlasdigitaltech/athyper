import { sql, type Kysely } from "kysely";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";

/** Publication records durable signed content, not completion of deployment.
 * Reconcile only the current tenant's approved release after every
 * committed compilation has its signed artifact. The existing transition owns
 * timestamps, audit attribution, outbox emission and idempotency. */
export async function reconcileSignedRelease(
  database: Kysely<Record<string, never>>,
  releaseId: string,
): Promise<boolean> {
  const work = async (tx: Kysely<Record<string, never>>) => {
    // Signing jobs run concurrently. Serialize the completion read so the last
    // committer sees the earlier signatures instead of both missing each other.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${"publication-signing:" + releaseId},0))`.execute(
      tx,
    );
    const row = (
      await sql<{ actor_id: string; status: string; complete: boolean }>`
      SELECT master.current_principal_id_soft() AS actor_id,r.status,
        EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=r.id)
        AND NOT EXISTS (
          SELECT 1 FROM publication.artifact_compilation c
          LEFT JOIN publication.artifact a ON a.publication_release_id=c.publication_release_id
            AND a.plane_code=c.plane_code AND a.artifact_kind=c.artifact_kind
          WHERE c.publication_release_id=r.id AND
            (a.id IS NULL OR a.status<>'signed' OR a.signature IS NULL OR a.signed_at IS NULL)
        ) AS complete
      FROM publication.release r WHERE r.id=${releaseId}::uuid
        AND r.tenant_id=shared.current_tenant_id_soft()
        AND master.current_principal_id_soft() IS NOT NULL
    `.execute(tx)
    ).rows[0];
    if (!row) throw Error("PUBLICATION_RECONCILIATION_SCOPE_REQUIRED");
    if (row.status === "published") return true;
    if (row.status !== "approved")
      throw Error("PUBLICATION_RECONCILIATION_APPROVAL_REQUIRED");
    if (!row.complete) return false;
    await new KyselyPublicationAuthorityRepository(tx).transitionRelease({
      releaseId,
      status: "published",
      actorId: row.actor_id,
      evidence: { basis: "complete_signed_compilation_set" },
    });
    return true;
  };
  return database.isTransaction
    ? work(database)
    : database.transaction().execute(work);
}
