import type { AtlasBusinessPartnerInsightOwner } from "@athyper/server-contract-ai";
import { createAtlasEntitySectionTool } from "./entity-section-tool.js";

/** Compatibility registration; all platform mechanics are shared. */
export function createBusinessPartnerContactTool(read: NonNullable<AtlasBusinessPartnerInsightOwner["readContacts"]>) {
  return createAtlasEntitySectionTool({planeKey: "neon", entityCode: "business_partner", sectionKey: "contacts", toolCode: "bp_read_contacts", label: "Business Partner contacts", aliases: ["contact", "contacts", "email", "phone"], readPermission: "neon.relationship.business_partner.read", admissionField: "code", resultKey: "contacts", searchFields: ["displayName"], maxRows: 5, fields: {"displayName": {"type": "string", "maxLength": 256}, "businessTitle": {"type": "string", "maxLength": 256}, "departmentName": {"type": "string", "maxLength": 256}, "primary": {"type": "boolean"}, "roles": {"type": "string", "maxLength": 3000}, "channels": {"type": "string", "maxLength": 3000}, "detailsPartial": {"type": "boolean"}}}, async input => {
    const result = await read(input);
    return {entityCode: "business_partner", sectionKey: "contacts", recordId: result.recordId, status: result.status, rows: result.contacts, hasMore: result.hasMore, ...(result.unavailableReason ? {unavailableReason: result.unavailableReason} : {})};
  });
}
