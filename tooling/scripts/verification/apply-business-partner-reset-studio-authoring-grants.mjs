import fs from "node:fs";
import cp from "node:child_process";
import { buildStudioAuthoringGrantSql } from "./entity-authorization/studio-authoring-grants.mjs";
const mode = process.argv[2] ?? "--dry-run";
if (
  !["--dry-run", "--apply", "--revoke"].includes(mode) ||
  process.argv.length > 3
)
  throw Error("Use --dry-run, --apply or --revoke");
const read = (p) => JSON.parse(fs.readFileSync(p));
const p = read(
    "governance/policy/reviews/business-partner-reset-studio-authoring-grants.proposal.dev.json",
  ),
  a = read(
    "governance/policy/reviews/business-partner-reset-studio-authoring-grants.acceptance.dev.json",
  );
const root =
  "governance/policy/reports/business-partner-reset-studio-authoring-grants.";
if (mode === "--apply") {
  const recovery = read(root + "revocation-rehearsal.dev.json");
  if (
    recovery.proposalRevision !== p.proposalRevision ||
    !recovery.rolledBack ||
    !recovery.repeatedRevocationVerified ||
    recovery.grantsChanged !== false
  )
    throw Error("Exact revocation rehearsal required");
  const d = read(root + "dry-run.dev.json");
  if (
    d.proposalRevision !== p.proposalRevision ||
    d.rolledBack !== true ||
    d.assignments !== 2 ||
    d.rolePermissions !== 6
  )
    throw Error("Exact successful grant rehearsal required");
  if (fs.existsSync(root + "applied.dev.json"))
    throw Error("Inspect durable state; do not replay applied grants");
}
const sql = buildStudioAuthoringGrantSql(p, a, {
  commit: mode !== "--dry-run",
  revoke: mode === "--revoke",
});
try {
  const out = cp.execFileSync(
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
      "athyper_studio",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const end = mode === "--dry-run" ? "ROLLBACK" : "COMMIT";
  if (!out.trim().endsWith(end)) throw Error("Transaction result unconfirmed");
  const counts = JSON.parse(out.split("\n").find((s) => s.startsWith("{")));
  const report = {
    schemaVersion: 1,
    kind: "bp_v2_studio_authoring_grants",
    recordedAt: new Date().toISOString(),
    ...counts,
    mode,
    rolledBack: mode === "--dry-run",
    applied: mode === "--apply",
    revoked: mode === "--revoke",
    effectiveFrom: p.effectiveFrom,
    effectiveUntil: p.effectiveUntil,
    bpGrantsChanged: false,
    enforcementChanged: false,
  };
  fs.writeFileSync(
    root +
      (mode === "--dry-run"
        ? "dry-run"
        : mode === "--apply"
          ? "applied"
          : "revoked") +
      ".dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} catch (e) {
  console.error(String(e.stderr ?? e.message).slice(0, 1800));
  process.exitCode = 1;
}
