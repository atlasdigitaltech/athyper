import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import assert from "node:assert/strict";
const run = (args, options = {}) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const output = process.argv[2];
if (!output || process.argv.length !== 3 || fs.existsSync(output))
  throw Error("Provide a new evidence output path");
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-enter-correction-runtime-verification.dev.json",
  ),
);
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const env = Object.fromEntries(
  fs
    .readFileSync(root + "/runtime.env", "utf8")
    .trim()
    .split("\n")
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const name of ["api", "worker", "db", "redis", "objectstore"]) {
  const c = JSON.parse(run(["inspect", "athyper-bp-enter-" + name]))[0];
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [
    "athyper-bp-enter-isolated",
  ]);
  assert.ok(!Object.values(c.NetworkSettings.Ports ?? {}).some(Boolean));
  if (["api", "worker"].includes(name)) assert.equal(c.Image, proof.imageId);
  assert.equal(c.State.Running, true);
}
const request = async (method, path, headers = {}) =>
  JSON.parse(
    run(["exec", "-i", "athyper-bp-enter-api", "node", "--input-type=module"], {
      input: `const headers=${JSON.stringify(headers)};if(headers.authorization)headers.authorization='Bearer '+process.env.ISOLATED_OPERATOR_TOKEN;const r=await fetch('http://127.0.0.1:4000${path}',{method:${JSON.stringify(method)},headers});console.log(JSON.stringify({status:r.status,artifact:r.headers.get('x-execution-artifact'),release:r.headers.get('x-execution-release'),body:await r.json()}));`,
    }),
  );
const fingerprint = () => {
  const after = {};
  const before = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-enter-isolated-shared-before.dev.json",
    ),
  );
  for (const [plane, value] of Object.entries(before.fingerprints)) {
    const tables = Object.keys(JSON.parse(value));
    const q = (t) =>
      `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${t} r`;
    after[plane] = run(
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_" + plane,
      ],
      {
        input:
          "BEGIN READ ONLY;SELECT jsonb_object_agg(name,digest) FROM (" +
          tables.map(q).join(" UNION ALL ") +
          ") s;ROLLBACK;",
      },
    ).trim();
  }
  return after;
};
const before = fingerprint();

const headers = { authorization: "operator" };
let read;
for (let i = 0; i < 35; i++) {
  read = await request("GET", "/isolated/execution", headers);
  if (read.status === 200) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(read.status, 200);
assert.equal(read.artifact, proof.artifactHash);
assert.equal(read.release, proof.releaseId);
assert.equal(read.body.artifactHash, proof.artifactHash);
const wrong = await request("GET", "/isolated/execution", {
  ...headers,
  "x-execution-artifact": "0".repeat(64),
});
assert.equal(wrong.status, 409);
const unauth = await request("GET", "/isolated/execution");
assert.equal(unauth.status, 401);
const job = await request("POST", "/isolated/execution/jobs", headers);
assert.equal(job.status, 202);
let receipt;
for (let i = 0; i < 35; i++) {
  const logs = run(["logs", "athyper-bp-enter-worker"]);
  receipt = logs
    .split("\n")
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    })
    .find(
      (l) =>
        l.kind === "isolated_job_execution" &&
        l.jobRef ===
          createHash("sha256").update(job.body.jobId).digest("hex") &&
        l.name === "read-active-descriptor" &&
        l.releaseId === proof.releaseId &&
        l.artifactHash === proof.artifactHash,
    );
  if (receipt) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(receipt, "Worker receipt missing");
const after = fingerprint();
for (const plane of Object.keys(before))
  assert.deepEqual(JSON.parse(after[plane]), JSON.parse(before[plane]));
const result = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  releaseId: proof.releaseId,
  artifactHash: proof.artifactHash,
  image: proof.imageId,
  api: read,
  worker: receipt,
  wrongArtifactStatus: wrong.status,
  unauthenticatedStatus: unauth.status,
  isolatedNetwork: true,
  hostPortsPublished: false,
  sharedAuthorityAndActivationUnchanged: true,
  sharedBefore: before,
  sharedFingerprints: after,
  businessJourneyQualification: false,
  passed: true,
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log({
  passed: true,
  apiStatus: read.status,
  jobStatus: job.status,
  workerReceipt: true,
  sharedUnchanged: true,
});
