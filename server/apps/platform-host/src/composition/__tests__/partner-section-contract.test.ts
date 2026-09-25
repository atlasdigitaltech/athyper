import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createBusinessPartnerRecordProviders } from "../entities/business-partner-record-providers.js";
import { partnerSectionContract, validatePartnerSectionPublication } from "../entities/partner-section-contract.js";
import { qualificationContractOverlay } from "../../../scripts/db-verification/provisioning/qualification-contract-overlay.js";
const artifact = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../metadata/products/mdg/entities/business_partner/presentation.${name}.json`, import.meta.url), "utf8"));
const qualification = artifact("section.qualifications-certificates");
const certificate = artifact("section.certificates");
const restriction = artifact("section.restrictions");
const detail = artifact("detail");
const legacy = { ...qualification, dataBinding: { ...qualification.dataBinding, handlerKey: "neon.bp.section.qualifications-certificates.v1" }, fieldBindings: [], childCollections: [
  {key: "qualifications", coreRef: "business_partner_qualification/core.json"},
  {key: "certifications", coreRef: "certification/core.json"},
] };
function fixture() {
  const section = vi.fn(async () => ({ businessPartnerVersion: 1, state: "ready", data: { qualifications: [{id: "q", partnerRole: "supplier", decision: "approved"}], certifications: [{id: "c", name: "Certificate"}] } }));
  const read = vi.fn(async ({kind}) => ({ revision: "1", data: {items: [{id: kind}]} }));
  const providers = createBusinessPartnerRecordProviders({section} as never, {} as never, {read} as never);
  const call = (content: any, handler = content.dataBinding.handlerKey) => providers.sections.get(handler)!.read({context: {tenantId: "tenant"}, recordId: "bp", section: {content}, limit: 25, resourceContext: {companyCodeId: "company"}} as never);
  return {section, read, providers, call};
}
describe("partner section response contracts", () => {
  it("binds three separate destinations in current metadata", () => {
    validatePartnerSectionPublication([qualification, certificate, restriction]);
    expect(detail.navigation.tabs.find((t: any) => t.key === "360").sectionKeys).toContain("certificates");
    expect(detail.navigation.tabs.find((t: any) => t.key === "qualifications").sectionKeys).toEqual(["qualifications-certificates", "restrictions"]);
  });
  it("routes qualifications and restrictions only to their decision readers", async () => {
    const h = fixture();
    expect(await h.call(qualification)).toMatchObject({data: {items: [{id: "qualifications"}]}});
    expect(await h.call(restriction)).toMatchObject({data: {items: [{id: "restrictions"}]}});
    expect(h.section).not.toHaveBeenCalled();
  });
  it("reads certificates via the existing authorized scope without qualification output", async () => {
    const h = fixture();
    const result = await h.call(certificate);
    expect(result.data).toMatchObject({collections: {certifications: [{id: "c", display_name: "Certificate"}]}});
    expect((result.data as any).collections).not.toHaveProperty("qualifications");
    expect(h.section).toHaveBeenCalledWith(expect.objectContaining({sectionCode: "qualifications-certificates", companyCodeId: "company"}));
    expect(h.read).not.toHaveBeenCalled();
  });
  it("preserves both historical collections and their declared role field", async () => {
    const h = fixture();
    expect(await h.call(legacy)).toMatchObject({data: {collections: {qualifications: [{id: "q", partner_role: "supplier", decision: "approved"}], certifications: [{id: "c"}]}}});
    expect(h.read).not.toHaveBeenCalled();
  });
  it("supports transitional v1 reads but forbids new decision-only v1 publication", async () => {
    const transitional = {...qualification, dataBinding: legacy.dataBinding};
    expect(await fixture().call(transitional)).toMatchObject({data: {items: [{id: "qualifications"}]}});
    expect(() => validatePartnerSectionPublication([transitional])).toThrow("V2_REQUIRED");
  });
  it("fails incompatible and missing bindings before any data read", async () => {
    const h = fixture();
    await expect(h.call({...legacy, dataBinding: qualification.dataBinding})).rejects.toMatchObject({status: 503, code: "PARTNER_SECTION_CONTRACT_MISMATCH"});
    await expect(h.call(certificate, qualification.dataBinding.handlerKey)).rejects.toMatchObject({status: 503});
    expect(h.providers.sections.get("neon.bp.section.missing.v1")).toBeUndefined();
    expect(() => validatePartnerSectionPublication([{...qualification, dataBinding: {handlerKey: "unknown"}}])).toThrow("HANDLER_UNSUPPORTED");
    expect(h.section).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled();
  });
  it("upgrades only the decision binding and refuses to rewrite historical combined metadata", () => {
    const old = {...qualification, dataBinding: legacy.dataBinding};
    expect(qualificationContractOverlay([old, certificate, restriction, detail], [qualification])).toEqual([qualification, certificate, restriction, detail]);
    expect(old.dataBinding.handlerKey).toContain("qualifications-certificates.v1");
    expect(() => qualificationContractOverlay([legacy], [qualification])).toThrow("BASELINE_INVALID");
  });
  it("rejects malformed contract shapes", () => {
    expect(() => partnerSectionContract({...qualification, childCollections: {}})).toThrow("MISMATCH");
    expect(() => partnerSectionContract({...restriction, coreRef: certificate.coreRef})).toThrow("MISMATCH");
  });
});
