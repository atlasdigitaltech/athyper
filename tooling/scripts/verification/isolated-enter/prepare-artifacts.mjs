import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import cp from "node:child_process";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-correction-runtime-verification.dev.json",
  ),
);
const exact = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-correction-exact-release.dev.json",
  ),
);
const bytes = fs.readFileSync(root + "/artifact.json");
if (createHash("sha256").update(bytes).digest("hex") !== proof.artifactHash)
  throw Error("Artifact mismatch");
const artifact = JSON.parse(bytes),
  m = artifact.manifest,
  d = artifact.envelope.payload.entityDescriptor;
const config = {
  schemaVersion: 1,
  tenantId: exact.coordinate.tenantId,
  publicationKey: m.publicationKey,
  artifactPath: "/release/artifact.json",
  artifactHash: proof.artifactHash,
  runtimeImage: proof.imageId,
  artifactReference: {
    artifactUri: "isolated://artifact",
    artifactHash: proof.artifactHash,
    targetPlane: "neon",
    publicationKey: m.publicationKey,
    sourceReleaseId: proof.releaseId,
    sourceReleaseNo: 1,
    signatureAlgorithm: m.signatureAlgorithm,
    signingKeyId: m.signingKeyId,
    signature: artifact.signature,
  },
  rollout: {
    schemaVersion: 1,
    mode: "shadow",
    release: {
      entityCode: "business_partner",
      planeKey: "neon",
      descriptorHash: d.compiledHash,
      profileHash: exact.coordinate.profileHash,
      bindingsHash: exact.coordinate.runtimeHash,
      runtimeVersion: "entity-authorization.v2",
    },
  },
};
fs.writeFileSync(
  root + "/deployment.json",
  JSON.stringify(config, null, 2) + "\n",
  { mode: 0o600, flag: "wx" },
);
fs.cpSync(
  "tooling/scripts/verification/isolated-enter/harness",
  root + "/harness",
  { recursive: true, errorOnExist: true, force: false },
);
const query = (table) =>
  `SELECT '${table}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${table} r`;
const tables = [
  "role",
  "role_permission",
  "group_member",
  "group_role",
  "plane_membership",
  "delegation",
  "delegation_grant",
  "permission",
  "permission_scope_kind",
  "deny_rule",
  "record_acl",
  "override",
  "scope_target",
  "principal_group",
]
  .map((t) => "authz." + t)
  .concat("runtime_meta.release_activation_head");
const fingerprints = {};
for (const plane of ["studio", "neon", "mesh"])
  fingerprints[plane] = cp
    .execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_" + plane,
      ],
      {
        input:
          "BEGIN READ ONLY;SELECT jsonb_object_agg(name,digest) FROM (" +
          tables.map(query).join(" UNION ALL ") +
          ") s;ROLLBACK;",
        encoding: "utf8",
      },
    )
    .trim();
fs.writeFileSync(
  "governance/policy/reports/business-partner-enter-isolated-shared-before.dev.json",
  JSON.stringify(
    { capturedAt: new Date().toISOString(), fingerprints },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  artifactPinned: true,
  configurationPrepared: true,
  sharedFingerprintsCaptured: true,
});
