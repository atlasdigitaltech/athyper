import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerSectionContract, validatePartnerSectionPublication } from "../partner-section-contract.js";
import { qualificationContractOverlay } from "../../../../../scripts/db-verification/provisioning/qualification-contract-overlay.js";
const artifact = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../../../../metadata/entities/business_partner/presentation.${name}.json`, import.meta.url), "utf8"));
const qualification = artifact("section.qualifications-certificates");
const certificate = artifact("section.certificates");
const restriction = artifact("section.restrictions");
const detail = artifact("detail");
const legacy = { ...qualification, dataBinding: { ...qualification.dataBinding, handlerKey: "neon.bp.section.qualifications-certificates.v1" }, fieldBindings: [], childCollections: [
  {key: "qualifications", coreRef: "business_partner_qualification/core.json"},
  {key: "certifications", coreRef: "certification/core.json"},
] };
// Publication still consumes these metadata contracts. Runtime assertions for
// the retired BP record providers do not belong to this publication suite.
describe("partner section publication contracts", () => {
  it("binds three separate destinations in current metadata", () => {
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
