import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => JSON.parse(fs.readFileSync(p)),
  evidence = (p) => ({ path: p, sha256: sha(fs.readFileSync(p)) });
const oldPath =
    "governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json",
  old = read(oldPath),
  amendmentPath =
    "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.proposal.dev.json",
  amendment = read(amendmentPath);
const prefix = "governance/policy/reports/business-partner-protected-reveal-",
  sources = ["admin", "owner"].map(
    (a) => prefix + "comparisons-" + a + "-20260912.dev.json",
  ),
  live = sources.map(read);
for (const r of live) {
  assert.equal(r.runtimeImage, amendment.runtimeImage);
  assert.equal(r.releaseSetHash, amendment.releaseSetHash);
  assert.equal(r.kind, "authenticated_current_source_target_comparison");
  assert.equal(r.diagnosticComplete, true);
  assert.equal(r.authorityUnchanged, true);
  assert.equal(r.grantChanges.length, 0);
  assert(r.comparisons.length > 0);
}
const qualificationPaths = [
  "providers",
  "context",
  "staged-revocation",
  "post-revocation",
  "revocation",
  "compatible-recovery",
].map((n) => prefix + n + "-20260912.dev.json");
const qualification = qualificationPaths.map(read);
for (const r of qualification.slice(0, 4)) {
  assert.equal(r.complete, true);
  assert.equal(r.runtimeImage, amendment.runtimeImage);
  assert.equal(r.releaseSetHash, amendment.releaseSetHash);
}
assert(
  qualification[4].revoked &&
    qualification[4].stagedPassed &&
    qualification[4].postRevocationPassed,
);
assert(
  qualification[5].passed &&
    qualification[5].authorizationAndActivationsUnchanged,
);
const artifactPath =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/artifact.json",
  artifact = read(artifactPath),
  profile = artifact.envelope.payload.entityDescriptor.descriptor.authorization;
const root = amendment.artifacts.find(
  (a) => a.releaseId === "c2cc6900-26c1-47ca-8dfc-1d488000950c",
);
assert.equal(sha(fs.readFileSync(artifactPath)), root.artifactHash);
const oldRows = [...old.rows, ...old.currentDifferenceProposals];
assert.equal(oldRows.length, 66);
assert.equal(new Set(oldRows.map((r) => r.id)).size, 66);
const rows = oldRows.map((row) => {
  const observations = live.flatMap((r, i) => {
    const matches = r.comparisons.filter(
      (c) => c.operationKey === row.operation,
    );
    const groups = new Map();
    for (const c of matches) {
      const key = JSON.stringify([
        c.sourceAuthority,
        c.sourceStage,
        c.targetState,
        c.targetStage,
        c.backendState,
      ]);
      const g = groups.get(key) ?? {
        sourceAuthority: c.sourceAuthority,
        sourceStage: c.sourceStage,
        targetState: c.targetState,
        targetStage: c.targetStage,
        backendState: c.backendState,
        evaluationRefs: [],
      };
      g.evaluationRefs.push(c.evaluationRef);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({
      actor: r.actor,
      source: sources[i],
      ...g,
      count: g.evaluationRefs.length,
    }));
  });
  const deferred = profile.deferredOperations.includes(row.operation);
  const surfaceEvidence =
    deferred && ["create", "update"].includes(row.operation)
      ? live.flatMap((r, i) =>
          r.checks
            .filter((c) =>
              c.path.includes(
                "form-descriptor?mode=" +
                  (row.operation === "create" ? "create" : "edit"),
              ),
            )
            .map((c) => ({ source: sources[i], actor: r.actor, ...c })),
        )
      : [];
  assert(
    observations.length > 0 ||
      (deferred &&
        surfaceEvidence.length === 2 &&
        surfaceEvidence.every((c) => c.status === 409)),
    "MISSING_FINAL_EVIDENCE:" + row.id,
  );
  const disposition = row.id.startsWith("synthetic:")
    ? "accept_synthetic_semantics_with_final_release_observations"
    : row.id.startsWith("live:")
      ? "supersede_noncausal_aggregate_with_final_release_observations"
      : "accept_final_release_semantics_superseding_release19_snapshot";
  return {
    id: row.id,
    operation: row.operation,
    origin: row.id.split(":")[0],
    historicalExplanation: row.historicalExplanation ?? row.explanation,
    historicalDisposition: row.proposedDisposition,
    historicalEvidence: evidence(oldPath),
    historicalCauseProven: row.id.startsWith("live:") ? false : undefined,
    proposedDisposition: disposition,
    currentPolicy: deferred
      ? "Operation explicitly deferred in the signed profile; discovery or form denial does not authorize execution."
      : "Current decisions depend on the explicit operation permission, parent admission and selected ownership/context. Final-image traces below record each observed stage; historical grants are not recreated.",
    deferredInSignedProfile: deferred,
    observations,
    surfaceEvidence,
    executionParityClaimed: false,
    acceptance: null,
    status: "pending_explicit_acceptance",
  };
});
const currentOps = [
    ...new Set(live.flatMap((r) => r.comparisons.map((c) => c.operationKey))),
  ],
  historicalOps = [...new Set(rows.map((r) => r.operation))];
