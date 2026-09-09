import assert from "node:assert/strict";
import test from "node:test";
import { parseAtlasAnswerEnvelope } from "../../server/packages/contracts/ai/src/answer";
const authority = { evidenceIds: ["source-1"], actionIds: ["submit-1"] };
const answer = { schemaVersion: 1, kind: "brief", summary: "Saved record summary.", findingIds: [], evidenceIds: ["source-1"] };
test("answer envelope accepts only current authoritative references and detached arrays", () => {
  const parsed = parseAtlasAnswerEnvelope(answer, authority);
  assert.deepEqual(parsed.evidenceIds, ["source-1"]);
  assert.ok(Object.isFrozen(parsed.evidenceIds));
  assert.equal(parseAtlasAnswerEnvelope({ ...answer, nextActionId: "submit-1" }, authority).nextActionId, "submit-1");
  for (const change of [{ evidenceIds: ["invented"] }, { findingIds: ["invented"] }, { nextActionId: "invented" }, { href: "/admin" }, { coverage: { authorizedTotalCount: 100 } }, { summary: "" }, { explanation: "x".repeat(24001) }, { evidenceIds: ["source-1", "source-1"] }, { schemaVersion: 2 }]) {
    assert.throws(() => parseAtlasAnswerEnvelope({ ...answer, ...change }, authority), /Invalid Atlas/);
  }
  assert.throws(() => parseAtlasAnswerEnvelope(answer, { evidenceIds: [], actionIds: [] }));
});
test("finding selection cannot omit owner evidence or smuggle unregistered actions", () => {
  const insight = { schemaVersion: 1 as const, scope: { entityCode: "business_partner", fingerprint: "scope" }, coverage: { target: "record" as const, state: "partial" as const, evaluatedCount: 1 }, evaluatedAt: "2026-09-09T10:00:00Z", freshness: "current" as const,
    evidence: [{ id: "e1", entityCode: "business_partner", recordId: "bp1", descriptorRevision: "v1", sourceRevision: "1", sourceRevisionKind: "record_version" as const, observedAt: "2026-09-09T10:00:00Z" }],
    findings: [{ id: "f1", code: "requirements", severity: "warning" as const, state: "not_evaluated" as const, facts: { evaluated: false }, ruleVersion: "v1", evidenceIds: ["e1"], actionIds: ["a1"] }], actions: [{ id: "a1", actionId: "registered.review", evidenceIds: ["e1"] }] };
  const candidate = { ...answer, evidenceIds: ["e1"], findingIds: ["f1"] };
  assert.doesNotThrow(() => parseAtlasAnswerEnvelope(candidate, { ...authority, insight }));
  assert.throws(() => parseAtlasAnswerEnvelope({ ...candidate, evidenceIds: [] }, { ...authority, insight }));
  assert.throws(() => parseAtlasAnswerEnvelope({ ...candidate, nextActionId: "a1" }, { ...authority, insight }));
});
