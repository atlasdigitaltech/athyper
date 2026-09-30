import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const read = (p) => JSON.parse(fs.readFileSync(p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (p, value) =>
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const prior = read(
  "governance/policy/reports/business-partner-company-correction-candidate-v2-20260912.dev.json",
);
const build = read(
  os.homedir() +
    "/.athyper/qualification/bp/child-candidate-image-20260912.json",
);
const fixturesPath =
  "governance/policy/reports/business-partner-populated-final-fixtures-20260912.dev.json";
const fixtures = read(fixturesPath);
if (!fixtures.objectsWritten || build.base !== prior.runtimeImage)
  throw Error("CANDIDATE_PREREQUISITES_CHANGED");
const releaseSetHash = sha(
  JSON.stringify({ runtimeImage: build.image, artifacts: prior.artifacts }),
);
fs.cpSync(
  root + "/company-correction-only-harness",
  root + "/neon-final-harness",
  { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false },
);
const boundary = root + "/neon-final-harness/release-boundary.mjs";
if (!fs.readFileSync(boundary, "utf8").includes(prior.releaseSetHash))
  throw Error("BOUNDARY_CHANGED");
fs.writeFileSync(
  boundary,
  fs
    .readFileSync(boundary, "utf8")
    .replace(prior.releaseSetHash, releaseSetHash),
);
const config = read(root + "/company-correction-only-deployment.json");
config.runtimeImage = build.image;
fs.writeFileSync(root + "/neon-final-deployment.json", JSON.stringify(config), {
  mode: 0o600,
  flag: "wx",
});
const manifestPath =
  "governance/policy/reports/business-partner-neon-final-candidate-20260912.dev.json";
const manifest = {
  ...prior,
  createdAt: new Date().toISOString(),
  runtimeImage: build.image,
  releaseSetHash,
  status: "local-candidate-not-deployed-or-qualified",
  reason: build.reason,
  scope: "NEON only",
  additionalMigrations: [
    "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260912_company_pilot_approver_visibility.sql",
  ].map((path) => ({ path, sha256: sha(fs.readFileSync(path)) })),
  harness: fs
    .readdirSync(root + "/neon-final-harness")
    .filter((n) => fs.statSync(root + "/neon-final-harness/" + n).isFile())
    .map((name) => ({
      name,
      sha256: sha(fs.readFileSync(root + "/neon-final-harness/" + name)),
    })),
};
write(manifestPath, manifest);
write(
  "governance/policy/reports/business-partner-neon-child-image-20260912.dev.json",
  build,
);

const inventory = read(
  "governance/policy/reports/business-partner-final-access-inventory-20260912.dev.json",
).captures.find(
  (x) => x.container === "athyper-bp-enter-db" && x.plane === "neon",
);
const scope = (kind) =>
  inventory.scopeTargets.find(
    (s) => s.scope_kind === kind && s.status === "active",
  );
const tenantScope = scope("tenant");
const scopeRegistrations = ["comments", "attachments"].map((kind, index) => ({
  id: randomUUID(),
  scope_kind: "resource",
  scope_key:
    (index ? "document.attachment:" : "document.comment:") +
    fixtures.ids[kind][0],
  target_id: fixtures.ids[kind][0],
  parent_scope_target_id: tenantScope.id,
  display_name: "Synthetic independently authorized " + kind,
  status: "active",
}));
const batch = (account, purpose, selectedScope, propagation, codes) => ({
  account,
  principalId: inventory.principals.find(
    (p) => p.code === account && p.status === "active",
  ).id,
  purpose,
  roleId: randomUUID(),
  groupId: randomUUID(),
  assignmentId: randomUUID(),
  code: "bp.neon.final." + account.split(".")[1] + "." + purpose,
  scope: selectedScope,
  propagation,
  permissions: codes.map((code) => {
    const p = inventory.catalog.find(
      (p) => p.code === code && p.status === "published",
    );
    if (
      !p?.scopes.some(
        (s) =>
          s.scopeKind === selectedScope.scope_kind &&
          s.propagation === propagation &&
          s.status === "active",
      )
    )
      throw Error("CATALOG_CHANGED:" + code);
    return p;
  }),
});
const target = "neon.relationship.bp_target.";
const reads = [
  "discover",
  "enter",
  "read",
  "navigate_manage",
  "navigate_overview",
  "identity_read",
  "contacts_read",
  "addresses_read",
  "identifier_read",
  "tax_read",
  "bank_read",
  "certificate_read",
  "qualification_read",
  "comments_read",
  "attachments_read",
  "requests_read",
  "activity_read",
].map((k) => target + k);
const batches = ["catl.admin", "catl.owner"].flatMap((account) => [
  batch(account, "reads", tenantScope, "exact", reads),
  batch(
    account,
    "company-reads",
    scope("company_code"),
    "exact",
    ["supplier_company_read", "customer_company_read", "credit_read"].map(
      (k) => target + k,
    ),
  ),
  batch(account, "case-read", scope("operating_organization"), "subtree", [
    "neon.relationship.entity_case.read",
  ]),
]);
batches.push(
  batch(
    "catl.admin",
    "reveals",
    tenantScope,
    "exact",
    ["bank_reveal", "tax_reveal"].map((k) => target + k),
  ),
  batch("catl.admin", "atlas", tenantScope, "exact", ["neon.ai.agent.use"]),
  batch("catl.owner", "comment", scopeRegistrations[0], "exact", [
    "collaboration.comment.read",
  ]),
  batch("catl.owner", "attachment", scopeRegistrations[1], "exact", [
    "document.attachment.read",
  ]),
);
const p = {
  schemaVersion: 1,
  kind: "isolated_neon_final_qualification",
  approved: false,
  applied: false,
  tenantId: fixtures.tenant,
  releaseId: "c2cc6900-26c1-47ca-8dfc-1d488000950c",
  artifactHash:
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
  previousRuntimeImage: prior.runtimeImage,
  runtimeImage: build.image,
  releaseSetHash,
  artifacts: prior.artifacts,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  fixtures: { path: fixturesPath, sha256: sha(fs.readFileSync(fixturesPath)) },
  destination: {
    container: "athyper-bp-enter-db",
    database: "athyper_neon",
    network: "athyper-bp-enter-isolated",
  },
  effectiveFrom: "2026-09-12T05:00:00.000Z",
  effectiveUntil: "2026-09-12T07:00:00.000Z",
  scopeRegistrations,
  batches,
  permissionAssignments: batches.reduce((n, b) => n + b.permissions.length, 0),
  conditions: {
    sessions:
      "Normal authenticated actor sessions; retain MFA flags and existing denials.",
    scope:
      "Tenant BP reads/reveals and Atlas admission apply across this isolated tenant. Company reads cover CirrusAtlantic UK exactly. Case read covers the selected operating organization and descendants, including generic governed cases.",
    independentChildren:
      "Only owner receives exact access to the first synthetic comment and attachment; neither actor receives access to their siblings. Parent permission alone must not expose any child.",
    testDiscipline:
      "Use inventoried synthetic fixtures. Fixture restriction is operator discipline, not a tenant-read policy boundary.",
    cleanup:
      "Revoke only these new memberships/assignments immediately after qualification, at the latest at the fixed expiry. Preserve all previously revoked and expired access.",
  },
  qualification: [
    "Populated masking and separately admitted reveals",
    "Independent children and ungranted siblings",
    "Nested company providers and SQL-filtered case rows/counts",
    "Scoped Atlas retrieval followed by revocation",
    "Compatible candidate runtime recovery preserving revocation",
  ],
  knownOpenEngineering: [
    "Positive business-activity summaries: deployed production host has no configured owning-module summary reader. Case activity is separate evidence.",
  ],
  excluded: [
    "Mesh",
    "Shared DEV changes",
    "Enforcement approval or activation",
    "Compatibility retirement",
    "66-disposition acceptance",
    "Full Atlas conversations",
    "Global/legal-entity ownership",
    "Cross-instance revocation synchronization",
    "Renewal of old grants",
    "Company lifecycle command grants",
  ],
  artifactChanges: false,
  activationAuthorized: false,
};
p.proposalRevision = sha(JSON.stringify(p));
write(
  "governance/policy/reviews/business-partner-neon-final-execution-20260912.proposal.dev.json",
  p,
);

const docker = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const current = JSON.parse(docker(["inspect", "athyper-bp-enter-api"]))[0];
if (current.Image !== prior.runtimeImage) throw Error("ACTIVE_IMAGE_CHANGED");
const mounts = current.Mounts.flatMap((m) => [
  "--mount",
  "type=bind,src=" +
    (m.Destination === "/app/server/qualification"
      ? root + "/neon-final-harness"
      : m.Destination === "/release/deployment.json"
        ? root + "/neon-final-deployment.json"
        : m.Source) +
    ",dst=" +
    m.Destination +
    (m.RW ? "" : ",readonly"),
]);
docker([
  "run",
  "-d",
  "--name",
  "athyper-bp-neon-final-canary",
  "--network",
  p.destination.network,
  "--env-file",
  root + "/runtime.env",
  "-e",
  "MODE=api",
  ...mounts,
  "--entrypoint",
  "node",
  "--no-healthcheck",
  build.image,
  "/app/server/qualification/host.mjs",
]);
console.log({
  proposalRevision: p.proposalRevision,
  runtimeImage: p.runtimeImage,
  releaseSetHash,
  permissionAssignments: p.permissionAssignments,
  batches: batches.length,
  grantsApplied: false,
});
