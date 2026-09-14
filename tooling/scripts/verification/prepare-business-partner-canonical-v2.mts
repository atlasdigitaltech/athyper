import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  validateGraph,
  compileGraph,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
import { parseEntityAuthorizationRuntime } from "../../../server/packages/contracts/metadata/src/entity-authorization-runtime.ts";
import { compileAuthorizationSuccessorDescriptor } from "../../../server/packages/planes/studio/meta-entity-authoring/src/authorization-successor.ts";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const hash = (v: any) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
const artifactPath =
  homedir() +
  "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911/artifact.json";
if (
  createHash("sha256").update(readFileSync(artifactPath)).digest("hex") !==
  "a1b5c585802eab7c5a0c3c83b85033a066607476070bfb4e7efb3201618620fa"
)
  throw Error("SOURCE_ARTIFACT_CHANGED");
const a = read(artifactPath),
  p = read(
    "governance/policy/reviews/business-partner-canonical-read-transition.proposal.dev.json",
  ),
  accept = read(
    "governance/policy/reviews/business-partner-canonical-read-transition.acceptance.dev.json",
  );
if (
  accept.proposalRevision !== p.proposalRevision ||
  accept.scope !== "implementation_design_only" ||
  p.rows.length !== 17
)
  throw Error("DESIGN_REVIEW_MISMATCH");
const source = read(
  "governance/policy/reports/business-partner-combined-source.dev.json",
).source;
const descriptor = structuredClone(
    a.envelope.payload.entityDescriptor.descriptor,
  ),
  profile = descriptor.authorization;
descriptor.authorizationRuntime = parseEntityAuthorizationRuntime(
  {
    schemaVersion: 2,
    runtimeVersion: "entity-authorization.v2",
    bindings: descriptor.authorizationRuntime.bindings,
    canonicalReadAdmission: {
      schemaVersion: 1,
      kind: "entity_canonical_read_admission",
      entityCode: profile.entityCode,
      planeKey: profile.planeKey,
      profileHash: hash(profile),
      reviewRevision: accept.proposalRevision,
      transitions: p.rows.map((r: any) => ({
        operationKey: r.operation,
        sourcePermissionCode: r.sourcePermission,
        targetPermissionCode: r.targetPermission,
      })),
    },
  },
  profile,
);
descriptor.operation_scope_bindings = [];
// Publication owns release source identities; preserve the predecessor marker until native signing generates successor coordinates.
descriptor.source = structuredClone(source.descriptor.source);
const graph = structuredClone(a.envelope.payload.entityContract.contract);
const ids = new Map<string, string>();
for (const [branch, rows] of Object.entries(graph))
  if (Array.isArray(rows))
    for (const row of rows)
      if (row?.id) {
        const h = hash(["canonical-v2", hash(descriptor), branch, row.id]);
        ids.set(
          row.id,
          `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
        );
      }
for (const rows of Object.values(graph))
  if (Array.isArray(rows))
    for (const row of rows)
      for (const key of Object.keys(row))
        if (typeof row[key] === "string" && ids.has(row[key]))
          row[key] = ids.get(row[key]);
const surface = graph.surfaces.find(
  (s: any) => s.layoutConfig?.authorizationSuccessor,
);
if (!surface) throw Error("SUCCESSOR_MARKER_MISSING");
surface.surfaceKey = "bp_canonical_read_v2";
surface.title = "Business Partner canonical read admission v2";
surface.description =
  "Exact target read grants with preserved source constraints; existing Atlas and governed operations retained.";
surface.layoutConfig.authorizationRuntime = descriptor.authorizationRuntime;
surface.layoutConfig.baselineImport.descriptorHash = hash(descriptor);
surface.layoutConfig.authorizationSuccessor = {
  ...surface.layoutConfig.authorizationSuccessor,
  combinedDescriptorHash: hash(descriptor),
  authorizationSelectionSha256: accept.proposalRevision,
};
graph.tests = [
  {
    key: "v2_runtime_exact",
    assertion: "path_equals",
    path: "surfaces.0.layoutConfig.authorizationRuntime",
    expected: descriptor.authorizationRuntime,
  },
  {
    key: "atlas_preserved",
    assertion: "path_equals",
    path: "surfaces.0.layoutConfig.ai",
    expected: descriptor.ai,
  },
];
const validation = validateGraph(graph);
if (validation.issues.length) throw Error(JSON.stringify(validation.issues));
const compiled = compileGraph(graph);
compileAuthorizationSuccessorDescriptor({
  nativeDescriptor: compiled.descriptor,
  predecessor: {
    releaseId: source.publication_release_id,
    releaseNo: Number(source.release_no),
    publicationKey: source.release_key,
    descriptor: source.descriptor,
    authoredContract: source.authored_contract,
  },
  proposedDescriptor: descriptor,
});
const result = {
  schemaVersion: 1,
  kind: "bp_canonical_v2_native_proposal",
  designRevision: accept.proposalRevision,
  predecessor: surface.layoutConfig.authorizationSuccessor.predecessor,
  preservedRelease19ArtifactHash: p.sourceArtifactHash,
  descriptor,
  descriptorHash: hash(descriptor),
  nativeGraphHash: hash(graph),
  nativeCompilerContractHash: compiled.contractHash,
  nativeDraftDescriptorHash: compiled.descriptorHash,
  grantChanges: [],
  approvalRecorded: false,
  signed: false,
  publicationEligible: false,
  activationAuthorized: false,
};
const output =
    "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
  g =
    "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json";
if (existsSync(output) || existsSync(g))
  throw Error("PRESERVE_EXISTING_PROPOSAL");
writeFileSync(
  output,
  JSON.stringify({ ...result, proposalRevision: hash(result) }, null, 2) + "\n",
);
writeFileSync(g, JSON.stringify(graph, null, 2) + "\n");
console.log({
  proposalRevision: hash(result),
  nativeCompilation: true,
  operations: graph.operations.length,
  signed: false,
});
