import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const stage = process.argv[2] === "--stage";
if (process.argv.slice(2).some((x) => x !== "--stage"))
  throw Error("Use optional --stage");
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-release-20-isolated-20260911";
const proof = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-v2-runtime-verification.dev.json",
  ),
);
const image = proof.imageId;
if (
  proof.releaseId !== "21bec59b-86fb-441c-93b2-5027f2999d0b" ||
  !proof.alteredHashRejected ||
  createHash("sha256")
    .update(fs.readFileSync(root + "/artifact.json"))
    .digest("hex") !== proof.artifactHash
)
  throw Error("Verified release20 artifact required");
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 4000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const args = [
  "--network",
  "athyper-bp-r20-isolated",
  "--env-file",
  root + "/runtime.env",
  "--mount",
  "type=bind,src=" +
    root +
    "/artifact.json,dst=/release/artifact.json,readonly",
  "--mount",
  "type=bind,src=" +
    root +
    "/public-key.der,dst=/release/public-key.der,readonly",
  "--mount",
  "type=bind,src=" + root + "/harness,dst=/app/server/qualification,readonly",
  ...(fs.existsSync(root + "/deployment.json")
    ? [
        "--mount",
        "type=bind,src=" +
          root +
          "/deployment.json,dst=/release/deployment.json,readonly",
      ]
    : []),
  "--entrypoint",
  "node",
  "--no-healthcheck",
];
if (stage) {
  fs.writeFileSync(
    root + "/stage.env",
    fs
      .readFileSync(root + "/runtime.env", "utf8")
      .replace(
        /(DATABASE_URL=postgresql:\/\/)athyper_runtime:/g,
        "$1postgres:",
      ),
    { mode: 0o600 },
  );
  const out = run([
    "run",
    "--rm",
    ...args,
    "--env-file",
    root + "/stage.env",
    "-e",
    "MODE=api",
    "-e",
    "ISOLATED_STAGE=true",
    image,
    "/app/server/qualification/host.mjs",
  ]);
  fs.writeFileSync(root + "/stage-log.txt", out, { mode: 0o600 });
  console.log(
    JSON.stringify({
      staged: out.includes("isolated_projection_installed"),
      runtimeImage: image,
    }),
  );
} else {
  for (const mode of ["api", "worker"]) {
    const name = "athyper-bp-r20-" + mode;
    const id = run([
      "run",
      "-d",
      "--name",
      name,
      ...args,
      "-e",
      "MODE=" + mode,
      image,
      "/app/server/qualification/host.mjs",
    ]).trim();
    console.log(JSON.stringify({ name, id, runtimeImage: image }));
  }
}
