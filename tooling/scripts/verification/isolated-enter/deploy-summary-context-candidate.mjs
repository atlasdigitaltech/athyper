import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  proposal as p,
  docker,
  fingerprint,
} from "./affordance-count-client.mjs";
import { proposalPrefix } from "./affordance-count-run.mjs";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  approval = JSON.parse(
    fs.readFileSync(proposalPrefix + ".user-approval.dev.json"),
  );
assert.equal(p.kind, "isolated_neon_summary_context_correction");
const { proposalRevision, ...body } = p;
assert.equal(sha(JSON.stringify(body)), proposalRevision);
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
assert(Date.now() < Date.parse(p.effectiveUntil));
assert.equal(
  sha(fs.readFileSync(p.candidateManifest)),
  p.candidateManifestSha256,
);
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911",
  manifest = JSON.parse(fs.readFileSync(p.candidateManifest));
for (const file of manifest.harness)
  assert.equal(
    sha(fs.readFileSync(root + "/summary-context-harness/" + file.name)),
    file.sha256,
  );
const output =
  "governance/policy/reports/business-partner-summary-context-deployment-20260912.dev.json";
assert(!fs.existsSync(output));
const before = fingerprint(),
  results = [],
  save = () =>
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
    old = JSON.parse(docker(["inspect", name]))[0],
    ui = mode === "neon-ui";
  assert.equal(old.Image, ui ? p.previousUiImage : p.previousRuntimeImage);
  const previous = name + "-before-summary-context";
  const mounts = old.Mounts.flatMap((m) => [
    "--mount",
    "type=bind,src=" +
      (m.Destination === "/app/server/qualification"
        ? root + "/summary-context-harness"
        : m.Destination === "/release/deployment.json"
          ? root + "/summary-context-deployment.json"
          : m.Source) +
      ",dst=" +
      m.Destination +
      (m.RW ? "" : ",readonly"),
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
    if (ui)
      for (const network of Object.keys(old.NetworkSettings.Networks))
        if (network !== "athyper-bp-enter-isolated")
          docker(["network", "connect", network, name]);
    results.push({
      name,
      id,
      previous,
      image: ui ? p.uiImage : p.runtimeImage,
    });
    save();
  } catch (error) {
    try {
      docker(["rm", "-f", name]);
    } catch {}
    docker(["rename", previous, name]);
    docker(["network", "connect", "athyper-bp-enter-isolated", name]);
    docker(["start", name]);
    throw error;
  }
}
assert.deepEqual(fingerprint(), before);
console.log({ deployed: true, results, grantsChanged: false });
