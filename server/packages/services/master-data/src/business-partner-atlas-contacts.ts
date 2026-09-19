import type { AtlasBusinessPartnerInsightOwner, AtlasBusinessPartnerContacts } from "@athyper/server-contract-ai";
import type { BusinessPartner360Service, BusinessPartner360ContactItem, BusinessPartner360Page } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

/** The BP360 owner enforces directory admission and section/field policy before
 * returning saved contact data. Never pass UI transaction scope to shared contacts. */
export function createBusinessPartnerContactReader(service: Pick<BusinessPartner360Service, "section">): NonNullable<AtlasBusinessPartnerInsightOwner["readContacts"]> {
  return async ({context, recordId}) => {
    const unavailable = (reason?: "missing_scope" | "denied" | "reader_unavailable"): AtlasBusinessPartnerContacts => ({recordId, status: "unavailable", contacts: [], hasMore: false, ...(reason ? {unavailableReason: reason} : {})});
    if (context.planeKey !== "neon") throw new MasterDataError(403, "BP_ATLAS_DENIED", "Contact information is unavailable.");
    try {
      const section = await service.section<BusinessPartner360Page<BusinessPartner360ContactItem>>({context, businessPartnerId: recordId, sectionCode: "contacts", roleLens: "all", limit: 5});
      if (section.sectionCode !== "contacts" || !Array.isArray(section.data?.items)) throw new Error("Invalid contact owner response");
      // A redaction notice must not become an absence/count oracle. The owner
      // currently defines contacts as a section grant; conservatively withhold
      // the projection if a future field policy introduces redactions.
      if (section.redactions.length) return unavailable("denied");
      if (!["ready", "empty"].includes(section.state)) return unavailable("reader_unavailable");
      const contacts = section.data.items.slice(0, 5).map(item => {
        const row: Record<string, string | boolean> = {};
        const text = (value: unknown): string => { if (typeof value !== "string" || value.length > 256) throw new Error("Invalid contact field"); return value; };
        for (const key of ["displayName", "businessTitle", "departmentName"] as const) if (item[key] !== undefined) row[key] = text(item[key]);
        if (typeof item.primary !== "boolean" || !Array.isArray(item.roles) || !Array.isArray(item.channels)) throw new Error("Invalid contact fields");
        row.primary = item.primary;
        row.roles = item.roles.slice(0, 5).map((role: {code: unknown}) => text(role.code)).join(", ");
        // Preserve only authorized business channel values; no internal IDs,
        // quality diagnostics, provider metadata or hidden-channel counts.
        row.channels = item.channels.slice(0, 5).map((channel: {type: string; value: unknown; purpose: unknown}) => {
          if (!["email", "phone", "fax", "sms", "whatsapp", "website"].includes(channel.type)) throw new Error("Invalid channel type");
          return `${channel.type}: ${text(channel.value)} (${text(channel.purpose)})`;
        }).join("; ");
        row.detailsPartial = item.roles.length > 5 || item.channels.length > 5;
        return row;
      });
      return {recordId, status: contacts.length ? "ready" : "empty", contacts, hasMore: !!section.page?.nextCursor || !!section.data.nextCursor || section.data.items.length > 5};
    } catch (error) {
      if (error instanceof MasterDataError && [403, 404, 409, 503].includes(error.status)) return unavailable(error.status === 403 ? "denied" : error.status === 503 ? "reader_unavailable" : undefined);
      throw new MasterDataError(503, "BP_ATLAS_CONTACT_INVALID", "Contact information could not be read.");
    }
  };
}
