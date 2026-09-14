import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const prefix = "governance/policy/reports/business-partner-release-20-";
const candidate = JSON.parse(
  fs.readFileSync(prefix + "context-candidate.dev.json"),
);
const sources = ["catl.admin", "catl.owner"].map((account) => {
  const path = prefix + "canonical-reads." + account + ".dev.json",
    bytes = fs.readFileSync(path),
    report = JSON.parse(bytes);
  assert.equal(report.imageId, candidate.imageId);
  assert.equal(report.mappingGaps.length, 0);
  assert.equal(report.diagnosticComplete, true);
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    report,
  };
});
assert.equal(
  sources[0].report.authoritySha256,
  sources[1].report.authoritySha256,
);
const groups = new Map();
for (const { report } of sources)
  for (const row of report.comparisons.filter((r) => r.differs)) {
    const key = [report.account, row.operationKey, row.legacy, row.target].join(
      ":",
    );
    if (!groups.has(key))
      groups.set(key, {
        account: report.account,
        operationKey: row.operationKey,
        legacy: row.legacy,
        target: row.target,
        observations: 0,
        evaluationRefs: [],
        proposedDisposition:
          row.target === "unavailable"
            ? "engineering_blocker_missing_source_catalog"
            : row.operationKey === "section_propose_change"
              ? "reviewed_deferral_requires_release_bound_reacceptance"
              : "explicit_release_bound_policy_review_required",
        accepted: false,
      });
    const group = groups.get(key);
    group.observations++;
    group.evaluationRefs.push(row.evaluationRef);
  }
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  imageId: candidate.imageId,
  artifactHash: sources[0].report.artifactHash,
  releaseId: sources[0].report.releaseId,
  authoritySha256: sources[0].report.authoritySha256,
  sources: sources.map(({ path, sha256 }) => ({ path, sha256 })),
  comparisons: sources.reduce((n, s) => n + s.report.comparisons.length, 0),
  mappingGaps: 0,
  groups: [...groups.values()].sort((a, b) =>
    [a.account, a.operationKey, a.legacy, a.target]
      .join(":")
      .localeCompare([b.account, b.operationKey, b.legacy, b.target].join(":")),
  ),
  priorDispositionsCount: 66,
  priorApprovalsRewritten: false,
  acceptanceRecorded: false,
  phaseClosed: false,
  limitations: [
    "These observation groups are not a one-to-one replacement for the historical 66 dispositions.",
    "Diagnostic completeness does not imply authorization success or policy acceptance.",
    "Comments and attachments remain unavailable: source definitions collaboration.comment.read and document.attachment.read are absent from the published catalog. No alias or permission grant was inferred.",
  ],
};
fs.writeFileSync(
  prefix + "canonical-capture-review.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    comparisons: report.comparisons,
    mappingGaps: 0,
    groups: report.groups.length,
    unavailableGroups: report.groups.filter((g) => g.target === "unavailable")
      .length,
  }),
);
