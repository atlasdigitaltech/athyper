import type { DocumentArtifactRepository, DocumentTemplateRepository, GeneratedDocument, NotificationAttachmentCandidate, PublishedDocumentTemplate } from "@athyper/server-contract-documents";
import type { PdfPageFormat, PdfRenderOptions } from "@athyper/server-contract-rendering";
import { sql, type Transaction } from "kysely";

export type DocumentTransaction = Transaction<Record<string, never>>;

interface TemplateRow {
  binding_id: string; template_id: string; template_version_id: string; version: number; checksum: string; template_name: string;
  engine: string; locale_code: string; variant_code: string; content_html: string; styles_css: string | null; variables_schema: unknown;
  paper_size: string | null; orientation: string | null; margins: string | null; header_footer: boolean | null; background_graphics: boolean | null;
  header_html: string | null; footer_html: string | null;
}

export function createKyselyDocumentTemplateRepository(): DocumentTemplateRepository<DocumentTransaction> {
  return { async resolvePublished(query, transaction) {
    const result = await sql<TemplateRow>`
      SELECT binding.id AS binding_id, template.id AS template_id, version.id AS template_version_id,
             version.version, version.checksum, template.name AS template_name, template.engine,
             binding.locale_code, binding.variant_code, version.content_html, version.styles_css,
             version.variables_schema, print.paper_size, print.orientation, print.margins,
             print.header_footer, print.background_graphics, letterhead.header_html, letterhead.footer_html
        FROM master.template_binding AS binding
        JOIN master.template AS template
          ON template.tenant_id = binding.tenant_id AND template.id = binding.template_id
        JOIN snapshot.template_version AS version
          ON version.tenant_id = template.tenant_id AND version.template_id = template.id
         AND version.id = template.current_version_id
        LEFT JOIN master.print_profile AS print
          ON print.tenant_id = binding.tenant_id AND print.id = binding.print_profile_id AND print.is_active
        LEFT JOIN master.letterhead AS letterhead
          ON letterhead.tenant_id = binding.tenant_id AND letterhead.id = binding.letterhead_id AND letterhead.is_active
       WHERE binding.tenant_id = ${query.tenantId}::uuid AND binding.entity_code = ${query.entityType}
         AND binding.operation_code = ${query.operationCode} AND binding.is_active
         AND template.status = 'published' AND template.engine = 'handlebars'
         AND binding.variant_code IN (${query.variant}, 'default')
         AND binding.locale_code IN (${query.locale}, 'en') AND version.locale_code = binding.locale_code
         AND (version.effective_from IS NULL OR version.effective_from <= ${query.effectiveOn}::date)
         AND (version.effective_to IS NULL OR version.effective_to >= ${query.effectiveOn}::date)
       ORDER BY (binding.variant_code = ${query.variant}) DESC, (binding.locale_code = ${query.locale}) DESC
       LIMIT 1
    `.execute(transaction);
    return result.rows[0] ? mapTemplate(result.rows[0]) : null;
  } };
}

