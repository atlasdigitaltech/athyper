import fs from "node:fs";
import { baselineJsonHash as hash } from "../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts";
import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
import { compileRuntimeRestoration } from "../../../server/packages/planes/studio/meta-entity-authoring/src/runtime-restoration.ts";
import { assertCanonicalReadSourceCatalog } from "../../../server/packages/services/publication/src/canonical-read-catalog.ts";
import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
} from "../../../server/packages/contracts/metadata/src/index.ts";
const root = "governance/policy/reviews/business-partner-enter-correction";
if (fs.existsSync(root + ".proposal.dev.json"))
  throw Error("Preserve proposal");
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const graph = read(
  "governance/policy/reviews/business-partner-reset-runtime.graph.dev.json",
);
const source = read(
  "governance/policy/reviews/business-partner-reset-runtime.proposal.dev.json",
);
if (hash(graph) !== source.graphHash) throw Error("Source graph changed");
const decision = {
  kind: "remove_nonexistent_legacy_enter_source",
  operation: "enter",
  removedSource: "neon.relationship.business_partner.enter",
  retainedTarget: "neon.relationship.bp_target.enter",
  reason:
    "Original reviewed operation packet explicitly has existingId null and no source catalog scopes",
  preservesOtherTransitions: true,
  targetGrantRequired: true,
  noLegacyFallback: true,
};
const reviewRevision = hash(decision);
function correct(v: any) {
  if (!v || typeof v !== "object") return;
  if (v.kind === "entity_canonical_read_admission") {
    if (!v.transitions.some((t: any) => t.operationKey === "enter"))
      throw Error("Expected source transition");
    v.transitions = v.transitions.filter(
      (t: any) => t.operationKey !== "enter",
    );
    v.reviewRevision = reviewRevision;
  }
  for (const child of Object.values(v)) correct(child);
}
correct(graph);
// New draft rows require fresh identities; embedded published runtime IDs remain provenance.
const ids = new Map<string, string>();
for (const [branch, rows] of Object.entries(graph)) {
  if (branch === "tests" || !Array.isArray(rows)) continue;
  for (const row of rows as any[])
    if (typeof row.id === "string") {
      const digest = hash({
        draft: "bp-enter-source-correction",
        branch,
        id: row.id,
      });
      ids.set(
        row.id,
        `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
      );
    }
}
function rekey(v: any): any {
  if (typeof v === "string") return ids.get(v) ?? v;
  if (Array.isArray(v)) return v.map(rekey);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k === "layoutConfig" || k === "tests" ? x : rekey(x),
      ]),
    );
  return v;
}
for (const [branch, rows] of Object.entries(graph))
  if (branch !== "tests" && Array.isArray(rows)) graph[branch] = rekey(rows);

const surface = graph.surfaces.find(
    (s: any) => s.layoutConfig?.runtimeRestoration,
  ),
  marker = surface.layoutConfig.runtimeRestoration;
marker.publicationKey = source.publicationKey + ".enter-correction";
marker.descriptorHash = hash(marker.descriptor);
graph.tests = graph.tests.filter(
  (t: any) => t.key !== "reset_runtime_payload_exact",
);
graph.tests.push({
  key: "reset_runtime_payload_exact",
  assertion: "path_equals",
  path: `surfaces.${graph.surfaces.indexOf(surface)}.layoutConfig.runtimeRestoration.descriptor`,
  expected: structuredClone(marker.descriptor),
});
const validation = validateGraph(graph),
  tests = runContractTests(graph);
if (validation.issues.length || !tests.passed)
  throw Error(JSON.stringify({ validation, tests }));
const compiled = compileGraph(graph),
  restored = compileRuntimeRestoration(compiled.descriptor)!;
const profile = parseEntityAuthorizationProfile(
    restored.descriptor.authorization,
  ),
  runtime = parseEntityAuthorizationRuntime(
    restored.descriptor.authorizationRuntime,
    profile,
  );
const capture = read(
  "governance/policy/reports/business-partner-reset-exact-release.dev.json",
);
const installed = read(
  "governance/policy/reports/business-partner-reset-runtime-catalog.installation.dev.json",
);
if (!installed.complete) throw Error("Catalog installation required");
const catalog = [
  ...capture.catalog,
  ...read(
    "governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json",
  ).definitions.map((d: any) => ({
    id: installed.installations[0].definitions.find(
      (x: any) => x.code === d.code,
    ).id,
    code: d.code,
    kind: d.permission_kind,
    scopeKinds: d.scopes.map((s: any) => s.scopeKind),
  })),
];
assertCanonicalReadSourceCatalog(runtime, catalog);
let originalRejected = false;
try {
  assertCanonicalReadSourceCatalog(
    capture.source.compiled_json.authorizationRuntime,
    catalog,
  );
} catch {
  originalRejected = true;
}
if (!originalRejected) throw Error("Original defect must remain rejected");
const p = {
  schemaVersion: 1,
  decision,
  reviewRevision,
  replacesUnactivatedReleaseId: capture.coordinate.releaseId,
  sourceProposalRevision: source.proposalRevision,
  publicationKey: marker.publicationKey,
  publicationStrategy:
    "Fresh empty-target replacement key; prior published sequence stays immutable and unactivated",
  graphHash: hash(graph),
  nativeContractHash: compiled.contractHash,
  descriptorHash: restored.descriptorHash,
  includedOperations: source.includedOperations,
  deferredOperations: source.deferredOperations,
  validation,
  nativeTests: tests,
  sourceCatalogRegression: { correctedPasses: true, originalRejected },
  freshIndependentReviewRequired: true,
  published: false,
  grantsChanged: false,
  activationAuthorized: false,
};
fs.writeFileSync(
  root + ".graph.dev.json",
  JSON.stringify(graph, null, 2) + "\n",
);
fs.writeFileSync(
  root + ".proposal.dev.json",
  JSON.stringify({ ...p, proposalRevision: hash(p) }, null, 2) + "\n",
);
console.log({
  proposalRevision: hash(p),
  nativeTests: tests.results.length,
  sourceCatalogPass: true,
  operations: source.includedOperations.length,
});
