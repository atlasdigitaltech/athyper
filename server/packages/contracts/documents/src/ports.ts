import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CleanMalwareScanResult } from "@athyper/server-contract-malware-scanning";
import type { GeneratedDocument, PublishedDocumentTemplate } from "./documents.js";
import type { ResolveDocumentDeliveryAttachment } from "./notification-attachments.js";

export interface TemplateResolutionQuery {
  readonly tenantId: string; readonly entityType: string; readonly operationCode: string;
  readonly variant: string; readonly locale: string; readonly effectiveOn: string;
}
export interface DocumentTemplateRepository<Transaction> { resolvePublished(query: TemplateResolutionQuery, transaction: Transaction): Promise<PublishedDocumentTemplate | null>; }
export interface SaveGeneratedDocument {
  readonly id: string; readonly tenantId: string; readonly principalId: string; readonly entityType: string; readonly entityId: string; readonly operationCode: string;
  readonly fileName: string; readonly storageBucket: string; readonly storageKey: string; readonly sizeBytes: number; readonly sha256: string;
  readonly template: PublishedDocumentTemplate; readonly renderProvider: string; readonly renderDurationMs: number; readonly malwareScan: CleanMalwareScanResult; readonly idempotencyKey?: string;
}
export interface DocumentArtifactRepository<Transaction> {
  save(input: SaveGeneratedDocument, transaction: Transaction): Promise<GeneratedDocument>;
  findAccessible(context: VerifiedRequestContext, documentId: string, transaction: Transaction): Promise<(GeneratedDocument & { readonly storageKey: string }) | null>;
  findIdempotent(context: VerifiedRequestContext, idempotencyKey: string, transaction: Transaction): Promise<GeneratedDocument | null>;
  findNotificationCandidate?(
    input: Pick<ResolveDocumentDeliveryAttachment, "tenantId" | "attachmentId" | "versionPolicy" | "attachmentVersionId">,
    transaction: Transaction,
  ): Promise<NotificationAttachmentCandidate | null>;
}

export interface NotificationAttachmentCandidate {
  readonly attachmentId: string;
  readonly attachmentVersionId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly isActive: boolean;
  readonly isVirusScanned: boolean;
  readonly status: string;
  readonly expiresAt?: string;
  readonly links: readonly { readonly entityType: string; readonly entityId: string }[];
}

/** Injected by the host; background jobs must not manufacture permission snapshots. */
export interface NotificationAttachmentAccessPolicy {
  authorize(input: {
    readonly request: ResolveDocumentDeliveryAttachment;
    readonly attachment: NotificationAttachmentCandidate;
  }): Promise<boolean>;
}
