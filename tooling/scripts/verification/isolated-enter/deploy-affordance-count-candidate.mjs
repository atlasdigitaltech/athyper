import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { docker, fingerprint } from "./protected-reveal-client.mjs";
const prefix =
    "governance/policy/reviews/business-partner-affordance-count-execution-20260912",
  p = JSON.parse(fs.readFileSync(prefix + ".proposal.dev.json")),
  a = JSON.parse(fs.readFileSync(prefix + ".user-approval.dev.json"));
const { proposalRevision, ...body } = p;
const sha = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(sha(JSON.stringify(body)), proposalRevision);
assert.equal(a.proposalRevision, proposalRevision);
assert.equal(a.decision, "approved");
assert(Date.now() < Date.parse(p.effectiveUntil));
assert.equal(
  sha(fs.readFileSync(p.candidateManifest)),
  p.candidateManifestSha256,
);
const m = JSON.parse(fs.readFileSync(p.candidateManifest));
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
for (const h of m.harness)
  assert.equal(
    sha(fs.readFileSync(root + "/affordance-count-harness/" + h.name)),
    h.sha256,
  );
const before = fingerprint(),
  results = [],
  output =
    "governance/policy/reports/business-partner-affordance-count-deployment-20260912.dev.json";
assert(!fs.existsSync(output));
const save = () =>
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        proposalRevision,
        runtimeImage: p.runtimeImage,
        uiImage: p.uiImage,
        releaseSetHash: p.releaseSetHash,
        results,
        grantsChanged: false,
      },
      null,
      2,
    ) + "\n",
  );
save();
for (const mode of ["worker", "api", "neon-ui"]) {
  const name = "athyper-bp-enter-" + mode,
    current = JSON.parse(docker(["inspect", name]))[0],
    ui = mode === "neon-ui";
  assert.equal(current.Image, ui ? p.previousUiImage : p.previousRuntimeImage);
  const previous = name + "-before-affordance-count";
  const mounts = current.Mounts.flatMap((x) => [
    "--mount",
    "type=bind,src=" +
      (x.Destination === "/app/server/qualification"
        ? root + "/affordance-count-harness"
        : x.Destination === "/release/deployment.json"
          ? root + "/affordance-count-deployment.json"
          : x.Source) +
      ",dst=" +
      x.Destination +
      (x.RW ? "" : ",readonly"),
  ]);
  docker(["stop", name]);
  docker(["rename", name, previous]);
  docker(["network", "disconnect", "athyper-bp-enter-isolated", previous]);
  try {
    const args = [
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "athyper-bp-enter-isolated",
      "--env-file",
      root + (ui ? "/neon-ui.env" : "/runtime-protected-values.env"),
      ...mounts,
    ];
    if (ui) args.push("-p", "127.0.0.1:13319:3000", p.uiImage);
    else
      args.push(
        "-e",
        "MODE=" + mode,
        "--entrypoint",
        "node",
        "--no-healthcheck",
        p.runtimeImage,
        "/app/server/qualification/host.mjs",
      );
    const id = docker(args).trim();
    if (ui) {
      for (const network of Object.keys(current.NetworkSettings.Networks)) {
        if (network !== "athyper-bp-enter-isolated")
          docker(["network", "connect", network, name]);
      }
    }
    results.push({
      name,
      id,
      previous,
      image: ui ? p.uiImage : p.runtimeImage,
    });
    save();
  } catch (e) {
    try {
      docker(["rm", "-f", name]);
    } catch {}
    docker(["rename", previous, name]);
    docker(["network", "connect", "athyper-bp-enter-isolated", name]);
    docker(["start", name]);
    throw e;
  }
}
assert.deepEqual(fingerprint(), before);
console.log({ deployed: true, results, grantsChanged: false });
