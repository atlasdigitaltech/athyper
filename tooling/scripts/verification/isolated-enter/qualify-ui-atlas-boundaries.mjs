import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-correction-runtime-verification.dev.json",
  ),
);
const run = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(run(["inspect", "athyper-bp-enter-api"]))[0];
assert.equal(c.Image, proof.imageId);
assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
  "athyper-bp-enter-isolated",
]);
const id = "00000000-0000-4000-8000-000000000001";
const routes = [
  [
    "list_descriptor",
    "GET",
    "/api/entity-runtime/business_partner/list-descriptor",
  ],
  ["list", "GET", "/api/entity-runtime/business_partner/list"],
  [
    "child_descriptor",
    "GET",
    "/api/entity-runtime/business_partner_request/list-descriptor",
  ],
  ["record", "GET", "/api/records/business_partner/" + id],
  ["summary", "GET", "/api/neon/business-partners/" + id + "/360/summary"],
  ["section", "GET", "/api/neon/business-partners/" + id + "/360/contacts"],
  ["atlas_retrieval", "POST", "/api/isolated/ai-record-retrieval"],
];
const results = JSON.parse(
  run(
    ["exec", "-i", "athyper-bp-enter-api", "node", "--input-type=module"],
    `const results=[];for(const[name,method,path]of ${JSON.stringify(routes)}){const r=await fetch('http://127.0.0.1:4000'+path,{method,headers:method==='POST'?{'content-type':'application/json'}:{},...(method==='POST'?{body:'{}'}:{})});const b=await r.json();results.push({name,path,status:r.status,code:b.code??b.error,artifact:r.headers.get('x-execution-artifact'),release:r.headers.get('x-execution-release')});}console.log(JSON.stringify(results));`,
  ),
);
for (const r of results) {
  assert.equal(r.status, 401, r.name);
  assert.equal(r.artifact, proof.artifactHash);
  assert.equal(r.release, proof.releaseId);
}
const counts = JSON.parse(
  run(
    [
      "exec",
      "-i",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
    ],
    `BEGIN READ ONLY;SELECT jsonb_build_object('bpRecords',(SELECT count(*) FROM master.business_partner),'descriptors',(SELECT jsonb_agg(entity_code) FROM runtime_meta.entity_contract WHERE tenant_id='44444444-4444-4444-8444-444444444444'),'roles',(SELECT count(*) FROM authz.role));ROLLBACK;`,
  ).trim(),
);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  image: proof.imageId,
  checks: results,
  anonymousBoundaryPassed: true,
  authenticatedUserQualification: false,
  counts,
  grantsChanged: false,
  activationChanged: false,
  blockers: [
    "Temporary test-access proposal remains unapproved",
    "No BP test record exists",
    "Child request descriptor is absent",
    "Atlas admission capability absent from proposed test grants",
    "No isolated UI bundle is deployed; API/worker only",
  ],
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-enter-ui-atlas-boundaries.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  anonymousChecksPassed: results.length,
  counts,
  authenticatedUserQualification: false,
});
