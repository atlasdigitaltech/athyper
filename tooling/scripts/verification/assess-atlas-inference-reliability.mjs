import { readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const snapshot = () =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "inspect",
        "athyper-dev-api-1",
        "athyper-dev-worker-1",
        "athyper-dev-neon-web-1",
        "athyper-dev-mesh-web-1",
        "athyper-dev-studio-web-1",
        "athyper-dev-atlas-atlas-inference-1",
      ],
      { encoding: "utf8" },
    ),
  ).map((c) => ({
    name: c.Name.slice(1),
    containerId: c.Id,
    digest: c.Image,
    health: c.State.Health?.Status ?? c.State.Status,
  }));
const before = snapshot();
assert.ok(before.every((c) => c.health === "healthy"));
const config = ["local-inference", "semantic-retrieval"].map((name) =>
  JSON.parse(readFileSync(`deploy/config/atlas/${name}.json`, "utf8")),
);
const deviceSamples = [];
const sampleDevice = () => {
  try {
    const rows = execFileSync(
      "docker",
      [
        "exec",
        "athyper-dev-atlas-atlas-inference-1",
        "nvidia-smi",
        "--query-gpu=memory.total,memory.used,utilization.gpu",
        "--format=csv,noheader,nounits",
      ],
      { encoding: "utf8", timeout: 3000 },
    )
      .trim()
      .split("\n");
    for (const row of rows) {
      const [totalMiB, usedMiB, utilizationPercent] = row
        .split(",")
        .map(Number);
      if ([totalMiB, usedMiB, utilizationPercent].every(Number.isFinite))
        deviceSamples.push({ totalMiB, usedMiB, utilizationPercent });
    }
  } catch {
    /* Model-residency samples remain available separately. */
  }
};
sampleDevice();
const deviceTimer = setInterval(sampleDevice, 1000);
const child = spawn(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-api-1",
    "node",
    "--input-type=module",
    "-",
    JSON.stringify(config),
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);
child.stdin.end(
  readFileSync("tooling/scripts/verification/atlas-inference-workload.mjs"),
);
let out = "",
  err = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (err += d));
const code = await new Promise((resolve) => child.on("close", resolve));
clearInterval(deviceTimer);
sampleDevice();
let report;
try {
  report = JSON.parse(out);
} catch {
  console.error("Assessment did not return JSON; module or harness failure.");
  console.error(
    err
      .split("\n")
      .filter((l) =>
        /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|TypeError/.test(l),
      )
      .join("\n"),
  );
  process.exit(1);
}
report.deviceMemory = {
  samples: deviceSamples.length,
  totalMiB: deviceSamples[0]?.totalMiB ?? null,
  peakUsedMiB: deviceSamples.length
    ? Math.max(...deviceSamples.map((s) => s.usedMiB))
    : null,
  peakUtilizationPercent: deviceSamples.length
    ? Math.max(...deviceSamples.map((s) => s.utilizationPercent))
    : null,
  scope: "Entire GPU, including any other clients; sampled once per second.",
};
report.imagesBefore = before;
report.imagesAfter = snapshot();
report.stableDeployment =
  JSON.stringify(before) === JSON.stringify(report.imagesAfter);
report.passed = report.passed && report.stableDeployment && code === 0;
writeFileSync(
  "docs/examples/atlas-f6/inference-reliability-assessment.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.passed,
    stableDeployment: report.stableDeployment,
    checks: report.checks,
    groups: report.groups,
    metrics: report.metrics,
  }),
);
if (!report.passed) process.exitCode = 1;
