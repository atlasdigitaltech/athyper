import { createPartnerCapabilityActionHandlers } from "../../../server/packages/services/master-data/src/index.js";
/** Offline draft evidence; never authors, approves, publishes or activates. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { parseCompiledEntityArtifact } from "../../../server/packages/contracts/publication/src/index.js";
import {
  assertCompleteRuntimeOperations,
  prepareSplitReadRuntime,
  validateCompiledRuntimeContracts,
} from "../../../server/packages/platform/metadata/src/index.js";
import { reconcileTenantSuccessor } from "../../../server/packages/services/publication/src/compilation/reconcile-successor.js";
import { discoverWorkspace } from "./source-workspace.mjs";
const [rootCode, capturePath, output] = process.argv.slice(2);
if (!rootCode || !capturePath || !output || process.argv.length !== 5)
  throw Error("Usage: <entity> <active-capture.json> <review.json>");
const bytes = readFileSync(capturePath),
  captured = JSON.parse(bytes.toString());
if (!Array.isArray(captured) || captured.length !== 2)
  throw Error("Platform and tenant captures required");
const baseline = captured.find((row) => row.tenantId === null),
  tenant = captured.find((row) => typeof row.tenantId === "string");
if (
  !baseline ||
  !tenant ||
  captured.some((row) => row.payload?.entityCode !== rootCode) ||
  tenant.payload.tenantId !== tenant.tenantId
)
  throw Error("Predecessor authority mismatch");
const workspace = discoverWorkspace();
const load = (code: string, name: string) => {
  const source = workspace.entities.get(code);
  if (!source) throw Error("Source missing: " + code);
  return JSON.parse(
    readFileSync(join(source.directory, name + ".json"), "utf8"),
  );
};
const hash = (value: unknown) => "sha256:" + sha256(canonicalBytes(value));
const parse = (value: any) => {
  const { artifactHash: _old, ...content } = value;
  return parseCompiledEntityArtifact({
    ...content,
    artifactHash: hash(content),
  });
};
const root = load(rootCode, "core");
const codes = [
  rootCode,
  ...(root.entityRelationships ?? []).map((r: any) => r.targetEntity),
];
if (new Set(codes).size !== codes.length) throw Error("Duplicate relationship");
const proposed = new Map<string, any>(
  baseline.payload.artifacts.map((a: any) => [a.artifactKey, a]),
);
const implementedHandlers = createPartnerCapabilityActionHandlers();
const operationGaps: any[] = [],
  candidates: any[] = [];
for (const code of codes) {
  const core = load(code, "core"),
    operation = load(code, "operation");
  const result = prepareSplitReadRuntime(core, operation);
  const runtime = {
    schema: core.schema,
    schemaVersion: 2,
    contractStatus: "unsigned_review_only",
    artifactType: "runtime_contract",
    artifactKey: code + "/runtime",
    entityCode: code,
    plane: core.plane,
    dependencies: [code + "/core", code + "/operation"],
    descriptor: result.descriptor,
  };
  const members = [core, operation, runtime].map(parse);
  candidates.push(...members);
  members.forEach((member) => proposed.set(member.artifactKey, member));
  for (const source of operation.operations.filter((op: any) =>
    result.remainingOperations.includes(op.key),
  ))
    operationGaps.push({
      entityCode: code,
      operation: source.key,
      source,
      status: implementedHandlers.has(source.execution?.handlerKey)
        ? "domain_handler_implemented_runtime_binding_pending"
        : "implementation_and_runtime_binding_required",
    });
}
validateCompiledRuntimeContracts(candidates);
let completenessError: string | null = null;
try {
  assertCompleteRuntimeOperations(candidates);
} catch (error) {
  completenessError = String(error);
}
const snapshot = (row: any) => ({
  publicationKey: row.publicationKey,
  sourceReleaseId: row.sourceReleaseId,
  sourceReleaseNo: row.sourceReleaseNo,
  artifactHash: row.artifactHash,
  tenantId: row.tenantId,
  entityCode: row.payload.entityCode,
  plane: root.plane,
  artifacts: row.payload.artifacts,
});
const reconciliation = reconcileTenantSuccessor({
  baseline: snapshot(baseline),
  tenant: snapshot(tenant),
  proposedProduct: [...proposed.values()],
  canonicalizer: { canonicalBytes, sha256 },
});
const oldRoot = tenant.payload.artifacts.find(
  (a: any) => a.artifactKey === rootCode + "/runtime",
)?.content?.descriptor;
if (
  !oldRoot?.authorizationRuntime?.bindings ||
  !oldRoot.authorization?.operations
)
  throw Error("Root predecessor bindings required");
const nextRoot = proposed.get(rootCode + "/runtime").content.descriptor;
const ledger = oldRoot.authorization.operations.map((before: any) => {
  const after =
    nextRoot.authorization.operations.find(
      (op: any) => op.key === before.key,
    ) ?? null;
  return {
    operation: before.key,
    before,
    beforeBinding:
      oldRoot.authorizationRuntime.bindings.find(
        (b: any) => b.operation === before.key,
      ) ?? null,
    after,
    afterBinding:
      nextRoot.authorizationRuntime.bindings.find(
        (b: any) => b.operation === before.key,
      ) ?? null,
    referencingSurfaces: (oldRoot.authorization.surfaces ?? []).filter(
      (s: any) => s.operation === before.key,
    ),
    status: after
      ? "changed_contract_requires_explicit_review"
      : "missing_successor_operation_preserve_predecessor",
  };
});
if (ledger.length !== oldRoot.authorizationRuntime.bindings.length)
  throw Error("Predecessor inventory mismatch");
const artifactPin = (a: any) =>
  a
    ? {
        artifactKey: a.artifactKey,
        artifactHash: a.artifactHash,
        contentHash: hash(a.content),
      }
    : null;
const review = {
  schema: "athyper.compiled-successor-build-review/1",
  status: "blocked_before_governed_draft",
  rootEntityCode: rootCode,
  captureByteHash: sha256(bytes),
  baseline: reconciliation.baseline,
  tenant: reconciliation.tenant,
  proposedProductContentHash: reconciliation.proposedProductContentHash,
  proposedMembers: [...proposed.values()].map(artifactPin),
  tenantArtifactDispositions: reconciliation.changes,
  conflicts: reconciliation.conflicts.map((c) => ({
    artifactKey: c.artifactKey,
    baseline: artifactPin(c.baseline),
    tenant: artifactPin(c.tenant),
    proposedProduct: artifactPin(c.proposedProduct),
  })),
  completeRuntimeOperations: completenessError === null,
  completenessError,
  operationGaps,
  implementedDomainHandlerCount: operationGaps.filter(
    (gap) =>
      gap.status === "domain_handler_implemented_runtime_binding_pending",
  ).length,
  remainingHandlerImplementationCount: operationGaps.filter(
    (gap) => gap.status === "implementation_and_runtime_binding_required",
  ).length,
  predecessorOperationLedger: ledger,
  retainedTenantArtifacts: reconciliation.changes
    .filter((c) => c.disposition === "tenant_delta_retained")
    .map((c) => c.artifactKey),
  governedSuccessorCreated: false,
  publicationPerformed: false,
  independentApprovalRecorded: false,
  platformAuthor: null,
  platformReviewer: null,
  tenantAuthor: null,
  tenantReviewer: null,
};
writeFileSync(output, JSON.stringify(review, null, 2) + "\n");
console.log(
  JSON.stringify({
    proposedProductArtifacts: proposed.size,
    legacyOperations: ledger.length,
    sourceOperationGaps: operationGaps.length,
    implementedDomainHandlerCount: review.implementedDomainHandlerCount,
    remainingHandlerImplementationCount:
      review.remainingHandlerImplementationCount,
    authorityConflicts: reconciliation.conflicts.map((c) => c.artifactKey),
    retainedTenantArtifacts: review.retainedTenantArtifacts,
    completeRuntimeOperations: review.completeRuntimeOperations,
    governedSuccessorCreated: false,
  }),
);
