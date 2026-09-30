import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AtlasSafeProse, AtlasValidatedAnswer, AtlasOwnerAssessment, atlasStarterQuestions } from "../../packages/platform/shell/shell/src/atlas-answer";
import type { AtlasGroundedAnswer } from "../../packages/platform/ai/agent-runtime/src/index";
const answer: AtlasGroundedAnswer = { text: "**Saved** record", envelope: { schemaVersion: 1, kind: "explanation", summary: "**Saved** record", evidenceIds: ["record:0"], findingIds: [] }, citations: [{ entityCode: "business_partner", recordId: "BP-1", revision: "3", descriptorHash: "hash", toolCode: "bp_read_summary" }], attachmentCitations: [], actions: [], threadId: "t1", publicModelId: "atlas-fast" };
test("safe prose formats emphasis and lists while keeping executable content inert", () => {
  const html = renderToStaticMarkup(<AtlasSafeProse text={'**Saved**\n\n- One\n- Two\n\n<script>alert(1)</script> [click](javascript:alert(1)) ![img](https://evil.test) `code`'}/>);
  assert.match(html, /<strong>Saved<\/strong>/);
  assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|<a /);
});
test("validated answers show local accessible sources and reject invented references", () => {
  const html = renderToStaticMarkup(<AtlasValidatedAnswer answer={answer}/>);
  assert.match(html, /aria-label="Answer sources"/);
  assert.match(html, /href="#/);
  assert.match(html, /Revision 3/);
  const invalid = renderToStaticMarkup(<AtlasValidatedAnswer answer={answer} envelope={{ ...answer.envelope!, nextActionId: "invented" }}/>);
  assert.match(invalid, /could not be verified/);
  assert.doesNotMatch(invalid, /<a |Saved/);
});
test("starter questions distinguish selection, saved edits, historical and case contexts", () => {
  const record = { schemaVersion: 1 as const, generationId: "g1", locale: "en", kind: "record" as const, entityCode: "business_partner", recordId: "bp1", dirty: false };
  assert.match(atlasStarterQuestions({ ...record, dirty: true })[0]!, /unsaved/);
  assert.match(atlasStarterQuestions({ ...record, asOf: "2026-09-01T00:00:00Z" })[0]!, /historical/);
  assert.match(atlasStarterQuestions({ ...record, caseId: "case1" })[0]!, /case/);
  assert.match(atlasStarterQuestions({ schemaVersion: 1, generationId: "g1", locale: "en", kind: "manage", entityCode: "business_partner", selectedIds: ["bp1"], visibleIds: [], analysisTarget: "selection", filters: [], sort: [], pageSize: 25, pageIndex: 0 })[0]!, /selected/);
});

test("source links open their evidence details and transfer keyboard focus", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const dom = new JSDOM("<div id='root'></div>", { url: "https://test.athyper.local/atlas" });
  const names = ["window", "document", "HTMLElement", "HTMLDetailsElement", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => { root.render(<AtlasValidatedAnswer answer={answer}/>); });
    const link = dom.window.document.querySelector("a")!;
    await act(async () => { link.click(); });
    assert.equal(dom.window.document.querySelector("details")?.open, true);
    assert.equal(dom.window.document.activeElement?.tagName, "SUMMARY");
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    names.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
  }
});

