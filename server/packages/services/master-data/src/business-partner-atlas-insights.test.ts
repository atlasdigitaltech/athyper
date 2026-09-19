import { describe, expect, it, vi } from "vitest";
import type { AtlasBusinessPartnerInsightRequest } from "@athyper/server-contract-ai";
import { createBusinessPartnerAtlasInsightOwner } from "./business-partner-atlas-insights.js";
import { MasterDataError } from "./errors.js";
const input = {context: {planeKey: "neon", tenantId: "tenant", principalId: "user"}, recordId: "bp", role: "supplier", operatingOrganizationId: "org", companyCodeId: "company", kind: "readiness"} as AtlasBusinessPartnerInsightRequest;
function harness() {
  const value = {scope: {businessPartnerId: "bp", roleLens: "supplier", operatingOrganizationId: "org", companyCodeId: "company"}, completeness: {status: "incomplete", readOnly: false, definitionVersion: "1", definitionHash: "definition", evaluatedAt: "2026-09-09T00:00:00Z", required: [{code: "address", fieldCode: "address.primary", sectionCode: "addresses", state: "missing"}], recommended: [], restrictedCount: 99}, sections: [{code: "addresses", authorization: "granted"}], openWork: {secret: "never-return"}};
  const summary = vi.fn(async () => value);
  const authorize = vi.fn(async (_: {permissionCode: string}) => ({allowed: true}));
  const resolve = vi.fn(async () => ({businessPartnerId: "bp", role: "supplier", operatingOrganizationId: "org", companyCodeId: "company", operationCode: "order", businessDate: "2026-09-09", eligible: false, reasons: [{detail: "never-return"}], decisionFingerprint: "protected-hash"}));
  const owner = createBusinessPartnerAtlasInsightOwner({summary: {summary}, authorizer: {authorize}, eligibility: {resolve}, now: () => new Date("2026-09-09T00:00:00Z")} as never);
  return {owner, value, summary, authorize, resolve};
}
describe("BP-AI-04 owner evidence", () => {
  it("returns saved required findings with definition and projected evidence", async () => {
    const h = harness(), result = await h.owner.read(input);
    expect(result.findings[0]?.value).toMatchObject({state: "evaluated_fail", facts: {requirement: "required", savedData: true}, evidenceIds: ["required:address"]});
    expect(result.evidence[0]?.value).toMatchObject({sourceRevisionKind: "projected_content_hash", ruleVersion: "1"});
    expect(JSON.stringify(result)).not.toMatch(/never-return|restrictedCount|percent/);
    expect(h.summary.mock.calls[0]).toEqual([expect.objectContaining({context: input.context, companyCodeId: "company"})]);
  });
  it.each(["missing", "satisfied", "restricted_satisfied"])("withholds hidden %s requirements and aggregate conclusions", async state => {
    const h = harness(); h.value.completeness.required[0]!.state = state; h.value.sections = [];
    const result = await h.owner.read(input);
    expect(result.coverage.value.state).toBe("partial");
    expect(result.evidence).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("address");
    expect(result.findings.map(f => f.value.code)).toEqual(["assessment_partial"]);
  });
  it("requires all explicit scope coordinates before evaluating", async () => {
    const h = harness(); const {companyCodeId: _, ...request} = input;
    expect((await h.owner.read(request)).findings[0]?.value).toMatchObject({code: "scope_required", state: "not_evaluated", facts: {missingCompany: true, missingRole: false, missingOperatingOrganization: false, missingOperation: false, missingBusinessDate: false}});
    expect(h.summary).not.toHaveBeenCalled(); expect(h.resolve).not.toHaveBeenCalled();
  });
  it("distinguishes unavailable definitions and providers from failure", async () => {
    const h = harness(); h.value.completeness.status = "definition_unavailable";
    expect((await h.owner.read(input)).findings[0]?.value.state).toBe("definition_unavailable");
    h.summary.mockRejectedValue(new MasterDataError(503, "OWNER_DOWN", "never-return"));
    expect((await h.owner.read(input)).findings[0]?.value.state).toBe("provider_unavailable");
  });
  it("denies wrong-plane, forged coordinates, and owner authorization failures", async () => {
    const h = harness();
    await expect(h.owner.read({...input, context: {...input.context, planeKey: "mesh"}})).rejects.toMatchObject({status: 403});
    h.value.scope.companyCodeId = "other";
    await expect(h.owner.read(input)).rejects.toMatchObject({status: 403});
    h.summary.mockRejectedValue(new MasterDataError(403, "SECRET", "never-return"));
    const result = await h.owner.read(input);
    expect(result.findings[0]?.value).toMatchObject({code: "scoped_assessment_unavailable", state: "not_evaluated"});
    expect(result.evidence).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("never-return");
  });
  it("returns only the owner transaction decision and preserves operation/date scope", async () => {
    const h = harness(); const request = {...input, kind: "eligibility", operation: "order", businessDate: "2026-09-09"} as const;
    const result = await h.owner.read(request);
    expect(result.findings[0]?.value).toMatchObject({state: "evaluated_fail", facts: {eligible: false, operation: "order", businessDate: "2026-09-09"}});
    expect(JSON.stringify(result)).not.toMatch(/never-return|protected-hash|reasons/);
    h.resolve.mockResolvedValue({...await h.resolve(), companyCodeId: "other"});
    await expect(h.owner.read(request)).rejects.toMatchObject({status: 403});
  });
  it("bounds a brief to three findings and marks partial coverage", async () => {
    const h = harness(); h.value.completeness.required = Array.from({length: 5}, (_, i) => ({...h.value.completeness.required[0]!, code: `address${i}`}));
    const result = await h.owner.read({...input, kind: "brief"});
    expect(result.findings).toHaveLength(3); expect(result.evidence).toHaveLength(3); expect(result.coverage.value.state).toBe("partial");
  });
});

it("returns missing-input guidance without evaluating transaction-scope authorization", async () => {
  const h = harness(); h.authorize.mockResolvedValue({allowed: false});
  const {companyCodeId: _, ...request} = input;
  const result = await h.owner.read(request);
  expect(result.findings[0]?.value).toMatchObject({code: "scope_required", facts: {missingCompany: true}});
  expect(h.authorize).not.toHaveBeenCalled(); expect(h.summary).not.toHaveBeenCalled(); expect(h.resolve).not.toHaveBeenCalled();
  expect((await h.owner.read(input)).findings[0]?.value).toMatchObject({code: "scoped_assessment_unavailable", state: "not_evaluated"});
  expect(h.summary).not.toHaveBeenCalled(); expect(h.resolve).not.toHaveBeenCalled();
});
