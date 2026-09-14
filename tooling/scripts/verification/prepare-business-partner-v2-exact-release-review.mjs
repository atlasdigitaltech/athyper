/** New release-bound proposals. Historical approvals are provenance only. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  hash,
  proposalHash,
} from "./entity-authorization/named-role-review.mjs";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const output =
  "governance/policy/reviews/business-partner-release-20-workflow.dev.json";
if (existsSync(output))
  throw Error(
    "Preserve the existing exact-release proposal; author a new revision for changes",
  );
const exactPath =
    "governance/policy/reports/business-partner-v2-exact-release.dev.json",
  exact = read(exactPath);
if (
  exact.coordinate.releaseId !== "21bec59b-86fb-441c-93b2-5027f2999d0b" ||
  exact.coordinate.releaseNo !== 20 ||
  exact.coordinate.operationKeys.length !== 42
)
  throw Error("Exact release changed");
const original = read(
  "governance/policy/reviews/business-partner-operation-workflow.dev.json",
);
const corrections = read(
  "governance/policy/reviews/business-partner-case-runtime-correction.dev.json",
);
const imported = read(
  "governance/policy/reviews/business-partner-governed-import-workflow.dev.json",
);
const head = exact.source.imported_baseline;
const predecessor = {
  tenantId: exact.coordinate.tenantId,
  planeKey: exact.coordinate.plane,
  entityCode: exact.coordinate.entityCode,
  publicationKey: exact.source.release_key,
  releaseId: head.sourceReleaseId,
  releaseNo: head.sourceReleaseNo,
  appliedReleaseId: head.appliedReleaseId,
  headVersion: head.rowVersion,
  compiledHash: head.descriptorHash,
};
const nominationPath =
  "governance/policy/reviews/business-partner-operation-reviewers.dev.json";
if (hash(readFileSync(nominationPath)) !== original.nominationSha256)
  throw Error("Reviewer nomination changed");
const d = exact.source.compiled_json,
  profile = d.authorization,
  runtime = d.authorizationRuntime;
const now = new Date();
const releaseReview = {
  schemaVersion: 1,
  coordinate: exact.coordinate,
  notBefore: now.toISOString(),
  expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
};
const sources = [
  "case",
  "read",
  "action",
  "import",
  "export",
  "reveal",
  "qualification",
].map(
  (k) =>
    `server/apps/platform-host/src/composition/business-partner-${k}-runtime.ts`,
);
const tests = [
  "case",
  "read",
  "action",
  "import",
  "export",
  "reveal",
  "qualification",
].map(
  (k) =>
    `server/apps/platform-host/src/composition/__tests__/business-partner-${k}-runtime.test.ts`,
);
const evidence = (paths) =>
  paths.map((path) => ({ path, sha256: hash(readFileSync(path)) }));
// Capture immutable evidence bytes under this revision; live runtime qualification
// is a later gate and is not asserted by these local regression file references.
const rows = original.rows.map((prior) => {
  const packet = corrections.rows.some((r) => r.operation === prior.operation)
    ? corrections
    : imported.rows.some((r) => r.operation === prior.operation)
      ? imported
      : original;
  const source = packet.rows.find((r) => r.operation === prior.operation);
  const op = profile.operations.find((o) => o.key === prior.operation),
    binding = runtime.bindings.find((b) => b.operation === prior.operation);
  if (
    !op &&
    !profile.deferredOperations.some(
      (o) => (typeof o === "string" ? o : o.key) === prior.operation,
    )
  )
    throw Error(
      `Operation not explicitly selected or deferred: ${prior.operation}`,
    );
  const permission = op
    ? exact.catalog.find((p) => p.code === op.permissionCode)
    : null;
  if (op && (!binding || !permission))
    throw Error(`Missing catalog/runtime binding: ${op.key}`);
  const proposal = {
    ...source.proposal,
    disposition: op ? "include" : "defer",
    releaseReview,
    canonicalReadAdmission: runtime.canonicalReadAdmission ?? null,
    priorApproval: {
      packetRevision: packet.packetRevision,
      proposalSha256: source.proposalSha256,
    },
    ...(op
      ? {
          permission: {
            ...source.proposal.permission,
            proposedCode: op.permissionCode,
            proposedId: permission.id,
            catalogAction: "retain_installed_definition_no_grants",
            grantAssignments: [],
          },
          target: op.target,
          effect: op.effect,
          scope: { ...source.proposal.scope, resolver: op.scope },
          handler: {
            key: binding.handler,
            variant: binding.variant ?? "default",
          },
          exactOperation: op,
          exactRuntimeBinding: binding,
        }
      : {}),
    implementationEvidence: evidence(sources),
    regressionEvidence: evidence(tests),
    qualificationStatus: "local_runtime_registration_regressions_only",
    remainingEngineering: [
      "Deploy and qualify the exact runtime registrations and signing adapters.",
      "Run authenticated journeys against the signed artifact.",
      "Review and accept policy differences separately; no policy-difference acceptance is implied.",
    ],
    nativeCompilationEligible: false,
    rationale: `Review release 20 and its exact native contract, profile, runtime bindings and catalog. ${source.proposal.rationale}`,
  };
  return {
    operation: prior.operation,
    proposal,
    proposalSha256: proposalHash(proposal),
  };
});
const body = {
  schemaVersion: 1,
  kind: "bp_operation_decision_packet",
  source: {
    path: exactPath,
    sha256: hash(readFileSync(exactPath)),
    base: predecessor,
    candidateHash: proposalHash(exact.coordinate),
  },
  nominationSha256: original.nominationSha256,
  reviewers: original.reviewers,
  reviewSubjects: [
    "Exact release 20 compilation/signing selection; no grants, activation or policy-difference acceptance",
  ],
  releaseReview,
  rows,
  grantChanges: [],
  activationAuthorized: false,
};
const packet = { ...body, packetRevision: proposalHash(body) };
writeFileSync(output, JSON.stringify(packet, null, 2) + "\n");
console.log({
  path: output,
  packetRevision: packet.packetRevision,
  included: rows.filter((r) => r.proposal.disposition === "include").length,
  deferred: rows.filter((r) => r.proposal.disposition === "defer").length,
  approvals: 0,
});
