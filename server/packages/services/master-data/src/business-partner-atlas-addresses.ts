import type { AtlasBusinessPartnerInsightOwner, AtlasBusinessPartnerAddresses } from "@athyper/server-contract-ai";
import type { BusinessPartner360Service, BusinessPartner360AddressItem, BusinessPartner360Page } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

/** The BP360 owner enforces directory admission and section/field policy before
 * returning saved address data. Never pass UI transaction scope to shared addresses. */
export function createBusinessPartnerAddressReader(service: Pick<BusinessPartner360Service, "section">): NonNullable<AtlasBusinessPartnerInsightOwner["readAddresses"]> {
  return async ({context, recordId}) => {
    const unavailable = (reason?: "missing_scope" | "denied" | "reader_unavailable"): AtlasBusinessPartnerAddresses => ({recordId, status: "unavailable", addresses: [], hasMore: false, ...(reason ? {unavailableReason: reason} : {})});
    if (context.planeKey !== "neon") throw new MasterDataError(403, "BP_ATLAS_DENIED", "Address information is unavailable.");
    try {
      const section = await service.section<BusinessPartner360Page<BusinessPartner360AddressItem>>({context, businessPartnerId: recordId, sectionCode: "addresses", roleLens: "all", limit: 5});
      if (section.sectionCode !== "addresses" || !Array.isArray(section.data?.items)) throw new Error("Invalid address owner response");
      // A redaction notice must not become an absence/count oracle. The owner
      // currently defines addresses as a section grant; conservatively withhold
      // the projection if a future field policy introduces redactions.
      if (section.redactions.length) return unavailable("denied");
      if (!["ready", "empty"].includes(section.state)) return unavailable("reader_unavailable");
      const addresses = section.data.items.slice(0, 5).map(item => {
        const row: Record<string, string | boolean> = {};
        for (const key of ["purpose", "locality", "region", "postalCode", "countryCode", "validationStatus", "effectiveFrom", "effectiveUntil"] as const) {
          const value = item[key];
          if (value === undefined) continue;
          if (typeof value !== "string" || value.length > 256) throw new Error("Invalid address field");
          row[key] = value;
        }
        if (!Array.isArray(item.lines) || item.lines.length > 5 || item.lines.some((line: unknown) => typeof line !== "string" || line.length > 256) || typeof item.primary !== "boolean") throw new Error("Invalid address fields");
        row.address = item.lines.join(", "); row.primary = item.primary;
        return row;
      });
      return {recordId, status: addresses.length ? "ready" : "empty", addresses, hasMore: !!section.page?.nextCursor || !!section.data.nextCursor || section.data.items.length > 5};
    } catch (error) {
      if (error instanceof MasterDataError && [403, 404, 409, 503].includes(error.status)) return unavailable(error.status === 403 ? "denied" : error.status === 503 ? "reader_unavailable" : undefined);
      throw new MasterDataError(503, "BP_ATLAS_ADDRESS_INVALID", "Address information could not be read.");
    }
  };
}
