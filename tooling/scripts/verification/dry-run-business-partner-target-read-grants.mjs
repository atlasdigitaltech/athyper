import { buildTargetReadGrantSql } from "./entity-authorization/target-read-grants.mjs";
/** Exact named read-grant rehearsal; transaction always rolls back. No apply switch. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
if (process.argv.length !== 2) throw Error("No apply supported");
const p = JSON.parse(
    readFileSync(
      "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
    ),
  ),
  { proposalRevision, ...body } = p;
if (
  createHash("sha256").update(JSON.stringify(body)).digest("hex") !==
    proposalRevision ||
  p.kind !== "bp_release_19_named_tenant_read_grant_proposal" ||
  p.environment !== "dev" ||
  p.approvals.length ||
  p.assignment.scopeKind !== "tenant" ||
  p.assignment.propagationMode !== "exact" ||
  p.group.members.length !== 2 ||
  p.role.permissions.length !== 17
)
  throw Error("Proposal mismatch");
const sql = buildTargetReadGrantSql(p);
const output = execFileSync(
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
if (!output.trim().endsWith("ROLLBACK")) throw Error("Rollback unconfirmed");
const counts = JSON.parse(output.split("\n").find((x) => x.startsWith("{")));
if (counts.rolePermissions !== 17 || counts.members !== 2)
  throw Error("Unexpected rehearsal counts");
const report = {
  schemaVersion: 1,
  kind: "bp_target_named_read_grant_dry_run",
  capturedAt: new Date().toISOString(),
  ...counts,
  rollbackConfirmed: true,
  grantsChanged: false,
  approvalRecordedByRehearsal: false,
  activationReady: false,
  limits: [
    "SQL constraints and catalog/admission checks only; not effective target execution qualification.",
  ],
};
writeFileSync(
  "governance/policy/reports/business-partner-target-read-grants.dry-run.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
