import { describe, expect, it } from "vitest";
import { partnerSectionContract, validatePartnerSectionPublication } from "../partner-section-contract.js";
import { qualificationContractOverlay } from "../../../../../scripts/db-verification/provisioning/qualification-contract-overlay.js";
// Historical compatibility fixtures only. These do not restore removed source
// definitions, handlers, routes or production publications.
const qualification = {
  artifactKey: "business_partner/presentation.section.qualifications-certificates",
  sectionKey: "qualifications-certificates", coreRef: "business_partner_qualification/core.json",
  dataBinding: {handlerKey: "neon.bp.section.qualifications.v2", ownerEntityCode: "business_partner"},
  fieldBindings: [{fieldKey: "decision"}, {fieldKey: "coverage"}], childCollections: [],
};
const certificate = {
  artifactKey: "business_partner/presentation.section.certificates",
  sectionKey: "certificates", coreRef: "certification/core.json",
  dataBinding: {handlerKey: "neon.bp.section.certificates.v1", ownerEntityCode: "business_partner"},
  childCollections: [{key: "certifications", coreRef: "certification/core.json"}],
};
const restriction = {
  artifactKey: "business_partner/presentation.section.restrictions",
  sectionKey: "restrictions", coreRef: "business_partner_restriction/core.json",
  dataBinding: {handlerKey: "neon.bp.section.restrictions.v1", ownerEntityCode: "business_partner"},
  fieldBindings: [{fieldKey: "status"}, {fieldKey: "coverage"}], childCollections: [],
};
const detail = {navigation: {tabs: [
  {key: "360", sectionKeys: ["certificates"]},
  {key: "qualifications", sectionKeys: ["qualifications-certificates", "restrictions"]},
]}};
const legacy = { ...qualification, dataBinding: { ...qualification.dataBinding, handlerKey: "neon.bp.section.qualifications-certificates.v1" }, fieldBindings: [], childCollections: [
  {key: "qualifications", coreRef: "business_partner_qualification/core.json"},
  {key: "certifications", coreRef: "certification/core.json"},
] };
// Publication still consumes these metadata contracts. Runtime assertions for
// the retired BP record providers do not belong to this publication suite.
describe("partner section publication contracts", () => {
  it("validates three separate destinations in historical compatibility fixtures", () => {
    validatePartnerSectionPublication([qualification, certificate, restriction]);
    expect(detail.navigation.tabs.find((t: any) => t.key === "360").sectionKeys).toContain("certificates");
    expect(detail.navigation.tabs.find((t: any) => t.key === "qualifications").sectionKeys).toEqual(["qualifications-certificates", "restrictions"]);
  });
  it("forbids new decision-only v1 publication", () => {
    const transitional = {...qualification, dataBinding: legacy.dataBinding};
    expect(() => validatePartnerSectionPublication([transitional])).toThrow("V2_REQUIRED");
  });
  it("rejects incompatible and unsupported publication bindings", () => {
    expect(() => validatePartnerSectionPublication([{...legacy, dataBinding: qualification.dataBinding}])).toThrow("PARTNER_SECTION_CONTRACT_MISMATCH");
    expect(() => validatePartnerSectionPublication([{...qualification, dataBinding: {handlerKey: "unknown"}}])).toThrow("HANDLER_UNSUPPORTED");
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