export function createKyselyDocumentArtifactRepository(): DocumentArtifactRepository<DocumentTransaction> {
  return {
    async save(input, transaction) {
      const created = await sql<{ created_at: Date | string }>`
        INSERT INTO document.attachment
          (id,tenant_id,file_name,original_filename,content_type,size_bytes,sha256,kind,
           storage_bucket,storage_key,version_no,reference_count,is_current,is_active,
           is_virus_scanned,text_extraction_status,metadata,status,uploaded_by,created_by)
        VALUES (${input.id}::uuid,${input.tenantId}::uuid,${input.fileName},${input.fileName},
          'application/pdf',${input.sizeBytes},${input.sha256},'generated_document',
          ${input.storageBucket},${input.storageKey},1,1,true,true,true,'pending',
          ${JSON.stringify({ template_id: input.template.templateId, template_version_id: input.template.templateVersionId, template_version: input.template.version, template_checksum: input.template.checksum, binding_id: input.template.bindingId, render_provider: input.renderProvider, render_duration_ms: input.renderDurationMs, malware_scan: { status: input.malwareScan.status, scanner: input.malwareScan.scanner, scanned_at: input.malwareScan.scannedAt, duration_ms: input.malwareScan.durationMs, ...(input.malwareScan.signatureVersion ? { signature_version: input.malwareScan.signatureVersion } : {}) }, ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}) })}::jsonb,
          'active',${input.principalId}::uuid,${input.principalId}::uuid)
        RETURNING created_at
      `.execute(transaction);
      await sql`INSERT INTO document.attachment_link
          (tenant_id,entity_type,entity_id,attachment_id,link_kind,display_order,metadata,created_by)
        VALUES (${input.tenantId}::uuid,${input.entityType},${input.entityId},${input.id}::uuid,
          'rendered',0,${JSON.stringify({ operation_code: input.operationCode, binding_id: input.template.bindingId })}::jsonb,${input.principalId}::uuid)`.execute(transaction);
      return generated(input, dateTime(created.rows[0]?.created_at));
    },
    async findAccessible(context, documentId, transaction) {
      const result = await sql<Record<string, unknown>>`
        SELECT attachment.id, link.entity_type, link.entity_id, attachment.file_name,
               attachment.content_type, attachment.size_bytes, attachment.sha256,
               attachment.storage_key, attachment.metadata, attachment.created_at
          FROM document.attachment AS attachment
          JOIN document.attachment_link AS link
            ON link.tenant_id = attachment.tenant_id AND link.attachment_id = attachment.id
         WHERE attachment.tenant_id = ${context.tenantId}::uuid AND attachment.id = ${documentId}::uuid
           AND attachment.kind = 'generated_document' AND attachment.status = 'active' AND attachment.is_virus_scanned
         LIMIT 1
      `.execute(transaction);
      const row = result.rows[0]; if (!row) return null;
      const metadata = object(row["metadata"]);
      return { id: String(row["id"]), entityType: String(row["entity_type"]), entityId: String(row["entity_id"]), fileName: String(row["file_name"]), contentType: "application/pdf", sizeBytes: Number(row["size_bytes"]), sha256: String(row["sha256"]), templateId: stringValue(metadata["template_id"]), templateVersionId: stringValue(metadata["template_version_id"]), templateVersion: Number(metadata["template_version"]), createdAt: dateTime(row["created_at"]), storageKey: String(row["storage_key"]) };
    },
    async findIdempotent(context, idempotencyKey, transaction) {
      const result = await sql<Record<string, unknown>>`
        SELECT attachment.id, link.entity_type, link.entity_id, attachment.file_name,
               attachment.content_type, attachment.size_bytes, attachment.sha256,
               attachment.metadata, attachment.created_at
          FROM document.attachment AS attachment
          JOIN document.attachment_link AS link
            ON link.tenant_id=attachment.tenant_id AND link.attachment_id=attachment.id
         WHERE attachment.tenant_id=${context.tenantId}::uuid AND attachment.kind='generated_document' AND attachment.is_virus_scanned
           AND attachment.status='active' AND attachment.metadata->>'idempotency_key'=${idempotencyKey}
         LIMIT 1`.execute(transaction);
      const row=result.rows[0]; if(!row)return null; const metadata=object(row["metadata"]);
      return {id:String(row["id"]),entityType:String(row["entity_type"]),entityId:String(row["entity_id"]),fileName:String(row["file_name"]),contentType:"application/pdf",sizeBytes:Number(row["size_bytes"]),sha256:String(row["sha256"]),templateId:stringValue(metadata["template_id"]),templateVersionId:stringValue(metadata["template_version_id"]),templateVersion:Number(metadata["template_version"]),createdAt:dateTime(row["created_at"])};
    },
    async findNotificationCandidate(input, transaction) {
      const result = await sql<Record<string, unknown>>`
        WITH requested AS (
          SELECT attachment.id,attachment.tenant_id,attachment.series_id
          FROM document.attachment attachment
          WHERE attachment.tenant_id=${input.tenantId}::uuid
            AND attachment.id=${input.attachmentId}::uuid
        ), selected AS (
          SELECT candidate.*
          FROM requested
          LEFT JOIN document.attachment_series series
            ON series.tenant_id=requested.tenant_id AND series.id=requested.series_id
          JOIN document.attachment candidate
            ON candidate.tenant_id=requested.tenant_id
           AND candidate.id=CASE WHEN ${input.versionPolicy}='current'
             THEN coalesce(series.current_attachment_id,requested.id)
             ELSE ${input.attachmentVersionId ?? null}::uuid END
           AND (${input.versionPolicy}='current'
             OR candidate.id=requested.id
             OR (requested.series_id IS NOT NULL AND candidate.series_id=requested.series_id))
        )
        SELECT selected.id,selected.file_name,selected.content_type,selected.size_bytes,
               selected.sha256,selected.storage_key,selected.is_active,
               selected.is_virus_scanned,selected.status,selected.expires_at,
               link.entity_type,link.entity_id
        FROM selected
        LEFT JOIN document.attachment_link link
          ON link.tenant_id=selected.tenant_id AND link.attachment_id=selected.id
        ORDER BY link.display_order,link.created_at
      `.execute(transaction);
      const first = result.rows[0];
      if (!first) return null;
      return {
        attachmentId: input.attachmentId,
        attachmentVersionId: String(first["id"]),
        filename: String(first["file_name"]),
        contentType: String(first["content_type"] ?? "application/octet-stream"),
        sizeBytes: Number(first["size_bytes"] ?? 0),
        sha256: String(first["sha256"] ?? ""),
        storageKey: String(first["storage_key"]),
        isActive: Boolean(first["is_active"]),
        isVirusScanned: Boolean(first["is_virus_scanned"]),
        status: String(first["status"]),
        ...(first["expires_at"] ? { expiresAt: dateTime(first["expires_at"]) } : {}),
        links: result.rows
          .filter((row) => typeof row["entity_type"] === "string" && row["entity_type"] !== "")
          .map((row) => ({ entityType: String(row["entity_type"]), entityId: String(row["entity_id"]) })),
      } satisfies NotificationAttachmentCandidate;
    },
  };
}

