/** Freeze authenticated receipts for the pinned read-only signing adapter.
 * Sealing does not assert current reviewer authority or authorize signing itself. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { assessOperationDecisions } from "./entity-authorization/authenticated-operation-review.mjs";
import { proposalHash } from "./entity-authorization/named-role-review.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const root = join(
  homedir(),
  ".athyper/instances/dev/deployments/bp-enter-correction-review-20260911",
);
const packetBytes = readFileSync(join(root, "review/packet.json")),
  nominationBytes = readFileSync(join(root, "review/nomination.json")),
  stateBytes = readFileSync(join(root, "review/output/state.json"));
const packet = JSON.parse(packetBytes),
  state = JSON.parse(stateBytes),
  nomination = JSON.parse(nominationBytes);
const { packetRevision, ...body } = packet;
if (
  proposalHash(body) !== packetRevision ||
  state.packetRevision !== packetRevision ||
  hash(nominationBytes) !== packet.nominationSha256 ||
  state.receipts.length !== 2
)
  throw Error("Exact authenticated review required");
const assessment = assessOperationDecisions(packet, state.receipts);
if (!assessment.proposalReviewComplete || assessment.unresolvedRows)
  throw Error("Unresolved review rows");
for (const reviewer of packet.reviewers) {
  const matching = state.receipts.filter(
    (r) => r.actor.reviewerId === reviewer.id,
  );
  if (matching.length !== 1) throw Error("One receipt per reviewer required");
  const r = matching[0],
    n = nomination.reviewers.find((n) => n.id === reviewer.id);
  if (
    !n ||
    r.actor.principalId !== n.principalId ||
    r.actor.tenantId !== n.homeTenantId ||
    r.actor.assurance !== "elevated" ||
    !r.authenticatedReviewer ||
    r.nominationSha256 !== packet.nominationSha256 ||
    r.packetRevision !== packetRevision ||
    r.activationAuthorized !== false ||
    r.grantChanges.length
  )
    throw Error("Invalid authenticated receipt");
}
for (const row of packet.rows) {
  if (proposalHash(row.proposal) !== row.proposalSha256)
    throw Error("Proposal changed");
  for (const e of [
    ...row.proposal.implementationEvidence,
    ...row.proposal.regressionEvidence,
  ])
    if (hash(readFileSync(e.path)) !== e.sha256)
      throw Error("Reviewed evidence changed: " + e.path);
}
const id = packet.releaseReview.coordinate.releaseId;
if (id !== "c2cc6900-26c1-47ca-8dfc-1d488000950c")
  throw Error("Unexpected release");
const directory = join(root, "sealed", id);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const manifest = {
  schemaVersion: 1,
  releaseId: id,
  packetSha256: hash(packetBytes),
  stateSha256: hash(stateBytes),
  nominationSha256: hash(nominationBytes),
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
for (const [name, bytes] of [
  ["packet.json", packetBytes],
  ["state.json", stateBytes],
  ["nomination.json", nominationBytes],
  ["manifest.json", manifestBytes],
]) {
  const path = join(directory, name);
  if (existsSync(path)) {
    if (!readFileSync(path).equals(bytes))
      throw Error("Sealed evidence changed");
  } else writeFileSync(path, bytes, { mode: 0o400, flag: "wx" });
}
const report = {
  schemaVersion: 1,
  kind: "bp_release_review_seal",
  sealedAt: new Date().toISOString(),
  releaseId: id,
  packetRevision,
  manifestSha256: hash(manifestBytes),
  directory,
  reviewComplete: true,
  included: 42,
  deferred: 9,
  currentReviewerAuthorityStillRequired: true,
  sourceAndCatalogRecheckRequired: true,
  signed: false,
  policyDifferencesAccepted: false,
  grantChanges: [],
  activationAuthorized: false,
};
writeFileSync(
  "governance/policy/reports/business-partner-enter-correction-review-seal.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  releaseId: id,
  reviewComplete: true,
  manifestSha256: report.manifestSha256,
  signed: false,
});
