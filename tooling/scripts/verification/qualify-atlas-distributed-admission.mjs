import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const inspect = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-api-1"], {
    encoding: "utf8",
  }),
)[0];
const secret = inspect.Mounts.find(
  (m) => m.Destination === "/run/secrets/redis-password",
);
const build = JSON.parse(
  readFileSync(
    "docs/examples/atlas-f6/distributed-inference-build.json",
    "utf8",
  ),
);
const r = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-i",
    "--network",
    "athyper-dev_data",
    "--mount",
    `type=bind,source=${secret.Source},target=/run/secrets/redis-password,readonly`,
    "--entrypoint",
    "node",
    build.imageDigest,
    "--input-type=module",
    "-",
  ],
  {
    input: readFileSync(
      "tooling/scripts/verification/atlas-distributed-admission-checks.mjs",
    ),
    encoding: "utf8",
    timeout: 45000,
  },
);
let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error("Distributed admission assessment failed");
  console.error(
    r.stderr
      .split("\n")
      .filter((l) => /AssertionError|Error:|ERR_MODULE_NOT_FOUND/.test(l))
      .slice(0, 3)
      .join("\n"),
  );
  process.exit(1);
}
report.imageDigest = build.imageDigest;
report.passed = report.passed && r.status === 0;
writeFileSync(
  "docs/examples/atlas-f6/distributed-admission-qualification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
