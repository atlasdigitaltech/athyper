import { createHash, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { DocumentExtractionScheduler } from "@athyper/server-contract-content-extraction";
import type { DocumentArtifactRepository, DocumentService, DocumentTemplateRepository, GeneratedDocument, RenderDocumentCommand } from "@athyper/server-contract-documents";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { MalwareScanError, type MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { DocumentError } from "./errors.js";
import { renderStrictHandlebars } from "./strict-template-renderer.js";

export interface DocumentServiceOptions<Transaction> {
  readonly metadata: MetadataReader; readonly authorizer: Authorizer; readonly audit: AuditRecorder<Transaction>; readonly outbox: OutboxWriter<Transaction>;
  readonly templates: DocumentTemplateRepository<Transaction>; readonly artifacts: DocumentArtifactRepository<Transaction>; readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly renderer: Pick<PdfRenderer, "renderPdf">; readonly malwareScanner: MalwareScanner; readonly storage: Pick<ObjectStorage,"put"|"get"|"delete"|"exists"|"createDownloadUrl">; readonly storageBucket: string; readonly downloadTtlSeconds?: number;
  readonly extractionScheduler?: DocumentExtractionScheduler;
  readonly createId?: () => string; readonly now?: () => Date;
}

export function createDocumentService<Transaction>(options: DocumentServiceOptions<Transaction>): DocumentService {
  const now = options.now ?? (() => new Date());
  return {
    async render(command) {
      validateRender(command);
      await requirePermission(options.authorizer, command.context, "documents.render");
      const descriptor = await options.metadata.getEntityDescriptor(command.context, command.entityType);
      if (!descriptor) throw new DocumentError(404, "ENTITY_DESCRIPTOR_NOT_FOUND", `No active descriptor for ${command.entityType}`);
      const operation = descriptor.operations[command.operationCode];
      if (!operation) throw new DocumentError(422, "DOCUMENT_OPERATION_NOT_PUBLISHED", `Document operation is not published: ${command.operationCode}`);
      if (operation.permissionCode !== "documents.render") await requirePermission(options.authorizer, command.context, operation.permissionCode);
      if (command.idempotencyKey) {
        const replay = await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          const existing = await options.artifacts.findIdempotent(command.context, command.idempotencyKey!, transaction);
          if (existing) await recordAudit(options.audit, command.context, existing, "documents.render.replayed", "render", transaction);
          return existing;
        });
        if (replay) return replay;
      }
      const variant = command.variant ?? "default"; const locale = command.locale ?? "en";
      const template = await options.transactions.run(command.context.planeKey, actor(command.context), (transaction) => options.templates.resolvePublished({ tenantId: command.context.tenantId, entityType: command.entityType, operationCode: command.operationCode, variant, locale, effectiveOn: now().toISOString().slice(0, 10) }, transaction));
      if (!template) throw new DocumentError(404, "DOCUMENT_TEMPLATE_NOT_FOUND", `No published template binding for ${command.entityType}.${command.operationCode}/${variant}/${locale}`);
      const body = renderStrictHandlebars(template.html, command.data, template.variablesSchema);
      const html = `<!doctype html><html><head><meta charset="utf-8">${template.stylesCss ? `<style>${template.stylesCss}</style>` : ""}</head><body>${body}</body></html>`;
      const renderOptions = { ...template.renderOptions, ...(template.renderOptions.headerHtml ? { headerHtml:renderStrictHandlebars(template.renderOptions.headerHtml,command.data) } : {}), ...(template.renderOptions.footerHtml ? { footerHtml:renderStrictHandlebars(template.renderOptions.footerHtml,command.data) } : {}) };
      const rendered = await options.renderer.renderPdf({ html, documentName: command.fileName ?? `${command.entityType}-${command.entityId}`, options: renderOptions });
      const malwareScan = await scanRenderedDocument(options, rendered.bytes, command);
      const documentId = options.createId?.() ?? randomUUID();
      const fileName = safeFileName(command.fileName ?? `${command.entityType}-${command.entityId}.pdf`);
      const storageKey = `generated/${command.context.planeKey}/${command.context.tenantId}/${command.entityType.replace(/\./g, "/")}/${command.entityId}/${documentId}/${fileName}`;
      const sha256 = createHash("sha256").update(rendered.bytes).digest("hex");
      await options.storage.put(storageKey, rendered.bytes, { contentType: "application/pdf", metadata: { tenant_id: command.context.tenantId, document_id: documentId, sha256, status: "active", malware_scan_status: malwareScan.status, malware_scanner: malwareScan.scanner, malware_scanned_at: malwareScan.scannedAt } });
      try {
        const document = await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          const document = await options.artifacts.save({ id: documentId, tenantId: command.context.tenantId, principalId: command.context.principalId, entityType: command.entityType, entityId: command.entityId, operationCode: command.operationCode, fileName, storageBucket: options.storageBucket, storageKey, sizeBytes: rendered.bytes.byteLength, sha256, template, renderProvider: rendered.provider, renderDurationMs: rendered.durationMs, malwareScan, ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}) }, transaction);
          await options.outbox.append({ tenantId: command.context.tenantId, topic: "documents", eventType: "documents.generated", ...(command.idempotencyKey ? { eventKey: command.idempotencyKey } : {}), entityType: command.entityType, entityId: command.entityId, aggregateType: "document.attachment", aggregateId: document.id, actorId: command.context.principalId, payload: { documentId: document.id, templateVersionId: template.templateVersionId, sha256, notification_attachments: [{ attachmentId: document.id, versionPolicy: "current", requestedDisposition: "auto", required: true }] } }, transaction);
          await recordAudit(options.audit, command.context, document, "documents.artifact.rendered", "render", transaction);
          return document;
        });
        await options.extractionScheduler?.schedule({planeKey:command.context.planeKey,tenantId:command.context.tenantId,attachmentId:document.id,principalId:command.context.principalId}).catch(()=>undefined);
        return document;
      } catch (error) {
        await options.storage.delete(storageKey).catch(() => undefined);
        if (command.idempotencyKey) {
          const winner = await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
            const existing = await options.artifacts.findIdempotent(command.context, command.idempotencyKey!, transaction);
            if (existing) await recordAudit(options.audit, command.context, existing, "documents.render.replayed", "render", transaction);
            return existing;
          }).catch(() => null);
          if (winner) return winner;
        }
        throw error;
      }
    },
    async createDownload(command) {
      if (!uuid(command.documentId)) throw new DocumentError(400, "INVALID_DOCUMENT_ID", "documentId must be a UUID");
      await requirePermission(options.authorizer, command.context, "documents.download");
      const found = await options.transactions.run(command.context.planeKey, actor(command.context), (transaction) => options.artifacts.findAccessible(command.context, command.documentId, transaction));
      if (!found) throw new DocumentError(404, "DOCUMENT_NOT_FOUND", "Generated document was not found");
      const ttl = options.downloadTtlSeconds ?? 300;
      const url = await options.storage.createDownloadUrl(found.storageKey, ttl);
      await options.transactions.run(command.context.planeKey, actor(command.context), (transaction) => recordAudit(options.audit, command.context, found, "documents.download_url.created", "download", transaction));
      const { storageKey: _storageKey, ...document } = found;
      return { document, url, expiresInSeconds: ttl };
    },
  };
}

