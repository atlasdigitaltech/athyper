import { sql } from "kysely";
import type { CollaborationTransaction } from "./kysely-collaboration-repository.js";

/** Called inside the plane maintenance transaction. No object storage operations. */
export async function expireCommentDrafts(
  tx: CollaborationTransaction,
  limit = 100,
) {
  const drafts = (
    await sql<{
      id: string;
      tenant_id: string;
      principal_id: string;
    }>`SELECT id::text,tenant_id::text,principal_id::text FROM document.comment_draft WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT ${Math.min(100, Math.max(1, limit))} FOR UPDATE SKIP LOCKED`.execute(
      tx,
    )
  ).rows;
  const orphaned: {
    tenantId: string;
    principalId: string;
    attachmentId: string;
  }[] = [];
  for (const draft of drafts) {
    // Shared evidence retains its bytes and association. The obsolete draft FK
    // is detached for all attachments before deleting the locked draft.
    const rows = (
      await sql<{
        id: string;
      }>`UPDATE document.attachment a SET draft_id=NULL,metadata=metadata-'draft_id'-'draft_principal_id',status=CASE WHEN a.uploaded_by=${draft.principal_id}::uuid AND a.status IN ('active','pending','uploading','uploaded') AND NOT EXISTS(SELECT 1 FROM document.attachment_link l WHERE l.tenant_id=a.tenant_id AND l.attachment_series_id=a.series_id) THEN 'orphaned' ELSE a.status END,updated_at=clock_timestamp(),updated_by=${draft.principal_id}::uuid WHERE a.tenant_id=${draft.tenant_id}::uuid AND a.draft_id=${draft.id}::uuid RETURNING a.id::text`.execute(
        tx,
      )
    ).rows;
    for (const row of rows) {
      const candidate = (
        await sql`SELECT id FROM document.attachment WHERE tenant_id=${draft.tenant_id}::uuid AND id=${row.id}::uuid AND status='orphaned'`.execute(
          tx,
        )
      ).rows[0];
      if (candidate) {
        await sql`UPDATE document.attachment SET is_active=false WHERE tenant_id=${draft.tenant_id}::uuid AND id=${row.id}::uuid`.execute(
          tx,
        );
      }
      if (candidate)
        orphaned.push({
          tenantId: draft.tenant_id,
          principalId: draft.principal_id,
          attachmentId: row.id,
        });
    }
    await sql`DELETE FROM document.comment_draft WHERE tenant_id=${draft.tenant_id}::uuid AND id=${draft.id}::uuid AND expires_at<=clock_timestamp()`.execute(
      tx,
    );
  }
  return orphaned;
}
