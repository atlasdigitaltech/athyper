/** Grant then revoke only the proposed bindings in one transaction, always rolled back. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  buildTargetReadGrantSql,
  buildTargetReadRevokeSql,
} from "./entity-authorization/target-read-grants.mjs";
if (process.argv.length !== 2)
  throw Error("Rehearsal only; no apply supported");
const bytes = readFileSync(
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
  ),
  p = JSON.parse(bytes),
  a = JSON.parse(
    readFileSync(
      "governance/policy/reviews/business-partner-target-read-grants.approval.dev.json",
    ),
  );
if (
  a.proposalSha256 !== createHash("sha256").update(bytes).digest("hex") ||
  a.proposalRevision !== p.proposalRevision ||
  a.grantChangesAuthorized !== true ||
  a.activationAuthorized !== false
)
  throw Error("Exact approved proposal required");
const grant = buildTargetReadGrantSql(p);
if (!grant.endsWith("ROLLBACK;\n")) throw Error("Rollback boundary missing");
// Check preservation again after revocation, against the same pre-grant snapshot.
const preserve = grant.slice(
  grant.indexOf("DO $preserve$"),
  grant.indexOf("SELECT jsonb_build_object"),
);
const sql =
  grant.slice(0, -"ROLLBACK;\n".length) +
  buildTargetReadRevokeSql(p) +
  buildTargetReadRevokeSql(p) +
  preserve +
  "ROLLBACK;\n";
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
if (!out.trim().endsWith("ROLLBACK")) throw Error("Rollback unconfirmed");
const counts = out
  .split("\n")
  .filter((x) => x.startsWith("{"))
  .map((x) => JSON.parse(x));
if (
  counts.length !== 3 ||
  counts[0].rolePermissions !== 17 ||
  counts[0].members !== 2 ||
  counts
    .slice(1)
    .some((x) => x.membershipsRevoked !== 2 || x.assignmentsRevoked !== 1)
)
  throw Error("Rollback coverage incomplete");
const report = {
  schemaVersion: 1,
  kind: "bp_target_read_rollback_rehearsal",
  capturedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  membershipsRevoked: 2,
  assignmentsRevoked: 1,
  repeatedRevocationVerified: true,
  existingAuthorityPreserved: true,
  rollbackConfirmed: true,
  grantsChanged: false,
  activationChanged: false,
};
writeFileSync(
  "governance/policy/reports/business-partner-target-read-grants.rollback-rehearsal.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
