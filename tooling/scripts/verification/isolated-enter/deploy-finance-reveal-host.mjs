import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, fingerprint, sql, quote } from "./neon-final-client.mjs";
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  ),
  approval = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.user-approval.dev.json",
    ),
  );
const { proposalRevision, ...body } = p,
  hash = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(hash(JSON.stringify(body)), proposalRevision);
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
assert.equal(
  proposalRevision,
  "01d4baa18931c72025a4cea425b7b34ff111f5e76c54767d7f7c428c15fc6d45",
);
assert(
  Date.now() >= Date.parse(p.effectiveFrom) &&
    Date.now() < Date.parse(p.effectiveUntil),
);
assert.equal(
  hash(fs.readFileSync(p.candidateManifest)),
  p.candidateManifestSha256,
);
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  harness = root + "/finance-reveal-v2-harness",
  manifest = JSON.parse(fs.readFileSync(p.candidateManifest));
for (const f of manifest.harness)
  assert.equal(hash(fs.readFileSync(harness + "/" + f.name)), f.sha256);
assert.equal(
  JSON.parse(fs.readFileSync(root + "/finance-reveal-v2-deployment.json"))
    .runtimeImage,
  p.runtimeImage,
);
for (const a of p.artifacts)
  assert.equal(
    Number(
      sql(
        `SELECT count(*) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id WHERE h.artifact_hash=${quote(a.artifactHash)} AND r.source_release_id=${quote(a.releaseId)};`,
      ),
    ),
    1,
  );
const before = fingerprint(),
  results = [];
for (const mode of ["worker", "api"]) {
  const name = "athyper-bp-enter-" + mode,
    prior = name + "-before-finance-reveal";
  const current = JSON.parse(docker(["inspect", name]))[0];
  assert.equal(current.Image, p.previousRuntimeImage);
  assert.equal(current.State.Running, true);
  assert.deepEqual(Object.keys(current.NetworkSettings.Networks), [
    p.destination.network,
  ]);
  const mounts = current.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? harness
        : m.Destination === "/release/deployment.json"
          ? root + "/finance-reveal-v2-deployment.json"
          : m.Source) +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
  ]);
  docker(["stop", name]);
  docker(["rename", name, prior]);
  docker(["network", "disconnect", p.destination.network, prior]);
  try {
    const id = docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      p.destination.network,
      "--env-file",
      root + "/runtime.env",
      "-e",
      "MODE=" + mode,
      ...mounts,
      "--entrypoint",
      "node",
      "--no-healthcheck",
      p.runtimeImage,
      "/app/server/qualification/host.mjs",
    ]).trim();
    results.push({ name, id, image: p.runtimeImage, prior });
  } catch (error) {
    try {
      docker(["rm", "-f", name]);
    } catch {}
    docker(["rename", prior, name]);
    docker(["network", "connect", p.destination.network, name]);
    docker(["start", name]);
    throw error;
  }
}
assert.deepEqual(fingerprint(), before);
fs.writeFileSync(
  "governance/policy/reports/business-partner-finance-reveal-deployment-20260912.dev.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      proposalRevision,
      results,
      releaseSetHash: p.releaseSetHash,
      grantsApplied: false,
      authorityAndActivationUnchanged: true,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  results,
  releaseSetHash: p.releaseSetHash,
  grantsApplied: false,
});