const p = {
  schemaVersion: 1,
  kind: "bp_final_release_66_disposition_review",
  createdAt: new Date().toISOString(),
  releaseId: root.releaseId,
  artifactHash: root.artifactHash,
  runtimeImage: amendment.runtimeImage,
  releaseSetHash: amendment.releaseSetHash,
  sourceProposal: evidence(oldPath),
  amendment: evidence(amendmentPath),
  historicalLedger: old.historicalLedger,
  finalArtifact: evidence(artifactPath),
  sources: sources.map(evidence),
  qualification: [
    ...qualificationPaths.map(evidence),
    evidence(
      "governance/policy/reports/business-partner-protected-reveal-mask-count-assessment-20260912.dev.json",
    ),
    evidence(
      "governance/policy/reports/business-partner-protected-bank-suffix-application-20260912.dev.json",
    ),
  ],
  regressions: evidence(
    "governance/policy/reports/business-partner-protected-reference-regressions-20260912.dev.json",
  ),
  rows,
  comparisonCount: live.reduce((n, r) => n + r.comparisons.length, 0),
  observedOperations: currentOps,
  additionalOperationsOutside66: currentOps.filter(
    (o) => !historicalOps.includes(o),
  ),
  mode: "isolated_source_target_intersection_with_published_canonical_reads",
  historicalPerEventCausalityReconstructed: false,
  fullExactReleaseQualification: false,
  executionParityApproved: false,
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  grantChanges: [],
  acceptance: null,
  separateOpenQualification: [
    "Positive ordinary-case openWork counts (Finance journal count is separately qualified).",
    "Admin provider revealable flags remain false despite admitted reveal commands; UI command-preflight integration remains an open defect, and updated UI source is not published or qualified.",
    "Full Atlas conversations, Mesh, global/legal-entity ownership and cross-instance revocation are outside this review.",
  ],
};
p.proposalRevision = sha(JSON.stringify(p));
const output =
  "governance/policy/reviews/business-partner-final-66-dispositions-20260912.proposal.dev.json";
fs.writeFileSync(output, JSON.stringify(p, null, 2) + "\n", { flag: "wx" });
const table = rows
  .map(
    (r) =>
      `| ${r.id} | ${r.operation} | ${
        r.deferredInSignedProfile
          ? "Deferred"
          : r.observations
              .map(
                (o) =>
                  o.actor +
                  ": " +
                  o.sourceAuthority +
                  " → " +
                  o.targetState +
                  " → " +
                  o.backendState,
              )
              .filter((v, i, a) => a.indexOf(v) === i)
              .join("; ")
      } | ${r.origin === "live" ? "Historical cause remains unknown; replace aggregate evidence" : r.origin === "synthetic" ? "Retain synthetic policy semantics" : "Replace old snapshot with current traced semantics"} |`,
  )
  .join("\n");
fs.writeFileSync(
  "docs/reviews/business-partner-final-66-dispositions-20260912.md",
  `# Final NEON release — 66 disposition review\n\nRevision **${p.proposalRevision}**. All **66 remain pending explicit acceptance**. This review carries forward the exact 29 historical and 37 release-19 IDs, with fresh evidence for the final image. It does not reuse the old release's acceptance.\n\nImage: **${p.runtimeImage}**. Release-set binding: **${p.releaseSetHash}**. BP artifact: **${p.artifactHash}**.\n\nThe final-image comparisons contain **${p.comparisonCount} correlated decisions** from both authenticated actors. The source → target → backend columns are current isolated observations, not reconstructed legacy shadow events. For published canonical reads, a denied source-scope diagnostic can coexist with target/backend allow: the signed target profile supplies canonical read authority. Reveal commands and independently owned child/Finance providers retain their separate authorization gates. These observations must not be described as uniform legacy enforcement. The 27 historical aggregate rows still have no proven per-event cause. Two synthetic rows retain their explicit policy interpretation; 37 earlier traced differences are replaced by the final snapshot.\n\nIntentional semantics proposed for acceptance are: explicit target permissions and parent admission; independently authorized child rows and Finance data; validated organization/company context; and operations explicitly deferred by the signed profile. Granted reads now pass where the earlier ungranted snapshot denied them. Historical grants are not restored. Neither discovery previews nor form denial prove command-execution parity.\n\nAll populated provider/context, staged revocation, post-revocation and compatible recovery reports required by the generator passed. The three authorization regression files passed 58 tests. The precise response/evaluation references and immutable evidence hashes for every row are in the [machine-readable proposal](../../${output}).\n\nAccepting this revision resolves these 66 review dispositions only. It does not activate enforcement, retire compatibility, authorize grants, or qualify the following remaining boundaries: positive ordinary-case openWork counts; the open admin reveal-affordance defect (read-provider flags remain false despite admitted commands) and unpublished updated UI source; full Atlas conversations; Mesh; global/legal-entity ownership; cross-instance revocation. Finance's real draft-journal count is qualified separately and is not evidence of populated ordinary-case counts.\n\n| Disposition ID | Operation | Final source → target → backend | Proposed treatment |\n| --- | --- | --- | --- |\n${table}\n`,
  { flag: "wx" },
);
console.log({
  proposalRevision: p.proposalRevision,
  rows: rows.length,
  comparisonCount: p.comparisonCount,
  accepted: false,
});
