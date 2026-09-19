import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
import { compileRuntimeRestoration } from "../../../server/packages/planes/studio/meta-entity-authoring/src/runtime-restoration.ts";
import { baselineJsonHash } from "../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts";
import { parseEntityRuntimeDescriptor } from "../../../server/packages/platform/metadata/src/descriptor-parser.ts";
const root = "governance/policy/reviews/business-partner-reset-runtime";
if (
  fs.existsSync(root + ".proposal.dev.json") ||
  fs.existsSync(root + ".graph.dev.json")
)
  throw Error("Preserve existing proposal");
const bytes = fs.readFileSync(
    os.homedir() +
      "/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911/artifact.json",
  ),
  artifactHash = createHash("sha256").update(bytes).digest("hex");
if (
  artifactHash !==
  "81d8d9737fd50aecdcbb164ec958cd3a41b6e6d7515f79531340a04a8ea1be50"
)
  throw Error("Historical source artifact changed");
const artifact = JSON.parse(bytes.toString()),
  descriptor = structuredClone(
    artifact.envelope.payload.entityDescriptor.descriptor,
  );
descriptor.operation_scope_bindings = []; // Native worker recompiles current bindings; do not replay old operation IDs.
const graph = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json",
    "utf8",
  ),
);
const surface = graph.surfaces.find(
    (s: any) => s.layoutConfig?.authorizationSuccessor,
  ),
  layout = surface.layoutConfig;
const publicationKey = layout.authorizationSuccessor.predecessor.publicationKey;
delete layout.authorizationSuccessor;
delete layout.baselineImport;
surface.surfaceKey = "bp_reviewed_reset_runtime";
surface.title = "Business Partner reviewed reset runtime";
layout.runtimeRestoration = {
  schemaVersion: 1,
  kind: "reviewed_empty_target",
  tenantId: "44444444-4444-4444-8444-444444444444",
  publicationKey,
  sourceArtifactHash: artifactHash,
  descriptorHash: baselineJsonHash(descriptor),
  descriptor,
};
graph.tests.push({
  key: "reset_runtime_payload_exact",
  assertion: "path_equals",
  path: `surfaces.${graph.surfaces.indexOf(surface)}.layoutConfig.runtimeRestoration.descriptor`,
  expected: descriptor,
});
const validation = validateGraph(graph);
if (validation.issues.length) throw Error(JSON.stringify(validation.issues));
const tests = runContractTests(graph);
if (!tests.passed) throw Error("Native tests failed");
const compiled = compileGraph(graph),
  restored = compileRuntimeRestoration(compiled.descriptor)!;
parseEntityRuntimeDescriptor({
  entity_code: "business_partner",
  release_id: artifact.envelope.releaseId,
  release_no: 1,
  entity_contract_hash: "0".repeat(64),
  plane_code: "neon",
  compiled_hash: restored.descriptorHash,
  compiled_json: restored.descriptor,
});
const proposal = {
  schemaVersion: 1,
  kind: "bp_reviewed_reset_runtime_proposal",
  createdAt: new Date().toISOString(),
  sourceArtifactHash: artifactHash,
  publicationKey,
  graphHash: baselineJsonHash(graph),
  descriptorHash: restored.descriptorHash,
  nativeContractHash: compiled.contractHash,
  nativeDescriptorHash: compiled.descriptorHash,
  includedOperations: Object.keys(descriptor.operations).sort(),
  deferredOperations: JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-accepted-operations.dev.json",
      "utf8",
    ),
  ).deferredOperations,
  nativeTests: tests,
  sourceDelta: [
    "Clear generated operation_scope_bindings for current native compilation",
    "Replace deleted predecessor linkage with reviewed empty-target restoration marker",
  ],
  freshIndependentReviewRequired: true,
  historicalApprovalReused: false,
  grantsChanged: false,
  activationAuthorized: false,
  publicationEligible: false,
};
fs.writeFileSync(
  root + ".graph.dev.json",
  JSON.stringify(graph, null, 2) + "\n",
);
fs.writeFileSync(
  root + ".proposal.dev.json",
  JSON.stringify(
    { ...proposal, proposalRevision: baselineJsonHash(proposal) },
    null,
    2,
  ) + "\n",
);
console.log({
  proposalRevision: baselineJsonHash(proposal),
  operations: proposal.includedOperations.length,
  nativeTests: tests.results.length,
  restoredBranches: [
    "storage",
    "recordPresentation",
    "listPresentation",
    "authorization",
    "authorizationRuntime",
    "ai",
  ],
});