function mapTemplate(row: TemplateRow): PublishedDocumentTemplate {
  if (row.engine !== "handlebars" || !row.content_html) throw new Error("Published document template is not renderable HTML");
  const format = (row.paper_size ?? "A4") as PdfPageFormat;
  if (!(["A3","A4","A5","B4","Letter","Legal"] as string[]).includes(format)) throw new Error(`Unsupported print paper size: ${format}`);
  const margins = ({ none:0, narrow:0.25, normal:0.4, wide:0.75 } as Record<string, number>)[row.margins ?? "normal"];
  if (margins === undefined) throw new Error(`Unsupported print margin: ${row.margins}`);
  const renderOptions: PdfRenderOptions = { format, landscape: row.orientation === "landscape", printBackground: row.background_graphics ?? true, marginsInches: { top:margins, right:margins, bottom:margins, left:margins }, ...((row.header_footer ?? true) && row.header_html ? { headerHtml: row.header_html } : {}), ...((row.header_footer ?? true) && row.footer_html ? { footerHtml: row.footer_html } : {}) };
  return { bindingId:row.binding_id, templateId:row.template_id, templateVersionId:row.template_version_id, version:Number(row.version), checksum:row.checksum, name:row.template_name, engine:"handlebars", locale:row.locale_code, variant:row.variant_code, html:row.content_html, ...(row.styles_css ? { stylesCss:row.styles_css } : {}), ...(row.variables_schema ? { variablesSchema:object(row.variables_schema) } : {}), renderOptions };
}
function generated(input: Parameters<DocumentArtifactRepository<DocumentTransaction>["save"]>[0], createdAt: string): GeneratedDocument { return { id:input.id, entityType:input.entityType, entityId:input.entityId, fileName:input.fileName, contentType:"application/pdf", sizeBytes:input.sizeBytes, sha256:input.sha256, templateId:input.template.templateId, templateVersionId:input.template.templateVersionId, templateVersion:input.template.version, createdAt }; }
function object(value: unknown): Readonly<Record<string, unknown>> { const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Readonly<Record<string, unknown>> : {}; }
function stringValue(value: unknown): string { if (typeof value !== "string") throw new Error("Generated document metadata is incomplete"); return value; }
function dateTime(value: unknown): string { if (value instanceof Date) return value.toISOString(); if (typeof value === "string") return new Date(value).toISOString(); return new Date().toISOString(); }
