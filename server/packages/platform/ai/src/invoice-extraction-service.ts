import type { AtlasDocumentBytes, AtlasDocumentIntelligence, AtlasDocumentValidator, AtlasInvoiceIntakeCommand, AtlasInvoiceReviewStore, AtlasPlaneAdmissionResolver } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";

export interface AtlasInvoiceExtractionServiceOptions { readonly admission: AtlasPlaneAdmissionResolver; readonly validator: AtlasDocumentValidator; readonly intelligence: AtlasDocumentIntelligence; readonly reviews: AtlasInvoiceReviewStore; readonly intake: AtlasInvoiceIntakeCommand; readonly maxDocumentBytes: number }
export class AtlasInvoiceExtractionService {
  constructor(private readonly options: AtlasInvoiceExtractionServiceOptions) { if (!Number.isInteger(options.maxDocumentBytes) || options.maxDocumentBytes < 1) throw new TypeError("Invoice extraction byte limit must be positive."); }
  async extract(input: { readonly context: VerifiedRequestContext; readonly document: AtlasDocumentBytes; readonly signal?: AbortSignal }) {
    assertAtlasContext(input.context); const admission = await this.options.admission.resolve(input.context); if (!admission.invoiceExtractionAllowed) throw new AtlasServiceError("ADMISSION_DENIED", "Invoice extraction is not admitted for this plane.");
    if (input.document.bytes.byteLength < 1 || input.document.bytes.byteLength > this.options.maxDocumentBytes) throw new AtlasServiceError("DOCUMENT_REJECTED", "Invoice document size is outside the accepted bounds.");
    const validation = await this.options.validator.validate({ context: input.context, document: input.document }); if (!validation.safe || !validation.formatAccepted) throw new AtlasServiceError("DOCUMENT_REJECTED", "Invoice document failed malware or format validation.");
    const candidate = await this.options.intelligence.extractInvoice({ context: input.context, document: input.document, signal: input.signal });
    if (candidate.documentId !== input.document.documentId || candidate.documentRevision !== input.document.revision) throw new AtlasServiceError("PROVIDER_PROTOCOL_ERROR", "Invoice extraction returned evidence for a different document revision.");
    validateCandidate(candidate); return this.options.reviews.submit({ context: input.context, candidate });
  }
  async intake(input: { readonly context: VerifiedRequestContext; readonly reviewId: string; readonly idempotencyKey: string }) {
    assertAtlasContext(input.context); const approved = await this.options.reviews.getApproved({ context: input.context, reviewId: input.reviewId }); if (!approved) throw new AtlasServiceError("REVIEW_REQUIRED", "A completed human review is required before invoice intake.");
    return this.options.intake.execute({ context: input.context, reviewId: input.reviewId, candidate: approved.candidate, idempotencyKey: required(input.idempotencyKey) });
  }
}
function validateCandidate(candidate: Awaited<ReturnType<AtlasDocumentIntelligence["extractInvoice"]>>): void { const fields = [candidate.supplierName, candidate.invoiceNumber, candidate.invoiceDate, candidate.currency, candidate.totalAmount, ...candidate.lines.flatMap((line) => [line.description, line.quantity, line.unitPrice, line.amount])]; if (fields.some((field) => !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1 || field.evidence.length < 1)) throw new AtlasServiceError("PROVIDER_PROTOCOL_ERROR", "Invoice candidates require bounded confidence and source evidence for every field."); }
function required(value: string): string { const result = value.trim(); if (!result) throw new AtlasServiceError("INVALID_ARGUMENT", "Idempotency key is required."); return result; }
