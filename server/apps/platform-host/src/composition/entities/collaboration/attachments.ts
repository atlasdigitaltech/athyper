import { sql } from "kysely";
import type {
  CollaborationTransactions,
  CollaborationSectionProvider,
} from "./contracts.js";

/** Admitted record workspace read; pending transfers remain private to their uploader. */
export function createAttachmentSectionProvider(
  transactions: CollaborationTransactions,
): CollaborationSectionProvider {
  return {
    async read({ context, core, recordId, limit, cursor }) {
      // A record can have several semantic links to a series.  The reader
      // deliberately selects one current/pinned version per series so a
      // drawer and content view cannot disagree by displaying duplicates.
      const rows = await transactions.run(
        context.planeKey,
        context,
        async (tx) =>
          (
            await sql<{
              id: string;
              series_id: string;
              link_id: string;
              pinned_attachment_id: string | null;
              link_kind: string;
              folder_id: string | null;
              folder_name: string | null;
              category: string | null;
              version_no: number;
              file_name: string;
              display_name: string | null;
              content_type: string | null;
              size_bytes: string | number | null;
              status: string;
              created_at: Date | string;
              updated_at: Date | string | null;
              series_revision: string;
            }>`WITH visible AS (SELECT DISTINCT ON (attachment.series_id) attachment.id::text,attachment.series_id::text,link.id::text link_id,link.pinned_attachment_id::text,link.link_kind,link.folder_id::text,folder.name folder_name,link.metadata->>'category' category,attachment.version_no,attachment.file_name,series.display_name,attachment.content_type,attachment.size_bytes,attachment.status,attachment.created_at,attachment.updated_at,series.revision_no::text series_revision FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id JOIN document.attachment_link link ON link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id LEFT JOIN document.attachment_folder folder ON folder.tenant_id=link.tenant_id AND folder.id=link.folder_id WHERE attachment.tenant_id=${context.tenantId}::uuid AND link.entity_type=${core.entityCode} AND link.entity_id=${recordId} AND attachment.id=COALESCE(link.pinned_attachment_id,series.current_attachment_id) AND attachment.is_active AND attachment.is_virus_scanned AND attachment.status='active' AND (attachment.expires_at IS NULL OR attachment.expires_at>clock_timestamp()) ${cursor ? sql`AND (attachment.created_at,attachment.id)<(SELECT created_at,id FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND id=${cursor}::uuid)` : sql``} ORDER BY attachment.series_id,(link.pinned_attachment_id IS NOT NULL) DESC,link.created_at DESC,link.id DESC,attachment.created_at DESC,attachment.id DESC) SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`.execute(
              tx,
            )
          ).rows,
      );
      const pendingRows = await transactions.run(
        context.planeKey,
        context,
        async (tx) =>
          (
            await sql<{
              id: string;
              series_id: string;
              link_id: string;
              pinned_attachment_id: string | null;
              link_kind: string;
              folder_id: string | null;
              folder_name: string | null;
              category: string | null;
              version_no: number;
              file_name: string;
              display_name: string | null;
              content_type: string | null;
              size_bytes: string | number | null;
              status: string;
              created_at: Date | string;
              updated_at: Date | string | null;
              series_revision: string;
            }>`SELECT attachment.id::text,attachment.series_id::text,link.id::text link_id,NULL::text pinned_attachment_id,link.link_kind,link.folder_id::text,folder.name folder_name,link.metadata->>'category' category,attachment.version_no,attachment.file_name,series.display_name,attachment.content_type,attachment.size_bytes,attachment.status,attachment.created_at,attachment.updated_at,series.revision_no::text series_revision FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id JOIN document.attachment_link link ON link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id LEFT JOIN document.attachment_folder folder ON folder.tenant_id=link.tenant_id AND folder.id=link.folder_id WHERE attachment.tenant_id=${context.tenantId}::uuid AND attachment.uploaded_by=${context.principalId}::uuid AND link.entity_type=${core.entityCode} AND link.entity_id=${recordId} AND attachment.status IN ('pending','uploading','uploaded','processing','failed','quarantined','rejected') ${cursor ? sql`AND (attachment.created_at,attachment.id)<(SELECT created_at,id FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND id=${cursor}::uuid)` : sql``} ORDER BY attachment.created_at DESC,attachment.id DESC LIMIT ${limit + 1}`.execute(
              tx,
            )
          ).rows,
      );
      // Pending transfer rows are private to the uploader, even when their
      // eventual series is already associated with this shared record.
      const allRows = [...rows, ...pendingRows].sort(
        (left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)) ||
          right.id.localeCompare(left.id),
      );
      const [folders, workspace] = await transactions.run(
        context.planeKey,
        context,
        async (tx) =>
          Promise.all([
            sql<{
              id: string;
              name: string;
              parent_id: string | null;
            }>`SELECT id::text,name,parent_id::text FROM document.attachment_folder WHERE tenant_id=${context.tenantId}::uuid AND entity_type=${core.entityCode} AND entity_id=${recordId} ORDER BY name,id`.execute(
              tx,
            ),
            sql<{
              revision_no: string;
            }>`SELECT revision_no::text FROM document.attachment_workspace WHERE tenant_id=${context.tenantId}::uuid AND entity_type=${core.entityCode} AND entity_id=${recordId}`.execute(
              tx,
            ),
          ]),
      );
      const folderItems = folders.rows.map((folder) =>
        Object.freeze({
          id: folder.id,
          name: folder.name,
          ...(folder.parent_id ? { parentId: folder.parent_id } : {}),
        }),
      );
      const workspaceRevision = workspace.rows[0]?.revision_no ?? "1";
      const histories = new Map(
        (
          await transactions.run(context.planeKey, context, async (tx) =>
            Promise.all(
              [...new Set(allRows.map((row) => row.series_id))].map(
                async (seriesId) =>
                  [
                    seriesId,
                    (
                      await sql<{
                        id: string;
                        version_no: number;
                        file_name: string;
                        status: string;
                        created_at: Date | string;
                      }>`SELECT id::text,version_no,file_name,status,created_at FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND series_id=${seriesId}::uuid ORDER BY version_no DESC,id DESC`.execute(
                        tx,
                      )
                    ).rows,
                  ] as const,
              ),
            ),
          )
        ).map(([seriesId, history]) => [seriesId, history] as const),
      );
      const items = allRows.slice(0, limit).map((row) =>
        Object.freeze({
          id: row.id,
          seriesId: row.series_id,
          linkId: row.link_id,
          ...(row.pinned_attachment_id
            ? { pinnedAttachmentId: row.pinned_attachment_id }
            : {}),
          linkKind: row.link_kind,
          ...(row.folder_id ? { folderId: row.folder_id } : {}),
          ...(row.folder_name ? { folderName: row.folder_name } : {}),
          ...(row.category ? { category: row.category } : {}),
          version: row.version_no,
          fileName: row.file_name,
          ...(row.display_name ? { displayName: row.display_name } : {}),
          ...(row.content_type ? { contentType: row.content_type } : {}),
          ...(row.size_bytes === null
            ? {}
            : { sizeBytes: Number(row.size_bytes) }),
          processingStatus: row.status,
          revision: row.series_revision,
          createdAt: new Date(row.created_at).toISOString(),
          versionHistory: (histories.get(row.series_id) ?? []).map((version) =>
            Object.freeze({
              id: version.id,
              version: version.version_no,
              fileName: version.file_name,
              status: version.status,
              createdAt: new Date(version.created_at).toISOString(),
            }),
          ),
        }),
      );
      return Object.freeze({
        revision: workspaceRevision,
        data: Object.freeze({
          items,
          folders: folderItems,
          workspaceRevision,
          ...(allRows.length > limit && items.at(-1)?.id
            ? { nextCursor: items.at(-1)!.id }
            : {}),
        }),
      });
    },
  };
}
