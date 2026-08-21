/** Persisted notification intent. It never contains bytes, object keys, or URLs. */
export interface NotificationAttachmentReference {
  readonly attachmentId: string;
  readonly versionPolicy: "current" | "pinned";
  readonly attachmentVersionId?: string;
  readonly requestedDisposition: "link" | "embed" | "auto";
  readonly required: boolean;
  readonly displayName?: string;
}

export interface NotificationTransportAttachment {
  readonly attachmentId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly disposition: "link" | "embed";
  readonly downloadUrl?: string;
  readonly content?: Uint8Array;
}
