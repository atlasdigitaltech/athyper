/** Bounded process rollback qualification with the active release-18 metadata unchanged. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
const root = readFileSync("/tmp/bp-v2-compiler-root", "utf8"),
  baseline = JSON.parse(readFileSync(root + "/baseline.json", "utf8"));
const run = (args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
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
const fingerprint = (db: string) =>
  run([
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    db,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    tables
      .map(
        (t) =>
          `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) FROM authz.${t} t`,
      )
      .join(" UNION ALL "),
  ]).trim();
const before = {
  studio: fingerprint("athyper_studio"),
  neon: fingerprint("athyper_neon"),
};
const checks: any[] = [];
const client = await request.newContext({
  baseURL: "https://neon.dev.athyper.test",
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
});
const check = async (stage: string) => {
  const response = await client.get(
    "/api/relay/neon/business-partners/f7688c3d-8c92-5651-a469-da3f4f786375/360/summary?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
  );
  const body = await response.json();
  if (
    response.status() !== 200 ||
    body.identity?.id !== "f7688c3d-8c92-5651-a469-da3f4f786375"
  )
    throw Error("Authenticated BP read failed:" + stage);
  checks.push({
    stage,
    status: response.status(),
    recordIdentityMatched: true,
  });
};
const deploy = (mode: string) =>
  execFileSync(
    "node",
    [
      "tooling/scripts/verification/deploy-business-partner-v2-compiler.mjs",
      mode,
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
let restored = false,
  failed: string | undefined;
try {
  await check("candidate_before");
  console.log({ stage: "rollback_start" });
  deploy("--rollback");
  await check("saved_process_configuration");
  if (
    fingerprint("athyper_studio") !== before.studio ||
    fingerprint("athyper_neon") !== before.neon
  )
    throw Error("Authority changed during recovery");
  console.log({ stage: "restore_candidate" });
  deploy("--stage");
  restored = true;
  await check("candidate_restored");
  if (
    fingerprint("athyper_studio") !== before.studio ||
    fingerprint("athyper_neon") !== before.neon
  )
    throw Error("Authority changed after candidate restoration");
} catch (e) {
  failed = e instanceof Error ? e.message : "recovery_failed";
} finally {
  if (!restored) {
    try {
      deploy("--stage");
      restored = true;
    } catch {
      failed =
        "Candidate restoration failed; inspect saved process configuration";
    }
  }
  await client.dispose();
}
const report = {
  schemaVersion: 1,
  kind: "bp_v2_compiler_process_recovery",
  recordedAt: new Date().toISOString(),
  candidateImage: baseline.image,
  previousImages: baseline.containers,
  checks,
  authorityFingerprints: before,
  authorityUnchanged: !failed,
  candidateRestored: restored,
  qualified: !failed,
  scope:
    "Process configuration recovery and authenticated BP summary under active release 18; signed release-19 shadow artifact retained",
  signedV2ExecutionRecoveryQualified: false,
  releaseHeadChanged: false,
  grantMutations: [],
  ...(failed ? { failure: failed } : {}),
};
writeFileSync(
  "governance/policy/reports/business-partner-v2-process-recovery.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  qualified: report.qualified,
  candidateRestored: restored,
  signedV2ExecutionRecoveryQualified: false,
});
if (failed) process.exitCode = 1;
