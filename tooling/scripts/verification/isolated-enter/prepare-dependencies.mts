import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  canonicalBytes,
  sha256,
} from "../../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { compileBusinessPartnerDefinition } from "../../../../server/packages/services/publication/src/business-partner-definition-compiler.js";
import { LocalBusinessPartnerDefinitionConsumer } from "../../../../server/packages/services/publication/src/business-partner-definition-consumer.js";
import { compileDocumentCollection } from "../../../../server/packages/services/publication/src/document-collection-compiler.js";
import { parseEntityRuntimeDescriptor } from "../../../../server/packages/platform/metadata/src/descriptor-parser.js";
const root = "governance/policy/reviews/bp-dependencies-20260912/";
const source = JSON.parse(
  readFileSync(root + "onboarding-source.json", "utf8"),
);
const run = (args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const expectedImage =
  "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47";
if (
  run(["inspect", "--format", "{{.Image}}", "athyper-bp-enter-api"]).trim() !==
  expectedImage
)
  throw Error(
    "Runtime image changed; prepare a newly reviewed dependency proposal",
  );
if (sha256(canonicalBytes(source.bundle)) !== source.bundleHash)
  throw Error("Source bundle provenance hash mismatch");
const paths = {
  request:
    "/app/server/node_modules/@athyper/server-contract-master-data/dist/business-partner-requests.d.ts",
  eligibility:
    "/app/server/node_modules/@athyper/server-contract-master-data/dist/business-partner-eligibility.d.ts",
  meshProfile:
    "/app/server/node_modules/@athyper/server-plane-mesh/dist/business-partner-profile-publication.js",
  meshMatch:
    "/app/server/node_modules/@athyper/server-plane-neon/dist/business-partner-profile-match.js",
};
const sourceBindings = JSON.parse(
  run([
    "exec",
    "athyper-bp-enter-api",
    "node",
    "--input-type=module",
    "-e",
    `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(JSON.stringify(Object.fromEntries(Object.entries(${JSON.stringify(paths)}).map(([key,path])=>[key,{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}]))));`,
  ]),
);
const hashes = Object.fromEntries(
  Object.entries(sourceBindings).map(([key, value]: [string, any]) => [
    key,
    value.sha256,
  ]),
);
const bundle = {
  ...source.bundle,
  semanticVersion: "3.1.2",
  sourceContractHashes: hashes,
};
const compilation = compileBusinessPartnerDefinition({
  bundle,
  plane: "neon",
  canonicalizer: { canonicalBytes, sha256 },
  expectedSourceContractHashes: hashes,
});
const second = compileBusinessPartnerDefinition({
  bundle,
  plane: "neon",
  canonicalizer: { canonicalBytes, sha256 },
  expectedSourceContractHashes: hashes,
});
if (second.compiledBundleHash !== compilation.compiledBundleHash)
  throw Error("Non-deterministic bundle");
const changedSections = Object.keys(bundle).filter(
  (key) =>
    sha256(canonicalBytes(bundle[key])) !==
    sha256(canonicalBytes(source.bundle[key])),
);
if (
  changedSections.some(
    (key) => !["semanticVersion", "sourceContractHashes"].includes(key),
  )
)
  throw Error("Unreviewed policy change");
// Pure consumer fixture, not an applied publication or a fabricated approval.
const consumer = new LocalBusinessPartnerDefinitionConsumer({
  local: {
    findActiveBusinessPartnerDefinition: async () =>
      ({
        revisionId: source.id,
        releaseId: "00000000-0000-4000-8000-000000000001",
        releaseNo: 1,
        bundle,
        bundleHash: compilation.compiledBundleHash,
      }) as any,
  },
  canonicalizer: { canonicalBytes, sha256 },
});
const schema = await consumer.requestSchema({
  kind: "new_partner",
  requestedRole: "supplier",
  sourceKind: "manual",
});
const workflow = await consumer.workflow({
  kind: "new_partner",
  requestedRole: "supplier",
  proposedPayload: {},
});
if (!workflow.stages.some((stage) => stage.routed))
  throw Error("No routed stage");
const native = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-request-native-candidate-20260912.compilation.dev.json",
    "utf8",
  ),
);
const inventory = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-enter-qualification-access-20260912.after-application.dev.json",
    "utf8",
  ),
);
const catalog = inventory.captures
  .find((c: any) => c.container === "athyper-bp-enter-db" && c.plane === "neon")
  .catalog.filter((p: any) => p.status === "published")
  .map((p: any) => ({
    id: p.id,
    code: p.code,
    kind: p.kind,
    scopeKinds: (p.scopes ?? [])
      .filter((s: any) => s.status === "active")
      .map((s: any) => s.scopeKind),
  }));
const descriptor = compileDocumentCollection(
  native.artifact.descriptor,
  "neon",
  catalog,
);
const descriptorHash = sha256(canonicalBytes(descriptor));
parseEntityRuntimeDescriptor({
  entity_code: "business_partner_request",
  release_id: "00000000-0000-4000-8000-000000000001",
  release_no: 1,
  entity_contract_hash: native.artifact.contractHash,
  plane_code: "neon",
  compiled_hash: descriptorHash,
  compiled_json: descriptor,
});
const proposal = {
  schemaVersion: 1,
  preparedAt: new Date().toISOString(),
  kind: "isolated_bp_dependency_candidates",
  runtimeArtifactHash:
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
  runtimeImage:
    "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47",
  onboarding: {
    sourceRevisionId: source.id,
    sourceBundleHash: source.bundleHash,
    sourceBindings,
    changedSections,
    bundle,
    targetPlanes: ["neon"],
    compileReport: compilation.report,
    consumerFixture: {
      requestSchemaCode: schema.code,
      requestSchemaHash: schema.hash,
      workflowCode: workflow.code,
      workflowHash: workflow.hash,
      routedStages: workflow.stages.filter((s) => s.routed).length,
    },
  },
  child: {
    nativeGraph:
      "governance/policy/reviews/business-partner-request-native-candidate-20260912.json",
    nativeContractHash: native.artifact.contractHash,
    nativeDescriptorHash: native.artifact.descriptorHash,
    descriptorHash,
    descriptor,
  },
  missingAdditionalDependency: {
    entityCode: "master.business_partner",
    kind: "entity_case_runtime",
    reason:
      "No active case contract exists; the current case-contract publisher supports updates only and requires a real predecessor.",
  },
  approvalStatus: "pending",
  signed: false,
  deployed: false,
  grantChanges: [],
  enforcementActivationAuthorized: false,
};
const proposalRevision = sha256(canonicalBytes(proposal));
writeFileSync(
  root + "proposal.json",
  JSON.stringify({ ...proposal, proposalRevision }, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  proposalRevision,
  onboardingCompatible: true,
  changedSections,
  childDescriptorParsed: true,
  consumerFixturePassed: true,
  signed: false,
  missingCaseContract: true,
});