async function scanRenderedDocument<Transaction>(options: DocumentServiceOptions<Transaction>, bytes: Uint8Array, command: RenderDocumentCommand) {
  try {
    const result = await options.malwareScanner.scan({ content: bytes, sizeBytes: bytes.byteLength, fileName: command.fileName ?? `${command.entityType}-${command.entityId}.pdf`, contentType: "application/pdf" });
    if (result.status === "infected") {
      await recordScanRejection(options, command, "documents.malware.detected", { scanner: result.scanner, threatNames: result.threatNames });
      throw new DocumentError(422, "DOCUMENT_MALWARE_DETECTED", "Rendered document failed malware screening");
    }
    return result;
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    if (error instanceof MalwareScanError) {
      await recordScanRejection(options, command, "documents.malware.scan_failed", { errorCode: error.code });
      const status = error.code === "MALWARE_SCAN_SIZE_LIMIT" ? 413 : 503;
      throw new DocumentError(status, error.code, "Document malware screening could not be completed");
    }
    throw error;
  }
}

async function recordScanRejection<Transaction>(options: DocumentServiceOptions<Transaction>, command: RenderDocumentCommand, eventCode: string, metadata: Readonly<Record<string, unknown>>): Promise<void> {
  await options.transactions.run(command.context.planeKey, actor(command.context), (transaction) => options.audit.record({ eventCode, action:"render", outcome:"failure", actor:{kind:"user",principalId:command.context.principalId}, tenantId:command.context.tenantId, entityType:command.entityType, entityId:command.entityId, requestId:command.context.requestId, ...(command.context.correlationId ? {correlationId:command.context.correlationId} : {}), metadata }, transaction)).catch(() => undefined);
}

function validateRender(command: RenderDocumentCommand): void { if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(command.entityType) || !/^[a-z][a-z0-9_.:-]{1,126}$/.test(command.operationCode)) throw new DocumentError(400, "INVALID_DOCUMENT_COORDINATE", "Invalid entity or operation code"); if (!uuid(command.entityId)) throw new DocumentError(400, "INVALID_ENTITY_ID", "entityId must be a UUID"); if (command.idempotencyKey && (command.idempotencyKey.length > 128 || !/^[\x21-\x7e]+$/.test(command.idempotencyKey))) throw new DocumentError(400,"INVALID_IDEMPOTENCY_KEY","Idempotency key must be 1-128 visible ASCII characters"); }
async function requirePermission(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode })).allowed) throw new DocumentError(403, "FORBIDDEN", `Missing permission: ${permissionCode}`); }
function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
function uuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function safeFileName(value: string): string { const base = value.trim().replace(/\.pdf$/i, "").replace(/[/\\]/g, "-").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "document"; return `${base}.pdf`; }
function recordAudit<Transaction>(audit: AuditRecorder<Transaction>, context: VerifiedRequestContext, document: GeneratedDocument, eventCode: string, actionName: string, transaction: Transaction) { return audit.record({ eventCode, action: actionName, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: document.entityType, entityId: document.entityId, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata: { documentId: document.id, templateVersionId: document.templateVersionId, sha256: document.sha256 } }, transaction); }
