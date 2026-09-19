/** Apply the exact approved read grant only during its window. Never activates a release. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  assertTargetReadApproval,
  buildTargetReadGrantSql,
} from "./entity-authorization/target-read-grants.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--apply")
  throw Error("Explicit --apply required");
const read = (p) => JSON.parse(readFileSync(p)),
  proposalBytes = readFileSync(
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
  ),
  p = JSON.parse(proposalBytes);
const approval = read(
    "governance/policy/reviews/business-partner-target-read-grants.approval.dev.json",
  ),
  rehearsal = read(
    "governance/policy/reports/business-partner-target-read-grants.dry-run.dev.json",
  );
const now = new Date().toISOString();
try {
  assertTargetReadApproval({
    proposal: p,
    proposalBytes,
    approval,
    rehearsal,
    now,
  });
} catch (error) {
  writeFileSync(
    "governance/policy/reports/business-partner-target-read-grants.apply-readiness.dev.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        checkedAt: now,
        proposalRevision: p.proposalRevision,
        ready: false,
        reason: error.message,
        grantMutations: 0,
        activationChanged: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.error(error.message);
  process.exit(1);
}
const rollback = read(
  "governance/policy/reports/business-partner-target-read-grants.rollback-rehearsal.dev.json",
);
if (
  rollback.proposalRevision !== p.proposalRevision ||
  !rollback.rollbackConfirmed ||
  !rollback.repeatedRevocationVerified ||
  !rollback.existingAuthorityPreserved ||
  rollback.grantsChanged !== false
)
  throw Error("Exact rollback rehearsal required");
const runtime = read(
  "governance/policy/reports/business-partner-release-19-current-runtime-verification.dev.json",
);
for (const mode of ["api", "worker"]) {
  const verified = runtime.runtimes[mode];
  if (
    verified.artifactHash !== p.artifactHash ||
    !verified.verification.manifestValid ||
    !verified.verification.signatureVerified ||
    !verified.verification.runtimeCompatible
  )
    throw Error("Current release verification required");
  const c = JSON.parse(
    execFileSync("docker", ["inspect", `athyper-dev-${mode}-1`], {
      encoding: "utf8",
    }),
  )[0];
  if (
    c.Image !==
      runtime.deployment.containers.find(
        (x) => x.name === `/athyper-dev-${mode}-1`,
      )?.image ||
    c.State.Health?.Status !== "healthy"
  )
    throw Error("Qualified runtime changed");
}
const expectedHead =
  runtime.runtimes.api.head ?? runtime.runtimes.api.activeHead;
if (
  !Array.isArray(expectedHead) ||
  expectedHead.length !== 1 ||
  String(expectedHead[0].source_release_no) !== "18"
)
  throw Error("Reviewed release-18 baseline required");
const h = expectedHead[0],
  lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const headGuard = `DO $head$ BEGIN PERFORM 1 FROM runtime_meta.release_activation_head WHERE publication_key=${lit(h.publication_key)} AND applied_release_id=${lit(h.applied_release_id)}::uuid AND source_release_no=18 AND artifact_hash=${lit(h.artifact_hash)} AND row_version=${lit(h.row_version)}::bigint FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed activation head changed';END IF; END $head$;`;
const sql = buildTargetReadGrantSql(p, { commit: true }).replace(
  "CREATE TEMP TABLE prior_authority",
  headGuard + "\nCREATE TEMP TABLE prior_authority",
);
const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
if (!out.trim().endsWith("COMMIT"))
  throw Error("Grant transaction outcome unconfirmed; inspect before retrying");
const counts = JSON.parse(out.split("\n").find((x) => x.startsWith("{")));
const report = {
  schemaVersion: 1,
  kind: "approved_bp_target_read_grants_applied",
  appliedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  approvalReference: approval.reference,
  ...counts,
  effectiveFrom: p.effectiveFrom,
  effectiveUntil: p.effectiveUntil,
  existingAuthorityPreserved: true,
  activationChanged: false,
};
writeFileSync(
  "governance/policy/reports/business-partner-target-read-grants.applied.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
writeFileSync(
  "governance/policy/reports/business-partner-target-read-grants.apply-readiness.dev.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      checkedAt: report.appliedAt,
      proposalRevision: p.proposalRevision,
      ready: true,
      applied: true,
      reason: null,
      activationChanged: false,
      authenticatedTargetQualificationComplete: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report));
