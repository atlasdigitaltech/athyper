import { createCommentSectionProvider } from "./comments.js";
import { createAttachmentSectionProvider } from "./attachments.js";
import { createCollaborationEntityCoordinates } from "@athyper/server-platform-collaboration";
import { businessPartnerCollaborationBinding } from "@athyper/server-service-master-data";
import type {
  CollaborationTransactions,
  CollaborationServiceLookup,
} from "./contracts.js";

/** Host-owned compatibility composition. Providers retain shared admission and scope. */
export function createCollaborationSectionProviders(
  transactions: CollaborationTransactions,
): { getService: CollaborationServiceLookup } {
  const comments = createCommentSectionProvider(transactions, createCollaborationEntityCoordinates([businessPartnerCollaborationBinding]));
  const attachments = createAttachmentSectionProvider(transactions);
  return {
    getService(serviceKey) {
      if (serviceKey === "platform.comments.v1") return comments;
      if (serviceKey === "platform.attachments.v1") return attachments;
      return undefined;
    },
  };
}
