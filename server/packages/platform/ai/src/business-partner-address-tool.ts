import type { AtlasBusinessPartnerInsightOwner } from "@athyper/server-contract-ai";
import { createAtlasEntitySectionTool } from "./entity-section-tool.js";

/** Compatibility registration; all platform mechanics are shared. */
export function createBusinessPartnerAddressTool(read: NonNullable<AtlasBusinessPartnerInsightOwner["readAddresses"]>) {
  return createAtlasEntitySectionTool({planeKey: "neon", entityCode: "business_partner", sectionKey: "addresses", toolCode: "bp_read_addresses", label: "Business Partner addresses", aliases: ["address", "addresses", "postal", "postcode"], readPermission: "neon.relationship.business_partner.read", admissionField: "code", resultKey: "addresses", maxRows: 5, fields: {"address": {"type": "string", "maxLength": 1290}, "purpose": {"type": "string", "maxLength": 256}, "locality": {"type": "string", "maxLength": 256}, "region": {"type": "string", "maxLength": 256}, "postalCode": {"type": "string", "maxLength": 256}, "countryCode": {"type": "string", "maxLength": 256}, "validationStatus": {"type": "string", "maxLength": 256}, "effectiveFrom": {"type": "string", "maxLength": 256}, "effectiveUntil": {"type": "string", "maxLength": 256}, "primary": {"type": "boolean"}}}, async input => {
    const result = await read(input);
    return {entityCode: "business_partner", sectionKey: "addresses", recordId: result.recordId, status: result.status, rows: result.addresses, hasMore: result.hasMore, ...(result.unavailableReason ? {unavailableReason: result.unavailableReason} : {})};
  });
}
