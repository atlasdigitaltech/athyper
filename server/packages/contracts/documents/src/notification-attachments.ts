import type { PlaneKey } from "@athyper/server-foundation/context";

/**
 * Documents owns the decision whether an attachment can leave the platform.
 * The input deliberately does not use notification-channel types, avoiding a
 * contracts-documents -> contracts-notifications dependency.
 */
export interface ResolveDocumentDeliveryAttachment {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly actorPrincipalId: string;
  readonly recipientPrincipalId: string;
  readonly attachmentId: string;
  readonly versionPolicy: "current" | "pinned";
  readonly attachmentVersionId?: string;
  readonly accessMode: "link" | "content";
  readonly purpose: "notification_delivery";
  readonly deliveryId: string;
  readonly expiresInSeconds?: number;
}

export interface ResolvedDocumentDeliveryAttachment {
  readonly attachmentId: string;
  readonly attachmentVersionId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly disposition: "link" | "embed";
  readonly downloadUrl?: string;
  readonly content?: Uint8Array;
  readonly expiresAt?: string;
}

export interface NotificationAttachmentResolver {
  resolveForDelivery(
    input: ResolveDocumentDeliveryAttachment,
  ): Promise<ResolvedDocumentDeliveryAttachment>;
}
