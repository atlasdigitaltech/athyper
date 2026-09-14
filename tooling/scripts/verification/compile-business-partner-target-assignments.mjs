// Read-only evidence refresh. Compiles only responsibilities already reviewed; no grant/apply mode.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  hash,
  assessNamedRoleReview,
} from "./entity-authorization/named-role-review.mjs";
import { compareApprovedGrants } from "./entity-authorization/activation-readiness.mjs";
import { compileTargetAssignments } from "./entity-authorization/compile-target-assignments.mjs";
if (process.argv.length !== 2)
  throw Error("No activation or mutation flags supported");
const read = (p) => JSON.parse(readFileSync(p));
const baselinePath =
  "governance/policy/reports/business-partner-role-review.named.dev.json";
const packet = read(
    "governance/policy/reviews/business-partner-two-reviewer-recorded.dev.json",
  ),
  baseline = read(baselinePath);
const sourceSha256 = hash(readFileSync(baselinePath));
if (
  !assessNamedRoleReview(baseline, packet, sourceSha256).namedRoleReviewComplete
)
  throw Error("Reviewed proposals are not current and complete");
const currentPath =
  "governance/policy/reports/business-partner-target-assignment-current.dev.json";
execFileSync(
  "node",
  [
    "tooling/scripts/verification/review-business-partner-roles.mjs",
    "dev",
    currentPath,
  ],
  { stdio: "pipe" },
);
const current = read(currentPath),
  drift = compareApprovedGrants({
    approvedInventory: baseline,
    packet,
    sourceSha256,
    current,
  });
const result = compileTargetAssignments({
  packet,
  current,
  now: new Date().toISOString(),
});
result.drift = {
  inventoryUnchanged: drift.inventoryUnchanged,
  changedTables: drift.changedTables,
  changedMemberships: drift.summary.changedMemberships,
  disposition:
    "No snapshot restoration. Changed table hashes require separate live execution qualification; they do not identify individual row changes.",
};
const path =
  "governance/policy/reports/business-partner-target-assignments.compiled.dev.json";
writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify({
    path,
    compiledRows: result.compiledRows,
    blockedRows: result.blockedRows,
    grantMutations: 0,
    drift: result.drift,
  }),
);
