import { AttachmentConflictError } from "./attachment-lifecycle.js";
import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  AttachmentRecord,
  AttachmentRepository,
} from "./attachment-lifecycle.js";

export type AttachmentTransaction = Transaction<Record<string, never>>;
interface Row {
  id: string;
  status: AttachmentRecord["status"];
  file_name: string;
  content_type: string | null;
  text_extraction_status: string | null;
  storage_key: string;
  size_bytes: string | number | null;
  sha256: string | null;
  metadata: Record<string, unknown> | string;
  is_current: boolean;
  is_active: boolean;
  expires_at: Date | string | null;
  retention_until: Date | string | null;
  series_id: string;
  has_legal_hold: boolean;
}

export function createKyselyAttachmentRepository(
  storageBucket: string,
): AttachmentRepository<AttachmentTransaction> {
  if (!storageBucket.trim())
    throw new TypeError("Attachment storage bucket is required");
  return {
    async archiveOutcome(identity,tx) {
      const result=await sql<{ links:string; legal_hold:boolean }>`SELECT (SELECT count(*)::text FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id) links,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) legal_hold FROM document.attachment attachment WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid`.execute(tx); const row=result.rows[0]; if(!row) throw new Error("Attachment was not found"); return {activeLinks:Number(row.links),legalHold:row.legal_hold};
    },
    async archive(identity,tx) {
      const result=await sql<{ links:string; legal_hold:boolean }>`WITH target AS (SELECT attachment.series_id,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) legal_hold FROM document.attachment attachment WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid FOR UPDATE), changed AS (UPDATE document.attachment attachment SET status='deleted',is_active=false,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid FROM target WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid AND NOT target.legal_hold RETURNING target.series_id) SELECT (SELECT count(*)::text FROM document.attachment_link link,target WHERE link.tenant_id=${identity.tenantId}::uuid AND link.attachment_series_id=target.series_id) links,COALESCE((SELECT legal_hold FROM target),false) legal_hold`.execute(tx); const row=result.rows[0]; if(!row) throw new Error("Attachment was not found"); return {activeLinks:Number(row.links),legalHold:row.legal_hold};
    },
    async setCategory(identity,input,tx) {
      const updated=await sql`UPDATE document.attachment_link link SET metadata=link.metadata||${JSON.stringify({category:input.category})}::jsonb WHERE link.tenant_id=${identity.tenantId}::uuid AND link.entity_type=${input.entityType} AND link.entity_id=${input.entityId} AND link.attachment_series_id=(SELECT series_id FROM document.attachment WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid)`.execute(tx);
      if(Number(updated.numAffectedRows??0n)!==1) throw new Error("Attachment link was not found");
    },
    async manageFolder(identity, input, tx) {
      const targetFolder = input.command === "move" ? input.folderId : input.command === "create" ? input.parentFolderId : undefined;
      if (targetFolder) {
        const target = await sql<{id:string}>`SELECT id::text FROM document.attachment_folder WHERE tenant_id=${identity.tenantId}::uuid AND id=${targetFolder}::uuid AND entity_type=${input.entityType} AND entity_id=${input.entityId} FOR SHARE`.execute(tx);
        if (!target.rows.length) throw new AttachmentConflictError("Folder is unavailable for this record. Refresh the folder list.");
      }
      // The workspace row is the concurrency boundary for folder structure and
      // link placement.  Creating it at revision 1 lets an empty collection
      // participate in the same compare-and-swap contract as populated ones.
      await sql`INSERT INTO document.attachment_workspace(tenant_id,entity_type,entity_id,created_by) VALUES(${identity.tenantId}::uuid,${input.entityType},${input.entityId},${identity.principalId}::uuid) ON CONFLICT(tenant_id,entity_type,entity_id) DO NOTHING`.execute(tx);
      const workspace=await sql<{ revision_no: string }>`UPDATE document.attachment_workspace SET revision_no=revision_no+1,updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND entity_type=${input.entityType} AND entity_id=${input.entityId} AND revision_no=${input.expectedRevision} RETURNING revision_no::text`.execute(tx);
      const revision=workspace.rows[0] ? Number(workspace.rows[0].revision_no) : undefined;
      if (revision === undefined) return { revision };
      if (input.command === "create") {
        await sql`INSERT INTO document.attachment_folder(id,tenant_id,entity_type,entity_id,name,parent_id,created_by) VALUES(${input.folderId}::uuid,${identity.tenantId}::uuid,${input.entityType},${input.entityId},${input.name!.trim()},${input.parentFolderId ?? null}::uuid,${identity.principalId}::uuid)`.execute(tx);
        return { revision };
      }
      if (input.command === "move") {
        const updated = await sql`UPDATE document.attachment_link link SET folder_id=${input.folderId}::uuid WHERE link.tenant_id=${identity.tenantId}::uuid AND link.entity_type=${input.entityType} AND link.entity_id=${input.entityId} AND link.attachment_series_id=(SELECT series_id FROM document.attachment WHERE tenant_id=${identity.tenantId}::uuid AND id=${input.attachmentId!}::uuid)`.execute(tx);
        if (Number(updated.numAffectedRows ?? 0n) !== 1) throw new Error("Attachment link was not found");
        return { revision };
      }
      // Archive retains links and history. Release only the folder placement of
      // deleted resolved versions, leaving every live/pending link as a blocker.
      await sql`SELECT id FROM document.attachment_folder WHERE tenant_id=${identity.tenantId}::uuid AND id=${input.folderId}::uuid AND entity_type=${input.entityType} AND entity_id=${input.entityId} FOR UPDATE`.execute(tx);
      await sql`UPDATE document.attachment_link link SET folder_id=NULL
        FROM document.attachment_series series, document.attachment attachment
        WHERE link.tenant_id=${identity.tenantId}::uuid AND link.entity_type=${input.entityType} AND link.entity_id=${input.entityId}
        AND link.folder_id=${input.folderId}::uuid
        AND series.tenant_id=link.tenant_id AND series.id=link.attachment_series_id
        AND attachment.tenant_id=series.tenant_id AND attachment.id=coalesce(link.pinned_attachment_id,series.current_attachment_id)
        AND attachment.status='deleted' AND NOT attachment.is_active`.execute(tx);
      const deleted = await sql`DELETE FROM document.attachment_folder folder WHERE folder.tenant_id=${identity.tenantId}::uuid AND folder.id=${input.folderId}::uuid AND folder.entity_type=${input.entityType} AND folder.entity_id=${input.entityId} AND NOT EXISTS(SELECT 1 FROM document.attachment_folder child WHERE child.tenant_id=folder.tenant_id AND child.parent_id=folder.id) AND NOT EXISTS(SELECT 1 FROM document.attachment_link link WHERE link.tenant_id=folder.tenant_id AND link.folder_id=folder.id)`.execute(tx);
      if (Number(deleted.numAffectedRows ?? 0n) !== 1) throw new AttachmentConflictError("This folder still contains files or subfolders, or is no longer available. Refresh the folder list.");
      return { revision };
    },
    async lockForStaging(identity, tx) {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.tenantId}:${identity.attachmentId}`},0))`.execute(
        tx,
      );
    },
    async createStaged(input, tx) {
      let parent:
        {
          id: string;
          version_no: number;
          series_id: string;
          current_attachment_id: string | null;
        }
        | undefined;
      let seriesId = input.seriesId ?? randomUUID();
      if (input.parentAttachmentId) {
        const loaded = await sql<{
          id: string;
          version_no: number;
          series_id: string;
          current_attachment_id: string | null;
        }>`SELECT attachment.id,attachment.version_no,attachment.series_id,series.current_attachment_id::text FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id WHERE attachment.tenant_id=${input.tenantId}::uuid AND attachment.id=${input.parentAttachmentId}::uuid AND attachment.metadata->>'entity_type' IS NOT DISTINCT FROM ${input.entityType ?? null} AND attachment.metadata->>'entity_id' IS NOT DISTINCT FROM ${input.entityId ?? null} AND attachment.status='active' AND attachment.is_virus_scanned AND attachment.is_active FOR UPDATE OF attachment,series`.execute(
          tx,
        );
        parent = loaded.rows[0];
        if (!parent) throw new Error("Parent attachment not found");
        if (
          input.expectedSeriesVersion !== parent.version_no ||
          parent.current_attachment_id !== parent.id
        )
          throw new Error("Attachment series version has changed");
        if (input.seriesId && parent.series_id !== input.seriesId)
          throw new Error("Attachment series mismatch");
        seriesId = parent.series_id;
      }
      await sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${seriesId}::uuid,${input.tenantId}::uuid,${input.principalId}::uuid) ON CONFLICT(tenant_id,id) DO NOTHING`.execute(
        tx,
      );
      const result =
        await sql<Row>`INSERT INTO document.attachment(admitted_release_hash,admitted_policy_hash,draft_id,id,tenant_id,file_name,original_filename,content_type,size_bytes,kind,storage_bucket,storage_key,version_no,parent_attachment_id,series_id,is_active,is_virus_scanned,expires_at,uploaded_by,metadata,status,created_by) VALUES(${input.admittedReleaseHash ?? null},${input.admittedPolicyHash ?? null},${input.draftId ?? null}::uuid,${input.attachmentId}::uuid,${input.tenantId}::uuid,${input.fileName},${input.fileName},${input.contentType},${input.sizeBytes ?? null},'attachment',${storageBucket},${input.storageKey},${parent ? parent.version_no + 1 : 1},${parent?.id ?? null}::uuid,${seriesId}::uuid,true,false,${input.expiresAt}::timestamptz,${input.principalId}::uuid,${JSON.stringify({ staged_size_bytes: input.sizeBytes ?? null, provenance: input.provenance ?? { source: "user_upload" }, ...(input.entityType ? { entity_type: input.entityType } : {}), ...(input.entityId ? { entity_id: input.entityId } : {}), ...(input.draftId ? { draft_id: input.draftId, draft_principal_id: input.principalId } : {}), expected_series_version: parent ? input.expectedSeriesVersion : 0, expected_current_attachment_id: parent?.id ?? null })}::jsonb,'uploading',${input.principalId}::uuid) RETURNING *,false AS is_current,false AS has_legal_hold`.execute(
          tx,
        );
      const row = required(result.rows[0]);
      if (input.entityType && input.entityId && !input.draftId)
        await sql`INSERT INTO document.attachment_link(tenant_id,entity_type,entity_id,attachment_series_id,link_kind,created_by) VALUES(${input.tenantId}::uuid,${input.entityType},${input.entityId},${seriesId}::uuid,'context',${input.principalId}::uuid) ON CONFLICT(tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,link_kind) DO NOTHING`.execute(
          tx,
        );
      return map(row);
    },
    async load(identity, tx) {
      const result =
        await sql<Row>`SELECT attachment.*,GREATEST(attachment.retention_until,series.retention_until) AS retention_until,series.current_attachment_id=attachment.id AS is_current,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) AS has_legal_hold FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid AND attachment.uploaded_by=${identity.principalId}::uuid LIMIT 1`.execute(
          tx,
        );
      return result.rows[0] ? map(result.rows[0]) : null;
    },
    async loadForDownload(identity, tx) {
      const result =
        await sql<Row>`SELECT attachment.*,GREATEST(attachment.retention_until,series.retention_until) AS retention_until,series.current_attachment_id=attachment.id AS is_current,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) AS has_legal_hold FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid LIMIT 1`.execute(
          tx,
        );
      return result.rows[0] ? map(result.rows[0]) : null;
    },
    async loadForMaintenance(identity, tx) {
      const result =
        await sql<Row>`SELECT attachment.*,GREATEST(attachment.retention_until,series.retention_until) AS retention_until,series.current_attachment_id=attachment.id AS is_current,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) AS has_legal_hold FROM document.attachment attachment JOIN document.attachment_series series ON series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid LIMIT 1 FOR UPDATE OF attachment,series`.execute(
          tx,
        );
      return result.rows[0] ? map(result.rows[0]) : null;
    },
    async finalizeClean(identity, input, tx) {
      const result =
        await sql<Row>`UPDATE document.attachment SET storage_key=${input.storageKey},sha256=${input.sha256},size_bytes=${input.sizeBytes},content_type=${input.contentType},metadata=jsonb_set(metadata,'{pending_cleanup_keys}',COALESCE(metadata->'pending_cleanup_keys','[]'::jsonb)||jsonb_build_array(storage_key),true),status='active',is_active=true,is_virus_scanned=true,expires_at=NULL,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND uploaded_by=${identity.principalId}::uuid AND status IN('pending','uploading','uploaded') RETURNING *,false AS is_current,false AS has_legal_hold`.execute(
          tx,
        );
      const row = required(result.rows[0]);
      const promoted = await sql`UPDATE document.attachment_series SET current_attachment_id=${identity.attachmentId}::uuid,revision_no=revision_no+1,updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${row.series_id}::uuid AND current_attachment_id IS NOT DISTINCT FROM ${input.expectedCurrentAttachmentId ?? null}::uuid`.execute(
        tx,
      );
      if (Number(promoted.numAffectedRows ?? 0n) !== 1)
        throw new Error("Attachment series version has changed");
      return map({ ...row, is_current: true });
    },
    async failInspection(identity, reason, tx) {
      await sql`UPDATE document.attachment SET status='failed',is_active=false,metadata=metadata||${JSON.stringify({ failure_code: "MALWARE_DOCUMENT_UNSUPPORTED", inspection_reason: reason })}::jsonb,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND uploaded_by=${identity.principalId}::uuid AND status IN('pending','uploading','uploaded')`.execute(tx);
    },
    async quarantine(identity, reason, tx) {
      await sql`UPDATE document.attachment SET status='quarantined',is_active=false,metadata=metadata||${JSON.stringify({ quarantine_reason: reason })}::jsonb,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid`.execute(
        tx,
      );
    },
    async deactivate(identity, reason, tx) {
      await sql`UPDATE document.attachment SET status='deleted',is_active=false,metadata=metadata||${JSON.stringify({ deactivation_reason: reason })}::jsonb,status_changed_at=CASE WHEN status IS DISTINCT FROM 'deleted' THEN clock_timestamp() ELSE status_changed_at END,status_changed_by=CASE WHEN status IS DISTINCT FROM 'deleted' THEN ${identity.principalId}::uuid ELSE status_changed_by END,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND uploaded_by=${identity.principalId}::uuid`.execute(
        tx,
      );
    },
    async unlink(identity, target, tx) {
      const removed = await sql<{ series_id: string }>`DELETE FROM document.attachment_link link USING document.attachment attachment WHERE link.tenant_id=${identity.tenantId}::uuid AND attachment.tenant_id=link.tenant_id AND attachment.id=${identity.attachmentId}::uuid AND link.attachment_series_id=attachment.series_id AND link.entity_type=${target.entityType} AND link.entity_id=${target.entityId} AND link.link_kind='context' RETURNING link.attachment_series_id::text series_id`.execute(tx);
      const seriesId = removed.rows[0]?.series_id;
      if (!seriesId) return { unlinked: false, orphaned: false };
      const orphaned = await sql`UPDATE document.attachment attachment SET status='orphaned',is_active=false,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.series_id=${seriesId}::uuid AND attachment.status='active' AND NOT EXISTS(SELECT 1 FROM document.attachment_link remaining WHERE remaining.tenant_id=attachment.tenant_id AND remaining.attachment_series_id=${seriesId}::uuid)`.execute(tx);
      return {
        unlinked: true,
        orphaned: Number(orphaned.numAffectedRows ?? 0n) > 0,
      };
    },
    async rename(identity, input, tx) {
      const result = await sql<Row>`UPDATE document.attachment_series series SET display_name=${input.displayName},revision_no=series.revision_no+1,updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid FROM document.attachment attachment WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid AND series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id AND series.revision_no=${input.expectedSeriesRevision}::integer RETURNING attachment.*,series.current_attachment_id=attachment.id AS is_current,EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) AS has_legal_hold`.execute(tx);
      return result.rows[0] ? map(result.rows[0]) : null;
    },
    async hasActiveLinks(identity, tx) {
      const result = await sql<{ active: boolean }>`SELECT EXISTS(SELECT 1 FROM document.attachment attachment JOIN document.attachment_link link ON link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id WHERE attachment.tenant_id=${identity.tenantId}::uuid AND attachment.id=${identity.attachmentId}::uuid) AS active`.execute(
        tx,
      );
      return Boolean(result.rows[0]?.active);
    },
    async expire(identity, tx) {
      const result = await sql`UPDATE document.attachment SET status='expired',is_active=false,status_changed_at=clock_timestamp(),status_changed_by=${identity.principalId}::uuid,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND status IN('pending','uploading','uploaded') AND expires_at IS NOT NULL AND expires_at<=clock_timestamp()`.execute(
        tx,
      );
      return Number(result.numAffectedRows ?? 0n) === 1;
    },
    async markPurged(identity, tx) {
      await sql`UPDATE document.attachment SET status='deleted',is_active=false,storage_key='purged/'||id::text,status_changed_at=CASE WHEN status IS DISTINCT FROM 'deleted' THEN clock_timestamp() ELSE status_changed_at END,status_changed_by=CASE WHEN status IS DISTINCT FROM 'deleted' THEN ${identity.principalId}::uuid ELSE status_changed_by END,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND status IN('expired','deleted','orphaned')`.execute(
        tx,
      );
      await sql`UPDATE document.attachment_derivative SET status='deleted',storage_key=NULL,storage_bucket=NULL,updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND attachment_id=${identity.attachmentId}::uuid`.execute(tx);
    },
    async markPurgedForMaintenance(identity, tx) {
      await sql`UPDATE document.attachment SET status='deleted',is_active=false,storage_key='purged/'||id::text,status_changed_at=CASE WHEN status IS DISTINCT FROM 'deleted' THEN clock_timestamp() ELSE status_changed_at END,status_changed_by=CASE WHEN status IS DISTINCT FROM 'deleted' THEN ${identity.principalId}::uuid ELSE status_changed_by END,updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid AND status IN('expired','deleted','orphaned')`.execute(
        tx,
      );
      await sql`UPDATE document.attachment_derivative SET status='deleted',storage_key=NULL,storage_bucket=NULL,updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND attachment_id=${identity.attachmentId}::uuid`.execute(tx);
    },
    async purgeObjectKeys(identity,tx) {
      const rows=await sql<{ storage_key:string }>`SELECT storage_key FROM document.attachment WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid UNION ALL SELECT derivative.storage_key FROM document.attachment_derivative derivative WHERE derivative.tenant_id=${identity.tenantId}::uuid AND derivative.attachment_id=${identity.attachmentId}::uuid AND derivative.storage_key IS NOT NULL`.execute(tx);
      const current=await sql<{ metadata:Record<string,unknown>|string }>`SELECT metadata FROM document.attachment WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid`.execute(tx);
      const metadata=current.rows[0]?.metadata;
      const parsed=typeof metadata === "string" ? JSON.parse(metadata) as Record<string,unknown> : metadata;
      const pending=Array.isArray(parsed?.["pending_cleanup_keys"]) ? parsed!["pending_cleanup_keys"].filter((key):key is string=>typeof key === "string") : [];
      return [...new Set([...rows.rows.map(row=>row.storage_key),...pending])];
    },
    async listPendingObjectCleanup(input,tx) {
      const rows=await sql<{ id:string; keys:unknown }>`SELECT id::text,metadata->'pending_cleanup_keys' keys FROM document.attachment WHERE tenant_id=${input.tenantId}::uuid AND jsonb_typeof(metadata->'pending_cleanup_keys')='array' AND jsonb_array_length(metadata->'pending_cleanup_keys')>0 ORDER BY updated_at NULLS FIRST,created_at LIMIT ${input.limit} FOR UPDATE SKIP LOCKED`.execute(tx);
      return rows.rows.map(row=>({attachmentId:row.id,keys:Array.isArray(row.keys) ? row.keys.filter((key):key is string=>typeof key === "string") : []}));
    },
    async removePendingObjectCleanup(identity,keys,tx) {
      await sql`UPDATE document.attachment SET metadata=jsonb_set(metadata,'{pending_cleanup_keys}',COALESCE((SELECT jsonb_agg(key) FROM jsonb_array_elements_text(COALESCE(metadata->'pending_cleanup_keys','[]'::jsonb)) key WHERE key<>ALL(${keys}::text[])),'[]'::jsonb),true),updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid`.execute(tx);
    },
    async addPendingObjectCleanup(identity,keys,tx) {
      await sql`UPDATE document.attachment SET metadata=jsonb_set(metadata,'{pending_cleanup_keys}',COALESCE(metadata->'pending_cleanup_keys','[]'::jsonb)||to_jsonb(${keys}::text[]),true),updated_at=clock_timestamp(),updated_by=${identity.principalId}::uuid WHERE tenant_id=${identity.tenantId}::uuid AND id=${identity.attachmentId}::uuid`.execute(tx);
    },
    async listRetentionCandidates(input, tx) {
      const result = await sql<{
        id: string;
      }>`SELECT attachment.id FROM document.attachment attachment WHERE attachment.tenant_id=${input.tenantId}::uuid AND attachment.status IN('expired','deleted','orphaned') AND attachment.storage_key<>'purged/'||attachment.id::text AND NOT EXISTS(SELECT 1 FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id) AND NOT EXISTS(SELECT 1 FROM document.attachment_series series WHERE series.tenant_id=attachment.tenant_id AND series.id=attachment.series_id AND series.retention_until>clock_timestamp()) AND COALESCE(attachment.retention_until,'-infinity'::timestamptz)<=${input.before}::timestamptz AND NOT EXISTS(SELECT 1 FROM document.attachment_legal_hold hold WHERE hold.tenant_id=attachment.tenant_id AND hold.attachment_series_id=attachment.series_id AND hold.released_at IS NULL) ORDER BY attachment.status_changed_at NULLS LAST,attachment.created_at LIMIT ${input.limit} FOR UPDATE SKIP LOCKED`.execute(
        tx,
      );
      return result.rows.map((row) => row.id);
    },
  };
}
function map(row: Row): AttachmentRecord {
  const metadata =
    typeof row.metadata === "string"
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : row.metadata;
  const provenance = metadata["provenance"];
  const pendingCleanupKeys=Array.isArray(metadata["pending_cleanup_keys"]) ? metadata["pending_cleanup_keys"].filter((key):key is string=>typeof key === "string") : [];
  return {
    ...(typeof metadata["entity_type"] === "string"
      ? { entityType: metadata["entity_type"] }
      : {}),
    ...(typeof metadata["entity_id"] === "string"
      ? { entityId: metadata["entity_id"] }
      : {}),
    id: row.id,
    status: row.status,
    fileName: row.file_name,
    ...(row.content_type ? { contentType: row.content_type } : {}),
    textExtractionStatus: row.text_extraction_status,
    storageKey: row.storage_key,
    ...(row.size_bytes !== null ? { sizeBytes: Number(row.size_bytes) } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    ...(provenance && typeof provenance === "object"
      ? { provenance: provenance as AttachmentRecord["provenance"] }
      : {}),
    ...(pendingCleanupKeys.length ? {pendingCleanupKeys} : {}),
    isCurrent: row.is_current,
    isActive: row.is_active,
    hasLegalHold: Boolean(row.has_legal_hold),
    ...(row.expires_at ? { expiresAt: iso(row.expires_at) } : {}),
    ...(row.retention_until
      ? { retentionUntil: iso(row.retention_until) }
      : {}),
    seriesId: row.series_id,
    ...(typeof metadata["expected_series_version"] === "number" && metadata["expected_series_version"] > 0
      ? { expectedSeriesVersion: metadata["expected_series_version"] }
      : {}),
    ...(typeof metadata["expected_current_attachment_id"] === "string"
      ? { expectedCurrentAttachmentId: metadata["expected_current_attachment_id"] }
      : metadata["expected_current_attachment_id"] === null
        ? { expectedCurrentAttachmentId: null }
        : {}),
  };
}
function required(row: Row | undefined): Row {
  if (!row) throw new Error("Attachment persistence conflict");
  return row;
}
function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
