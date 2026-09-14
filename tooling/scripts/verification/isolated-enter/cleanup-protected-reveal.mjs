import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import {
  docker,
  sql,
  quote,
  fingerprint,
  proposal,
  amendment,
} from "./protected-reveal-client.mjs";
const revocation = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-protected-reveal-revocation-20260912.dev.json",
  ),
);
assert(
  revocation.revoked &&
    revocation.stagedPassed &&
    revocation.postRevocationPassed,
);
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
    /^athyper-bp-enter-(api|worker)-before-/.test(n) ||
    [
      "athyper-bp-protected-reference-canary",
      "athyper-bp-protected-values-canary",
      "athyper-bp-studio-ui-before-consolidated",
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
// Replace the relay's inherited app-port health check with a TCP relay check.
const relay = "athyper-bp-protected-secret-relay",
  old = JSON.parse(docker(["inspect", relay]))[0];
assert.equal(old.Mounts.length, 0);
assert.deepEqual(
  Object.keys(old.NetworkSettings.Networks).sort(),
  ["athyper-bp-enter-isolated", "athyper-dev_app"].sort(),
);
docker(["stop", relay]);
docker(["rename", relay, relay + "-prior-healthcheck"]);
docker([
  "network",
  "disconnect",
  "athyper-bp-enter-isolated",
  relay + "-prior-healthcheck",
]);
docker([
  "network",
  "disconnect",
  "athyper-dev_app",
  relay + "-prior-healthcheck",
]);
let relayId;
try {
  relayId = docker([
    "run",
    "-d",
    "--name",
    relay,
    "--network",
    "athyper-bp-enter-isolated",
    "--network-alias",
    "secrets.dev.athyper.test",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--health-cmd",
    `node -e "const s=require('net').connect(8443,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(2000,()=>process.exit(1))"`,
    "--health-interval",
    "10s",
    "--health-timeout",
    "3s",
    "--entrypoint",
    "node",
    old.Image,
    ...old.Config.Cmd,
  ]).trim();
  docker(["network", "connect", "athyper-dev_app", relay]);
} catch (e) {
  try {
    docker(["rm", "-f", relay]);
  } catch {}
  docker(["rename", relay + "-prior-healthcheck", relay]);
  docker([
    "network",
    "connect",
    "--alias",
    "secrets.dev.athyper.test",
    "athyper-bp-enter-isolated",
    relay,
  ]);
  docker(["network", "connect", "athyper-dev_app", relay]);
  docker(["start", relay]);
  throw e;
}
const lookup = docker([
  "exec",
  "athyper-bp-enter-api",
  "node",
  "--input-type=module",
  "-e",
  `import {createInfisicalSecretStore} from '/app/server/node_modules/.pnpm/@athyper+server-adapter-secretstore-infisical@file+server+packages+adapters+secretstore-infisical/node_modules/@athyper/server-adapter-secretstore-infisical/dist/index.js';import{createHash}from'node:crypto';const s=createInfisicalSecretStore({endpoint:process.env.INFISICAL_URL,token:process.env.INFISICAL_TOKEN,workspaceId:process.env.INFISICAL_WORKSPACE_ID,environment:'dev',secretPath:'/'});const v=await s.resolve(${JSON.stringify(amendment.secret.reference)});if(createHash('sha256').update(v.bytes).digest('hex')!=='45c755c9e88ba16735daa1e465dde67bfcb209ea707ea9955ebb853683b8a248')throw Error('FIXTURE_MISMATCH');console.log('TLS_AND_SYNTHETIC_READ_VERIFIED');`,
]);
assert.equal(lookup.trim(), "TLS_AND_SYNTHETIC_READ_VERIFIED");
docker(["rm", relay + "-prior-healthcheck"]);
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
    /^\s*\d+ node tooling\/scripts\/verification\/isolated-enter\/finance-reveal-expiry-cleanup\.mjs$/.test(
      line,
    ),
  );
for (const line of processes)
  process.kill(Number(line.trim().split(/\s+/)[0]), "SIGTERM");
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: amendment.runtimeImage,
  releaseSetHash: amendment.releaseSetHash,
  removed,
  imagesAndBindMountedArtifactsRetained: true,
  relay: {
    name: relay,
    id: relayId,
    image: old.Image,
    retainedRuntimeDependency: true,
    tlsAndSyntheticReadVerified: true,
    healthCheck: "TCP 8443 instead of inherited host-port check",
  },
  queue,
  queueHistoryRetained: true,
  inventory,
  retainedFixtureSources: [
    proposal.fixtures.path,
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
  activeTemporaryAssignments: 0,
  expiryWatchStoppedAfterEarlyRevocation: processes.length,
  authorityAndActivationUnchanged: true,
  approvalAndCommandHistoryDeleted: false,
  sharedApplicationAccessChanged: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-protected-reveal-cleanup-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  removed: removed.length,
  queue,
  inventory,
  activeTemporaryAssignments: 0,
});
