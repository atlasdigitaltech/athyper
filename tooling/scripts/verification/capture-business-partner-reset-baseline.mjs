import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./isolated-release20/authority-check.mjs";

// Read-only capture. Never reconstruct heads, assignments or review receipts.
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const query = (database, sql) =>
  JSON.parse(
    docker([
      "exec",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ]),
  );
const studioAuthority = () => {
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
  ];
  const sql = tables
    .map(
      (t) =>
        `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
    )
    .join(" UNION ALL ");
  return createHash("sha256")
    .update(
      docker([
        "exec",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_studio",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ]),
    )
    .digest("hex");
};
const before = assertAuthorityUnchanged();
const studioBefore = studioAuthority();
const inventory = {};
for (const plane of ["neon", "studio"]) {
  inventory[plane] = query(
    `athyper_${plane}`,
    `SELECT jsonb_build_object(
    'permissionDefinitions',(SELECT count(*) FROM authz.permission),
    'roles',(SELECT count(*) FROM authz.role),
    'targetBpDefinitions',(SELECT count(*) FROM authz.permission WHERE canonical_code LIKE '%bp_target.%'),
    'studioAuthoringDefinitions',(SELECT coalesce(jsonb_agg(canonical_code ORDER BY canonical_code),'[]') FROM authz.permission WHERE canonical_code IN ('metadata.entity.author','metadata.entity.validate','metadata.entity.test','metadata.entity.submit','metadata.entity.review','metadata.entity.publish')),
    'namedPrincipals',(SELECT coalesce(jsonb_agg(jsonb_build_object('account',code,'id',id,'status',status) ORDER BY code),'[]') FROM master.principal WHERE code IN ('catl.admin','catl.owner')),
    'bpHeads',(SELECT count(*) FROM runtime_meta.release_activation_head WHERE publication_key LIKE '%business_partner%'),
    'bpContracts',(SELECT count(*) FROM runtime_meta.entity_contract WHERE entity_code LIKE '%business_partner%'),
    'bpRecords',${plane === "neon" ? "(SELECT count(*) FROM master.business_partner)" : "NULL"},
    'cases',(SELECT count(*) FROM document.entity_case))`,
  );
}
const containers = JSON.parse(
  docker(["inspect", "athyper-dev-api-1", "athyper-dev-worker-1"]),
).map((c) => ({
  name: c.Name,
  image: c.Image,
  state: c.State.Status,
  health: c.State.Health?.Status,
  bpAuthorizationMode: c.Config.Env.find((v) =>
    v.startsWith("BP_AUTHORIZATION_MODE="),
  )?.split("=")[1],
}));
assert.ok(
  containers.every((c) => c.state === "running" && c.health === "healthy"),
);
const authProbe = JSON.parse(
  docker([
    "exec",
    "athyper-dev-api-1",
    "node",
    "-e",
    "fetch('http://127.0.0.1:4000/api/entity-runtime/business_partner/list-descriptor',{redirect:'manual'}).then(async r=>console.log(JSON.stringify({status:r.status,code:(await r.json()).code}))).catch(()=>process.exit(1))",
  ]),
);
assert.equal(authProbe.status, 401);
assert.equal(authProbe.code, "AUTH_TOKEN_REQUIRED");
const after = assertAuthorityUnchanged();
assert.equal(
  after.sha256,
  before.sha256,
  "Authority changed during baseline capture",
);
assert.equal(
  studioAuthority(),
  studioBefore,
  "Studio authority changed during baseline capture",
);
const baseline = {
  inventory,
  containers,
  authoritySha256: after.sha256,
  studioAuthoritySha256: studioBefore,
};
const report = {
  schemaVersion: 1,
  kind: "bp_intentional_reset_baseline",
  capturedAt: new Date().toISOString(),
  resetConfirmedByUser: true,
  ...baseline,
  baselineSha256: createHash("sha256")
    .update(JSON.stringify(baseline))
    .digest("hex"),
  authProbe,
  readOnly: true,
  authorityUnchanged: true,
  historicalReleaseEvidencePreserved: true,
  historicalEvidenceQualifiesCurrentState: false,
  qualifiedForActivation: false,
  phaseClosed: false,
  requiredSuccessors: [
    "Review and install missing Studio and BP catalog definitions without automatic grants",
    "Approve fresh named assignments with current validity windows; never reactivate revoked assignments",
    "Author and independently review a native BP successor including source constraints and company pilot",
    "Sign compatible runtime artifacts and deploy isolated API/worker on current storage configuration",
    "Recapture ownership, fields, commands, Atlas and compatible recovery against that exact release",
    "Reconcile all 66 historical dispositions with new evidence and obtain explicit acceptance",
  ],
};
const path =
  "governance/policy/reports/business-partner-intentional-reset-baseline.dev.json";
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
