import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
const stage = process.argv[2] === "--stage";
if (process.argv.slice(2).some((x) => x !== "--stage"))
  throw Error("Use optional --stage");
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911",
  p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-successor-isolated-transfer-grants.proposal.dev.json",
    ),
  );
let image = p.runtimeImage;
if (fs.existsSync(root + "/execution-image.json")) {
  const e = JSON.parse(fs.readFileSync(root + "/execution-image.json"));
  const m = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-successor-execution-image.amendment.dev.json",
    ),
  );
  const a = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-successor-execution-image.acceptance.dev.json",
    ),
  );
  const w =
    "governance/policy/reviews/business-partner-successor-execution-image.amendment.withdrawn.dev.json";
  if (
    fs.existsSync(w) &&
    JSON.parse(fs.readFileSync(w)).revision === m.revision
  )
    throw Error("Execution amendment withdrawn");
  if (
    e.runtimeImage !== m.runtimeImage ||
    e.amendmentRevision !== m.revision ||
    a.revision !== m.revision ||
    !a.accepted
  )
    throw Error("Image amendment mismatch");
  image = e.runtimeImage;
}
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 4000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const args = [
  "--network",
  "athyper-bp-r19s-isolated",
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
    const name = "athyper-bp-r19s-" + mode;
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
