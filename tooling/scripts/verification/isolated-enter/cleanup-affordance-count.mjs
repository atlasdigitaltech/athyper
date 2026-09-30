import { run, proposalPrefix } from "./affordance-count-run.mjs";
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import {
  docker,
  sql,
  quote,
  fingerprint,
  proposal,
} from "./affordance-count-client.mjs";
const amendment = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-protected-reference-amendment-20260912.proposal.dev.json",
  ),
);
const revocation = JSON.parse(
  fs.readFileSync(
    `governance/policy/reports/business-partner-affordance-count-revocation-${run}.dev.json`,
  ),
);
assert(revocation.revoked && revocation.postRevocationPassed);
const before = fingerprint();
const count = Number(
  sql(
    `SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(proposal.proposalRevision)} AND status='active';`,
  ),
);
assert.equal(count, 0);
const removed = [],
  all = docker(["ps", "-a", "--format", "{{.Names}}"]).trim().split("\n");
for (const name of all.filter(
  (n) =>
    /^athyper-bp-enter-(api|worker|neon-ui)-before-/.test(n) ||
    [
      "athyper-bp-affordance-count-canary",
      "athyper-bp-affordance-ui-canary",
      "athyper-bp-summary-context-canary",
      "athyper-bp-summary-context-ui-canary",
      "athyper-bp-reveal-coordinates-canary",
      "athyper-bp-reveal-coordinates-ui-canary",
    ].includes(n),
)) {
  const c = JSON.parse(docker(["inspect", name]))[0];
  if (name.includes("-before-")) assert.equal(c.State.Running, false);
  else docker(["stop", name]);
  removed.push({
    name,
    id: c.Id,
    image: c.Image,
    priorState: c.State.Status,
    bindMountsRetained: c.Mounts.filter((m) => m.Type === "bind").map(
      (m) => m.Source,
    ),
  });
  docker(["rm", name]);
}
const relay = "athyper-bp-protected-secret-relay",
  old = JSON.parse(docker(["inspect", relay]))[0];
assert.equal(old.State.Health.status ?? old.State.Health.Status, "healthy");
const relayId = old.Id;
const queue = Object.fromEntries(
  [
    ["waiting", "LLEN", "wait"],
    ["active", "LLEN", "active"],
    ["delayed", "ZCARD", "delayed"],
    ["completed", "ZCARD", "completed"],
    ["failed", "ZCARD", "failed"],
  ].map(([label, command, suffix]) => [
    label,
    Number(
      docker([
        "exec",
        "athyper-bp-enter-redis",
        "redis-cli",
        "-n",
        "1",
        command,
        "bull:publication.authority:" + suffix,
      ]),
    ),
  ]),
);
assert.equal(queue.waiting + queue.active + queue.delayed, 0);
assert.deepEqual(fingerprint(), before);
const inventory = JSON.parse(
  sql(
    `SELECT jsonb_build_object('cases',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',case_code,'entity',entity_code,'status',status,'ownerCompany',owner_company_code_id,'currentSnapshot',current_snapshot_id,'resultSnapshot',result_snapshot_id) ORDER BY id) FROM document.entity_case WHERE tenant_id=${quote(proposal.tenantId)}::uuid),'caseCommandHistoryCount',(SELECT count(*) FROM document.entity_case_command_evidence WHERE tenant_id=${quote(proposal.tenantId)}::uuid),'draftJournals',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',journal_number,'status',status,'date',document_date,'lineCount',line_count) ORDER BY id) FROM document.journal_entry WHERE id IN('b19c9b40-398c-4b73-a5c4-e2d13f541511','b19c9b40-398c-4b73-a5c4-e2d13f541512','b19c9b40-398c-4b73-a5c4-e2d13f541513')),'journalLines',(SELECT count(*) FROM document.journal_line WHERE journal_entry_id IN('b19c9b40-398c-4b73-a5c4-e2d13f541511','b19c9b40-398c-4b73-a5c4-e2d13f541512','b19c9b40-398c-4b73-a5c4-e2d13f541513')),'revealAuditCounts',(SELECT jsonb_object_agg(event_code,n) FROM(SELECT event_code,count(*) n FROM audit.audit_log WHERE tenant_id=${quote(proposal.tenantId)}::uuid AND event_code IN('business_partner.bank_account.revealed','business_partner.tax_registration.revealed') GROUP BY event_code)s));`,
  ),
);
const processes = cp
  .execFileSync("ps", ["-eo", "pid,args"], { encoding: "utf8" })
  .split("\n")
  .filter((line) =>
    /^\s*\d+ node tooling\/scripts\/verification\/isolated-enter\/expire-affordance-count-access\.mjs$/.test(
      line,
    ),
  );
for (const line of processes)
  process.kill(Number(line.trim().split(/\s+/)[0]), "SIGTERM");
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: proposal.runtimeImage,
  uiImage: proposal.uiImage,
  releaseSetHash: proposal.releaseSetHash,
  removed,
  imagesAndBindMountedArtifactsRetained: true,
  relay: {
    name: relay,
    id: relayId,
    image: old.Image,
    retainedRuntimeDependency: true,
    healthVerified: true,
    healthCheck: "TCP 8443 instead of inherited host-port check",
  },
  queue,
  queueHistoryRetained: true,
  inventory,
  retainedFixtureSources: [
    proposalPrefix + ".proposal.dev.json",
    "tooling/scripts/verification/isolated-enter/finance-activity-final-fixture.sql",
    "tooling/scripts/verification/isolated-enter/create-protected-bank-fixture-20260912.sql",
  ],
  retainedSecret: {
    logicalReference: amendment.secret.reference,
    physicalKey: amendment.secret.physicalSecretName,
    projectId: amendment.secret.workspaceId,
    environment: "dev",
    synthetic: true,
    version: 1,
  },
  retainedDatabaseChanges: [
    "Finance activity permission catalog",
    "two-event reveal audit contract",
    "protected-bank display-suffix normalization",
  ],
  stagedQualificationPassed: revocation.stagedPassed,
  activeTemporaryAssignments: 0,
  expiryWatchStoppedAfterEarlyRevocation: processes.length,
  authorityAndActivationUnchanged: true,
  approvalAndCommandHistoryDeleted: false,
  sharedApplicationAccessChanged: false,
};
fs.writeFileSync(
  `governance/policy/reports/business-partner-affordance-count-cleanup-${run}.dev.json`,
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  removed: removed.length,
  queue,
  inventory,
  activeTemporaryAssignments: 0,
});
