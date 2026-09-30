import { parseInstant } from "@athyper/platform-temporal";
import { createHash } from "node:crypto";
import type {
  DocumentArtifactRepository,
  NotificationAttachmentAccessPolicy,
  NotificationAttachmentResolver,
  ResolvedDocumentDeliveryAttachment,
} from "@athyper/server-contract-documents";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export class NotificationAttachmentResolutionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "NotificationAttachmentResolutionError";
    this.retryable = retryable;
  }
}

export function createNotificationAttachmentResolver<Transaction>(options: {
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly artifacts: DocumentArtifactRepository<Transaction>;
  readonly storage: ObjectStorage;
  readonly access: NotificationAttachmentAccessPolicy;
  readonly maxEmbeddedBytes?: number;
  readonly linkTtlSeconds?: number;
}): NotificationAttachmentResolver {
  const maxEmbeddedBytes = options.maxEmbeddedBytes ?? 5 * 1024 * 1024;
  const linkTtlSeconds = options.linkTtlSeconds ?? 900;
  return {
    async resolveForDelivery(input) {
      validate(input);
      if (!options.artifacts.findNotificationCandidate) {
        throw permanent("NOTIFICATION_ATTACHMENT_REPOSITORY_NOT_CONFIGURED");
      }
      const candidate = await options.transactions.run(
        input.planeKey,
        { tenantId: input.tenantId, principalId: input.actorPrincipalId },
        (transaction) => options.artifacts.findNotificationCandidate!(input, transaction),
      );
      if (!candidate) throw permanent("NOTIFICATION_ATTACHMENT_NOT_FOUND");
      if (!eligible(candidate)) throw permanent("NOTIFICATION_ATTACHMENT_NOT_DELIVERABLE");
      if (candidate.links.length === 0) throw permanent("NOTIFICATION_ATTACHMENT_UNLINKED");
      if (!await options.access.authorize({ request: input, attachment: candidate })) {
        throw permanent("NOTIFICATION_ATTACHMENT_FORBIDDEN");
      }
      if (input.accessMode === "link") {
        const url = await options.storage.createDownloadUrl(candidate.storageKey, linkTtlSeconds)
          .catch((error: unknown) => { throw transient("NOTIFICATION_ATTACHMENT_LINK_UNAVAILABLE", error); });
        return {
          attachmentId: input.attachmentId,
          attachmentVersionId: candidate.attachmentVersionId,
          filename: candidate.filename,
          contentType: candidate.contentType,
          sizeBytes: candidate.sizeBytes,
          sha256: candidate.sha256,
          disposition: "link",
          downloadUrl: url,
          expiresAt: new Date(Date.now() + linkTtlSeconds * 1_000).toISOString(),
        };
      }
      if (candidate.sizeBytes > maxEmbeddedBytes) throw permanent("NOTIFICATION_ATTACHMENT_EMBED_TOO_LARGE");
      const content = await options.storage.get(candidate.storageKey)
        .catch((error: unknown) => { throw transient("NOTIFICATION_ATTACHMENT_CONTENT_UNAVAILABLE", error); });
      if (content.byteLength !== candidate.sizeBytes
        || createHash("sha256").update(content).digest("hex") !== candidate.sha256) {
        throw permanent("NOTIFICATION_ATTACHMENT_INTEGRITY_FAILED");
      }
      return embedded(candidate, input.attachmentId, content);
    },
  };
}

function eligible(candidate: {
  isActive: boolean; isVirusScanned: boolean; status: string; expiresAt?: string;
}): boolean {
  return candidate.isActive
    && candidate.isVirusScanned
    && candidate.status === "active"
    && (!candidate.expiresAt || parseInstant(candidate.expiresAt) > Date.now());
}

function embedded(
  candidate: Parameters<typeof eligible>[0] & {
    attachmentVersionId: string; filename: string; contentType: string; sizeBytes: number; sha256: string;
  },
  attachmentId: string,
  content: Uint8Array,
): ResolvedDocumentDeliveryAttachment {
  return {
    attachmentId,
    attachmentVersionId: candidate.attachmentVersionId,
    filename: candidate.filename,
    contentType: candidate.contentType,
    sizeBytes: candidate.sizeBytes,
    sha256: candidate.sha256,
    disposition: "embed",
    content,
  };
}

function validate(input: { tenantId: string; actorPrincipalId: string; recipientPrincipalId: string; attachmentId: string; versionPolicy: string; attachmentVersionId?: string; }): void {
  if (![input.tenantId, input.actorPrincipalId, input.recipientPrincipalId, input.attachmentId].every(uuid)
    || !["current", "pinned"].includes(input.versionPolicy)
    || (input.versionPolicy === "pinned" && !uuid(input.attachmentVersionId ?? ""))) {
    throw permanent("INVALID_NOTIFICATION_ATTACHMENT_REQUEST");
  }
}

function uuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function permanent(code: string): NotificationAttachmentResolutionError {
  return new NotificationAttachmentResolutionError(code, false);
}

function transient(code: string, cause: unknown): NotificationAttachmentResolutionError {
  return new NotificationAttachmentResolutionError(
    cause instanceof Error ? `${code}: ${cause.message}` : code,
    true,
  );
}