test("missing assessment scope shows only readable missing inputs in live and replay cards", () => {
  const insight = {schemaVersion: 1, scope: {entityCode: "business_partner", fingerprint: "scope"}, coverage: {target: "record", state: "partial"}, evaluatedAt: "2026-09-09T02:58:19Z", freshness: "current", evidence: [], actions: [], findings: [{id: "scope", code: "scope_required", state: "not_evaluated", severity: "info", ruleVersion: "1", evidenceIds: [], actionIds: [], facts: {missingRole: true, missingOperatingOrganization: true, missingCompany: true, missingOperation: false, missingBusinessDate: false, unknownDiagnostic: "DO_NOT_RENDER"}}]};
  for (const element of [<AtlasOwnerAssessment value={insight}/>, <AtlasValidatedAnswer answer={{...answer, insights: [insight] as never}}/>]) {
    const html = renderToStaticMarkup(element);
    assert.match(html, /To check readiness or eligibility/);
    assert.match(html, /<li>Supplier or customer role<\/li>/);
    assert.match(html, /<li>Operating organization<\/li>/);
    assert.match(html, /<li>Company<\/li>/);
    assert.doesNotMatch(html, /scope_required|missingRole|missingCompany|missingOperation|missingBusinessDate|unknownDiagnostic|DO_NOT_RENDER|>true<|>false<|Authorized assessment|Checked/);
    assert.doesNotMatch(html, /<li>Business date|<li>Transaction type/);
  }
  assert.match(renderToStaticMarkup(<AtlasOwnerAssessment value={{...insight, schemaVersion: 99}}/>), /could not be verified/);
});

test("HTTP access, missing-resource and service failures are not reported as disabled Atlas", async () => {
  const {atlasAnswerErrorMessage} = await import("../../packages/platform/ai/agent-ui/src/index");
  assert.match(atlasAnswerErrorMessage({status: 403}), /selected record or transaction context/);
  assert.match(atlasAnswerErrorMessage({status: 404}), /resource is unavailable/);
  assert.match(atlasAnswerErrorMessage({status: 503}), /temporarily unavailable/);
  for (const status of [403, 404, 503]) assert.doesNotMatch(atlasAnswerErrorMessage({status}), /not enabled/);
});

test("scoped denial is readable and does not expose internal diagnostics", () => {
  const insight = {schemaVersion: 1, scope: {entityCode: "business_partner", fingerprint: "scope"}, coverage: {target: "record", state: "partial"}, evaluatedAt: "2026-09-09T02:58:19Z", freshness: "current", evidence: [], actions: [], findings: [{id: "scoped_assessment_unavailable", code: "scoped_assessment_unavailable", state: "not_evaluated", severity: "info", ruleVersion: "1", evidenceIds: [], actionIds: [], facts: {diagnostic: "SECRET"}}]};
  for (const element of [<AtlasOwnerAssessment value={insight}/>, <AtlasValidatedAnswer answer={{...answer, insights: [insight] as never}}/>]) {
    const html = renderToStaticMarkup(element);
    assert.match(html, /Organization\/company assessment unavailable/);
    assert.match(html, /have not been evaluated/);
    assert.doesNotMatch(html, /scoped_assessment_unavailable|SECRET|diagnostic|Checked|Authorized assessment/);
  }
});

test("list comparisons render authoritative coverage, overlapping counts and accessible table headings", () => {
  const insight = {schemaVersion: 1, scope: {entityCode: "business_partner", fingerprint: "s"}, coverage: {target: "selection", state: "partial", evaluatedCount: 1, authorizedTotalCount: 30}, evaluatedAt: "2026-09-09T00:00:00Z", freshness: "current", evidence: [], actions: [], findings: [{id: "population", code: "list_coverage", state: "not_evaluated", severity: "info", facts: {distinctPartnersWithFindings: 1, countsOverlap: true}, ruleVersion: "1", evidenceIds: [], actionIds: []}, {id: "partner:1", code: "partner_comparison", state: "evaluated_fail", severity: "warning", facts: {code: "BP-1", display_name: "<script>Acme</script>", status: "active", evaluated: true, disclosedIssueCount: 2}, ruleVersion: "1", evidenceIds: [], actionIds: []}]};
  const html = renderToStaticMarkup(<AtlasOwnerAssessment value={insight}/>);
  assert.match(html, /selection.*partial.*1 evaluated.*of 30/);
  assert.match(html, /<caption>Authorized partner comparison<\/caption>/);
  assert.match(html, /scope="col">Lifecycle status/);
  assert.match(html, /scope="row">&lt;script&gt;Acme/);
  assert.match(html, /Issue counts overlap/);
  assert.doesNotMatch(html, /<script>|ready for purchasing/);
});
