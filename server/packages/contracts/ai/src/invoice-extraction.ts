import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface AtlasDocumentBytes { readonly documentId: string; readonly revision: string; readonly mediaType: string; readonly bytes: Uint8Array; readonly checksum: string }
export interface AtlasInvoiceEvidence { readonly documentId: string; readonly documentRevision: string; readonly page: number; readonly region?: readonly [number, number, number, number]; readonly textHash: string }
export interface AtlasInvoiceField<T> { readonly value: T | null; readonly confidence: number; readonly evidence: readonly AtlasInvoiceEvidence[] }
export interface AtlasInvoiceCandidate {
  readonly schema: "atlas-invoice-candidate/1";
  readonly candidateId: string;
  readonly documentId: string;
  readonly documentRevision: string;
  readonly supplierName: AtlasInvoiceField<string>;
  readonly invoiceNumber: AtlasInvoiceField<string>;
  readonly invoiceDate: AtlasInvoiceField<string>;
  readonly currency: AtlasInvoiceField<string>;
  readonly totalAmount: AtlasInvoiceField<number>;
  readonly lines: readonly { readonly description: AtlasInvoiceField<string>; readonly quantity: AtlasInvoiceField<number>; readonly unitPrice: AtlasInvoiceField<number>; readonly amount: AtlasInvoiceField<number> }[];
  readonly modelBindingRevision: string;
  readonly policyRevision: string;
}
export interface AtlasDocumentValidator { validate(input: { readonly context: VerifiedRequestContext; readonly document: AtlasDocumentBytes }): Promise<{ readonly safe: boolean; readonly formatAccepted: boolean; readonly reasonCode?: string }> }
export interface AtlasDocumentIntelligence { extractInvoice(input: { readonly context: VerifiedRequestContext; readonly document: AtlasDocumentBytes; readonly signal?: AbortSignal }): Promise<AtlasInvoiceCandidate> }
export interface AtlasInvoiceReviewStore { submit(input: { readonly context: VerifiedRequestContext; readonly candidate: AtlasInvoiceCandidate }): Promise<{ readonly reviewId: string; readonly status: "pending_human_review" }>; getApproved(input: { readonly context: VerifiedRequestContext; readonly reviewId: string }): Promise<{ readonly candidate: AtlasInvoiceCandidate; readonly reviewedBy: string; readonly reviewedAt: string } | null> }
export interface AtlasInvoiceIntakeCommand { execute(input: { readonly context: VerifiedRequestContext; readonly reviewId: string; readonly candidate: AtlasInvoiceCandidate; readonly idempotencyKey: string }): Promise<{ readonly intakeId: string; readonly revision: string }> }
