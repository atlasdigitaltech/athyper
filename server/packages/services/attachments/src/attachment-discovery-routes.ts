import { createHash } from "node:crypto";
import type { Application, NextFunction, Response } from "express";
import { sql, type Transaction } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { AttachmentRouteOptions } from "./attachment-routes.js";

type Tx = Transaction<Record<string, never>>;
type Identity = { planeKey: "neon" | "studio" | "mesh"; tenantId: string; principalId: string; attachmentId: string };
type Row = { id: string; sha256: string; content_type: string; derivative_content_type: string | null; storage_key: string | null; status: string; last_error_code?: string | null; scan_status: string | null; size_bytes: number; file_name: string; extracted_text: string | null };
type BrowseRow = { added_at?: Date | string; added_by_display_name?: string; id: string; pinned_attachment_id: string | null; link_kind: string; version_history: unknown; series_id: string; link_id: string; folder_id: string | null; folder_name: string | null; category: string | null; version_no: number; file_name: string; display_name: string | null; content_type: string | null; size_bytes: number | string | null; status: string; created_at: Date | string; series_revision: string };
const renditions = new Set(["thumbnail_sm", "thumbnail_md", "page_preview", "preview_default"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface AttachmentDiscoveryOptions {
  authorizeCapability: NonNullable<AttachmentRouteOptions["authorizeCapability"]>;
  transactions: PlaneTransactionCoordinator<Tx>;
  storage: ObjectStorage;
  schedule?: (input: Identity & { sourceSha256: string; rebuild?: {mode:"failed";reason:string;requestId:string} }) => Promise<void>;
  extract?: (input: Identity) => Promise<void>;
}
class DiscoveryError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
/** Policy admission precedes reads. Every retrieval uses current links, not index visibility. */
export function createAttachmentDiscoveryService(options: AttachmentDiscoveryOptions) {
  return {
    async preview(context: VerifiedRequestContext, input: { attachmentId: string; rendition?: string }) {
      const {attachmentId} = input, rendition = input.rendition ?? "page_preview";
      if (!uuid.test(attachmentId) || !renditions.has(rendition)) throw new DiscoveryError(400,"INVALID_PREVIEW_INPUT");
      const admitted = await options.authorizeCapability(context, "preview", { attachmentId });
      if (!admitted?.entityType || !admitted.entityId) throw new DiscoveryError(403,"ENTITY_CAPABILITY_DENIED");
      const specification = createHash("sha256").update(`v1:${rendition}`).digest("hex");
      const row = await options.transactions.run(context.planeKey, context, async tx => (await sql<Row>`
        SELECT a.id::text,a.sha256,a.content_type,a.file_name,d.content_type derivative_content_type,d.storage_key,d.status,d.last_error_code,d.scan_status,d.size_bytes
        FROM document.attachment a
        JOIN document.attachment_series s ON s.tenant_id=a.tenant_id AND s.id=a.series_id
        LEFT JOIN document.attachment_derivative d ON d.tenant_id=a.tenant_id AND d.attachment_id=a.id
          AND d.source_sha256=a.sha256 AND d.specification_hash=${specification} AND d.rendition_code=${rendition}
        WHERE a.tenant_id=${context.tenantId}::uuid AND a.id=${attachmentId}::uuid AND a.status='active' AND a.is_active AND a.is_virus_scanned
          AND EXISTS (SELECT 1 FROM document.attachment_link l WHERE l.tenant_id=a.tenant_id AND l.attachment_series_id=a.series_id
            AND ((l.entity_type=${admitted.entityType} AND l.entity_id=${admitted.entityId})
              OR (l.entity_type='document.comment' AND l.link_kind='comment' AND l.entity_id=${admitted.commentId ?? ""}
                AND EXISTS (SELECT 1 FROM document.comment c WHERE c.tenant_id=a.tenant_id AND c.id::text=l.entity_id
                  AND c.entity_type=${admitted.entityType} AND c.entity_id=${admitted.entityId} AND c.status<>'deleted')))
            AND (l.pinned_attachment_id=a.id OR (l.pinned_attachment_id IS NULL AND s.current_attachment_id=a.id)))
        ORDER BY d.created_at DESC LIMIT 1`.execute(tx)).rows[0]);
      if (!row) throw new DiscoveryError(404,"PREVIEW_NOT_AVAILABLE");
      if (!["image/png","image/jpeg","image/webp","application/pdf"].includes(row.content_type)) return { state: "unsupported", detail: "Preview is unavailable for this format. Download the original file." };
      const contentType = rendition === "preview_default" ? "application/pdf" : "image/webp";
      if (row.status === "ready" && row.scan_status === "clean" && row.storage_key && row.derivative_content_type === contentType && Number(row.size_bytes) > 0 && Number(row.size_bytes) <= 10 * 1024 * 1024) {
        const url = await options.storage.createDownloadUrl(row.storage_key, 120, {contentType, contentDisposition: contentType === "application/pdf" ? 'inline; filename="preview.pdf"' : 'inline; filename="preview.webp"'});
        return { state: "ready", url, expiresAt: new Date(Date.now()+120_000).toISOString(), contentType };
      }
      // Finalization can run before a draft is posted and gains its comment pin.
      // Retry only that missing-link failure after the authorized link query above succeeds.
      const linkedAfterScan = Boolean(admitted.commentId) && (!row.status || (row.status === "failed" && row.last_error_code === "source_not_found"));
      if (!linkedAfterScan && ["skipped","quarantined","failed"].includes(row.status)) return { state: "unavailable", detail: "Preview could not be generated. Encrypted and unsupported documents require downloading the original." };
      if (!options.schedule) return { state: "unavailable", detail: "Preview provider is unavailable." };
      await options.schedule({ planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId,sourceSha256:row.sha256,...(linkedAfterScan ? {rebuild:{mode:"failed" as const,reason:"Comment attachment is now linked",requestId:`comment-linked-${admitted.commentId}`}} : {}) });
      return { state: "processing", detail: "Preparing preview. The original file remains available." };
    },
    async extract(context: VerifiedRequestContext, attachmentId: string) {
      if (!uuid.test(attachmentId)) throw new DiscoveryError(400,"INVALID_ATTACHMENT_ID");
      if (!await options.authorizeCapability(context,"extract",{attachmentId})) throw new DiscoveryError(403,"ENTITY_CAPABILITY_DENIED");
      if (!options.extract) throw new DiscoveryError(503,"EXTRACTION_UNAVAILABLE");
      await options.extract({planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId});
      return {state:"processing"};
    },
    // Durable extraction allows record search during a temporary external-index outage.
    async search(context: VerifiedRequestContext, input: {entityType:string;entityId:string;q:string;after?:string;folderId?:string;unfiled?:boolean;category?:string}) {
      const { entityType, entityId, q, after, folderId, unfiled, category } = input;
      if ((folderId !== undefined && (typeof folderId !== "string" || !uuid.test(folderId))) || (unfiled !== undefined && typeof unfiled !== "boolean") || (folderId && unfiled) || (category !== undefined && !["general","evidence"].includes(category))) throw new DiscoveryError(400,"INVALID_SEARCH_INPUT");
      if (typeof entityType !== "string" || !/^[a-z][a-z0-9_.]{0,127}$/.test(entityType) || typeof entityId !== "string" || !entityId || entityId.length > 128 || typeof q !== "string" || !q.trim() || q.length > 256 || (after !== undefined && !uuid.test(after))) throw new DiscoveryError(400,"INVALID_SEARCH_INPUT");
      if (!await options.authorizeCapability(context,"search",{entityType,entityId})) throw new DiscoveryError(403,"ENTITY_CAPABILITY_DENIED");
      const rows = await options.transactions.run(context.planeKey, context, async tx => {
        await sql`SET LOCAL statement_timeout = '2000ms'`.execute(tx);
        return (await sql<Row>`SELECT DISTINCT a.id,a.file_name,a.content_type,
          substring(a.extracted_text FROM greatest(1,strpos(lower(a.extracted_text),lower(${q.trim()}))-80) FOR 320) extracted_text
          FROM document.attachment_link l JOIN document.attachment_series s ON s.tenant_id=l.tenant_id AND s.id=l.attachment_series_id
          JOIN document.attachment a ON a.tenant_id=s.tenant_id AND a.id=coalesce(l.pinned_attachment_id,s.current_attachment_id)
          WHERE l.tenant_id=${context.tenantId}::uuid AND l.entity_type=${entityType} AND l.entity_id=${entityId}
          AND a.status='active' AND a.is_active AND a.is_virus_scanned
          AND a.text_extraction_status='extracted'
          AND strpos(lower(a.extracted_text),lower(${q.trim()}))>0
          ${folderId ? sql`AND l.folder_id=${folderId}::uuid` : unfiled ? sql`AND l.folder_id IS NULL` : sql``}
          ${category ? sql`AND coalesce(l.metadata->>'category','general')=${category}` : sql``}
          ${after ? sql`AND a.id>${after}::uuid` : sql``} ORDER BY a.id LIMIT 26`.execute(tx)).rows;
      });
      const hits = [];
      for (const row of rows.slice(0,25)) {
        try {
          const permission: {entityType?:string;entityId?:string} | undefined = await options.authorizeCapability(context,"download",{attachmentId:row.id,entityType,entityId});
          if (!permission || permission.entityType !== entityType || permission.entityId !== entityId) continue;
        } catch { continue; }
        hits.push({attachmentId:row.id,fileName:row.file_name,contentType:row.content_type,snippet:row.extracted_text});
      }
      return {hits,...(rows.length>25 ? {nextCursor:rows[24]!.id} : {})};
    },
    /**
     * Record-scoped discovery for names and filters. The predicates are part of
     * the SQL before LIMIT, so a filter never means only the loaded UI page.
     */
    async browse(context: VerifiedRequestContext, input: {entityType:string;entityId:string;name?:string;exactName?:boolean;folderId?:string;unfiled?:boolean;category?:string;after?:string;attachmentId?:string;includeHistory?:boolean}) {
      const { entityType, entityId, name, exactName, folderId, unfiled, category, after, attachmentId, includeHistory } = input;
      if (includeHistory !== undefined && (typeof includeHistory !== "boolean" || !attachmentId)) throw new DiscoveryError(400,"INVALID_BROWSE_INPUT");
      if (attachmentId !== undefined && (typeof attachmentId !== "string" || !uuid.test(attachmentId))) throw new DiscoveryError(400,"INVALID_BROWSE_INPUT");
      if ((folderId !== undefined && (typeof folderId !== "string" || !uuid.test(folderId))) || (unfiled !== undefined && typeof unfiled !== "boolean") || (exactName !== undefined && typeof exactName !== "boolean") || (exactName && (typeof name !== "string" || !name.trim())) || (folderId && unfiled) || (category !== undefined && !["general","evidence"].includes(category)) || (name !== undefined && (typeof name !== "string" || name.length > 1024)) || (after !== undefined && !uuid.test(after))) throw new DiscoveryError(400,"INVALID_BROWSE_INPUT");
      if (typeof entityType !== "string" || !/^[a-z][a-z0-9_.]{0,127}$/.test(entityType) || typeof entityId !== "string" || !entityId || entityId.length > 128) throw new DiscoveryError(400,"INVALID_BROWSE_INPUT");
      if (!attachmentId && !await options.authorizeCapability(context,"search",{entityType,entityId})) throw new DiscoveryError(403,"ENTITY_CAPABILITY_DENIED");
      if (attachmentId) {
        const admitted = await options.authorizeCapability(context,includeHistory ? "version" : "preview",{entityType,entityId,attachmentId});
        if (!admitted || admitted.entityType !== entityType || admitted.entityId !== entityId) throw new DiscoveryError(403,"ENTITY_CAPABILITY_DENIED");
      }
      // Select one deterministic link/version per series before applying the
      // cursor; otherwise an older pin can reappear on a subsequent page.
      // Materialize the bounded page before principal/history enrichment.
      const rows = await options.transactions.run(context.planeKey, context, async tx => (await sql<BrowseRow>`WITH visible AS (
        SELECT DISTINCT ON (a.series_id) a.id::text,a.series_id::text,l.id::text link_id,l.pinned_attachment_id::text,l.link_kind,l.folder_id::text,folder.name folder_name,coalesce(l.metadata->>'category','general') category,a.version_no,a.file_name,s.display_name,a.content_type,a.size_bytes,a.status,a.created_at,l.created_at added_at,l.created_by added_by,s.revision_no::text series_revision
        FROM document.attachment_link l
        JOIN document.attachment_series s ON s.tenant_id=l.tenant_id AND s.id=l.attachment_series_id
        JOIN document.attachment a ON a.tenant_id=s.tenant_id AND a.id=coalesce(l.pinned_attachment_id,s.current_attachment_id)
        LEFT JOIN document.attachment_folder folder ON folder.tenant_id=l.tenant_id AND folder.id=l.folder_id
        WHERE l.tenant_id=${context.tenantId}::uuid AND l.entity_type=${entityType} AND l.entity_id=${entityId}
          AND a.status='active' AND a.is_active AND a.is_virus_scanned
          AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
          ${attachmentId ? sql`AND a.id=${attachmentId}::uuid` : sql``}
          ${name?.trim() ? exactName ? sql`AND lower(a.file_name)=lower(${name.trim()})` : sql`AND strpos(lower(a.file_name || ' ' || coalesce(s.display_name,'')),lower(${name.trim()}))>0` : sql``}
          ${folderId ? sql`AND l.folder_id=${folderId}::uuid` : unfiled ? sql`AND l.folder_id IS NULL` : sql``}
          ${category ? sql`AND coalesce(l.metadata->>'category','general')=${category}` : sql``}
        ORDER BY a.series_id,(l.pinned_attachment_id IS NOT NULL) DESC,l.created_at DESC,l.id DESC,a.created_at DESC,a.id DESC
      ), page AS MATERIALIZED (
        SELECT * FROM visible
        ${after ? sql`WHERE (created_at,id::uuid)<(SELECT created_at,id FROM document.attachment WHERE tenant_id=${context.tenantId}::uuid AND id=${after}::uuid)` : sql``}
        ORDER BY created_at DESC,id::uuid DESC LIMIT 51
      ) SELECT page.*,
        (SELECT display_name FROM document.collaboration_principal_candidates('',page.added_by)) added_by_display_name,
        CASE WHEN ${includeHistory === true} THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id::text,'version',v.version_no,'fileName',v.file_name,'status',v.status,'createdAt',v.created_at,'uploadedByDisplayName',(SELECT display_name FROM document.collaboration_principal_candidates('',v.uploaded_by))) ORDER BY v.version_no DESC,v.id DESC)
          FROM document.attachment v WHERE v.tenant_id=${context.tenantId}::uuid AND v.series_id=page.series_id::uuid
            AND (v.status='active' OR v.uploaded_by=${context.principalId}::uuid)), '[]'::jsonb) ELSE NULL END version_history
      FROM page ORDER BY created_at DESC,id::uuid DESC`.execute(tx)).rows);
      const items = rows.slice(0,50).map(row => ({ id:row.id,...(row.added_at ? {addedAt:new Date(row.added_at).toISOString()}:{}),...(row.added_by_display_name ? {addedByDisplayName:row.added_by_display_name}:{}),seriesId:row.series_id,linkId:row.link_id,linkKind:row.link_kind,...(row.pinned_attachment_id ? {pinnedAttachmentId:row.pinned_attachment_id}:{}),...(includeHistory ? {versionHistory:row.version_history ?? []}:{}),...(row.folder_id ? {folderId:row.folder_id}:{ }),...(row.folder_name ? {folderName:row.folder_name}:{}),category:row.category ?? "general",version:row.version_no,fileName:row.file_name,...(row.display_name ? {displayName:row.display_name}:{}),...(row.content_type ? {contentType:row.content_type}:{}),...(row.size_bytes === null ? {} : {sizeBytes:Number(row.size_bytes)}),processingStatus:row.status,revision:row.series_revision,createdAt:new Date(row.created_at).toISOString() }));
      return {items,...(rows.length>50 ? {nextCursor:rows[49]!.id} : {})};
    },
  };
}
export function registerAttachmentDiscoveryRoutes(app: Application, options: Pick<AttachmentRouteOptions,"authenticate"|"readContext"> & {service:ReturnType<typeof createAttachmentDiscoveryService>}) {
  app.post("/api/attachments/:attachmentId/preview", options.authenticate, async (req,res,next) => {
    res.setHeader("Cache-Control","private, no-store");
    try { res.json(await options.service.preview(options.readContext(res),{attachmentId:String(req.params.attachmentId),rendition:req.body?.rendition})); } catch(error) { handle(error,res,next); }
  });
  app.post("/api/attachments/:attachmentId/extract", options.authenticate, async (req,res,next) => {
    res.setHeader("Cache-Control","private, no-store");
    try { res.status(202).json(await options.service.extract(options.readContext(res),String(req.params.attachmentId))); } catch(error) { handle(error,res,next); }
  });
  app.post("/api/attachments/search", options.authenticate, async (req,res,next) => {
    res.setHeader("Cache-Control","private, no-store");
    try { res.json(await options.service.search(options.readContext(res),req.body ?? {})); } catch(error) { handle(error,res,next); }
  });
  app.post("/api/attachments/browse", options.authenticate, async (req,res,next) => {
    res.setHeader("Cache-Control","private, no-store");
    try { res.json(await options.service.browse(options.readContext(res),req.body ?? {})); } catch(error) { handle(error,res,next); }
  });
}
function handle(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof DiscoveryError) response.status(error.status).json({code:error.code});
  else if (error instanceof Error && "code" in error && error.code === "ENTITY_CAPABILITY_DENIED") response.status(403).json({code:"ENTITY_CAPABILITY_DENIED",detail:"This file operation is unavailable or not authorized."});
  else next(error);
}
