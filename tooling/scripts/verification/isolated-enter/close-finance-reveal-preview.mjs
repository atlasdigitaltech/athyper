import fs from "node:fs";
import assert from "node:assert/strict";
import { docker, fingerprint, sql } from "./neon-final-client.mjs";
const p = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
  ),
);
const before = fingerprint();
const active = JSON.parse(
  docker(["inspect", "athyper-bp-enter-api", "athyper-bp-enter-worker"]),
);
assert(
  active.every((c) => c.Image === p.previousRuntimeImage && c.State.Running),
);
const canary = "athyper-bp-finance-reveal-v2-canary";
assert.equal(JSON.parse(docker(["inspect", canary]))[0].Image, p.runtimeImage);
const checks = JSON.parse(
  docker([
    "exec",
    canary,
    "node",
    "--input-type=module",
    "-e",
    `const paths=['/health','/api/neon/business-partners/01a092d1-8242-7948-9ce9-6f19c38c4b27/360/business-activity'];console.log(JSON.stringify(await Promise.all(paths.map(async path=>{const r=await fetch('http://127.0.0.1:4000'+path);return{path,status:r.status,releaseSet:r.headers.get('x-execution-release-set')}}))))`,
  ]),
);
assert.equal(checks[0].status, 200);
assert.equal(checks[1].status, 401);
assert.equal(checks[1].releaseSet, p.releaseSetHash);
const removed = [];
for (const name of ["athyper-bp-finance-reveal-canary", canary]) {
  docker(["stop", name]);
  docker(["rm", name]);
  removed.push(name);
}
assert.deepEqual(fingerprint(), before);
const persisted = JSON.parse(
  sql(
    `SELECT jsonb_build_object('proposalMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref='${p.proposalRevision}'),'financePermission',(SELECT count(*) FROM authz.permission WHERE canonical_code='finance.ledger.business_partner_activity.read'),'draftFixtures',(SELECT count(*) FROM document.journal_entry WHERE id IN ('b19c9b40-398c-4b73-a5c4-e2d13f541511','b19c9b40-398c-4b73-a5c4-e2d13f541512','b19c9b40-398c-4b73-a5c4-e2d13f541513')));`,
  ),
);
assert(Object.values(persisted).every((v) => v === 0));
const report = {
  capturedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  candidateImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  checks,
  removed,
  persisted,
  activeRuntimeUnchanged: true,
  authorityAndActivationUnchanged: true,
  grantsApplied: false,
  authenticatedQualification: false,
  dispositionAcceptance: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-finance-reveal-preview-closure-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(report);
