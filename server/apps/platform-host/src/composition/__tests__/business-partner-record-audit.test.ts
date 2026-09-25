import { expect, it, vi } from "vitest";
import { createBusinessPartnerRecordProviders } from "../entities/business-partner-record-providers.js";
import { MasterDataError } from "@athyper/server-service-master-data";
import { canReplyAtDepth } from "@athyper/server-platform-experience";
import { readFileSync } from "node:fs";

const certificateSection = { content: JSON.parse(readFileSync(new URL("../../../../../../metadata/products/mdg/entities/business_partner/presentation.section.certificates.json", import.meta.url), "utf8")) };

const scope = { operatingOrganizationId: "org", companyCodeId: "company", legalEntityId: "legal", roleLens: "supplier", asOf: "2026-09-25" } as const;
it("preserves unavailable-record and summary-scope errors at the runtime boundary", async () => {
  const providers = createBusinessPartnerRecordProviders({
    header: vi.fn().mockRejectedValue(new MasterDataError(404, "BP_360_NOT_FOUND", "Unavailable")),
    summary: vi.fn().mockRejectedValue(new MasterDataError(400, "BP_360_SCOPE_INVALID", "Invalid scope")),
  } as never, {} as never);
  await expect(providers.headers!.readHeader({ context: {}, core: { entityCode: "business_partner" }, recordId: "absent", fieldKeys: [] } as never)).rejects.toMatchObject({ status: 404, code: "ENTITY_RUNTIME_RECORD_UNAVAILABLE" });
  await expect(providers.summaries!.get("primary-contact")!.read({ context: {}, core: { entityCode: "business_partner" }, recordId: "bp", resourceContext: scope, requestCache: new Map() } as never)).rejects.toMatchObject({ status: 409, code: "ENTITY_RUNTIME_CONTEXT_REQUIRED" });
});
it.each(["industries", "certificates", "contacts", "identifiers-tax", "network"])("forwards scope and paging and exposes continuation for %s", async key => {
  const section = vi.fn(async () => ({ businessPartnerVersion: 2, state: "ready", data: { items: [], certifications: [] }, page: { nextCursor: "opaque-next" } }));
  const providers = createBusinessPartnerRecordProviders({ section } as never, {} as never);
  const handler = providers.sections!.get(`neon.bp.section.${key}.v1`)!;
  const result = await handler.read({ context: {}, recordId: "bp", limit: 2, cursor: "opaque-first", resourceContext: scope, section: certificateSection } as never);
  expect(section).toHaveBeenCalledWith(expect.objectContaining({ ...scope, limit: 2, cursor: "opaque-first" }));
  expect(result.data).toMatchObject({ nextCursor: "opaque-next" });
  section.mockRejectedValueOnce(new MasterDataError(403, "DENIED", "denied"));
  await expect(handler.read({ context: {}, recordId: "bp", limit: 2, resourceContext: scope, section: certificateSection } as never)).rejects.toMatchObject({ status: 403 });
  section.mockRejectedValueOnce(new MasterDataError(400, "BP_360_SCOPE_INVALID", "invalid scope"));
  await expect(handler.read({ context: {}, recordId: "bp", limit: 2, resourceContext: scope, section: certificateSection } as never)).rejects.toMatchObject({ status: 409, code: "ENTITY_RUNTIME_CONTEXT_REQUIRED" });
});
it("uses the entity reply depth including boundary and tombstones", () => {
  expect(canReplyAtDepth("active", 1, 2)).toBe(true);
  expect(canReplyAtDepth("active", 2, 2)).toBe(false);
  expect(canReplyAtDepth("active", 3, 2)).toBe(false);
  expect(canReplyAtDepth("deleted", 0, 2)).toBe(false);
  expect(canReplyAtDepth("active", 0, 0)).toBe(false);
});
it("exposes the network domain cursor at the shared collection boundary", async () => {
  const section=vi.fn().mockResolvedValue({businessPartnerVersion:1,state:"ready",data:{collections:{commercial_relationships:[{id:"relationship"}]},nextCursor:"network-next"}});
  const providers=createBusinessPartnerRecordProviders({section} as never,{} as never);
  const result=await providers.sections!.get("neon.bp.section.network.v1")!.read({context:{},recordId:"bp",limit:25} as never);
  expect(result.data).toMatchObject({nextCursor:"network-next",data:{collections:{commercial_relationships:[{id:"relationship"}]}}});
});
