import { createCommentSectionProvider } from "./comments.js";
import { createAttachmentSectionProvider } from "./attachments.js";
import type {
  CollaborationTransactions,
  CollaborationServiceLookup,
} from "./contracts.js";

/** Entity-neutral read providers, independent of the BP domain registry. */
export function createCollaborationSectionProviders(
  transactions: CollaborationTransactions,
): { getService: CollaborationServiceLookup } {
  const comments = createCommentSectionProvider(transactions);
  const attachments = createAttachmentSectionProvider(transactions);
  return {
    getService(serviceKey) {
      if (serviceKey === "platform.comments.v1") return comments;
      if (serviceKey === "platform.attachments.v1") return attachments;
      return undefined;
    },
  };
}
