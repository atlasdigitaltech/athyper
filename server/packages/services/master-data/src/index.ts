/**
 * Master Data owns domain registrations; shared runtime behavior stays in the
 * Entity Framework. No entity-specific route/provider stack is introduced here.
 */
export { businessPartnerCollaborationBinding } from "./business-partner/collaboration-coordinates.js";

export { createPartnerCapabilityActionHandlers } from "./business-partner/capability-actions.js";
