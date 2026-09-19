/** Deploy the prepared shadow adapter, or restore its exact saved process configuration. */
import fs from "node:fs";
import cp from "node:child_process";
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--stage", "--rollback"].includes(mode))
  throw Error("Use --stage or --rollback");
const root = fs.readFileSync("/tmp/bp-v2-compiler-root", "utf8"),
  baseline = JSON.parse(fs.readFileSync(root + "/baseline.json"));
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 3000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const head = () =>
  run([
    "exec",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "SELECT row_to_json(h) FROM runtime_meta.release_activation_head h WHERE publication_key='metadata.entity.business_partner.local-master-data.cirrusatlantic'",
  ]).trim();
const before = head();
if (
  JSON.parse(before).source_release_no !== 18 &&
  String(JSON.parse(before).source_release_no) !== "18"
)
  throw Error("Expected release18 baseline");
const file = mode === "--stage" ? "rollout.json" : "rollback.json";
run([
  "compose",
  "-p",
  "athyper-dev",
  "-f",
  root + "/" + file,
  "up",
  "-d",
  "--no-deps",
  "--force-recreate",
  "api",
  "worker",
]);
const started = Date.now();
let containers;
while (Date.now() - started < 150000) {
  containers = JSON.parse(
    run(["inspect", "athyper-dev-api-1", "athyper-dev-worker-1"]),
  );
  if (containers.every((c) => c.State.Health?.Status === "healthy")) break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (!containers?.every((c) => c.State.Health?.Status === "healthy"))
  throw Error(
    "Adapter deployment unhealthy; inspect and restore saved rollback configuration",
  );
const receipts = [];
for (const c of containers) {
  const expected =
    mode === "--stage"
      ? baseline.image
      : baseline.containers.find((b) => b.name === c.Name)?.image;
  if (c.Image !== expected) throw Error("Unexpected runtime image");
  if (mode === "--stage") {
    const logs = run(["logs", "--since", c.State.StartedAt, c.Name.slice(1)]);
    const receipt = logs
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      })
      .find((e) => e.event === "bp_authorization_deployment_verified");
    if (
      !receipt ||
      receipt.mode !== "shadow" ||
      receipt.enforcement !== false ||
      receipt.artifactHash !== baseline.artifactHash ||
      receipt.runtimeImage !== c.Image
    )
      throw Error("Native adapter startup receipt missing");
    receipts.push({ container: c.Name, ...receipt });
  }
}
if (head() !== before) throw Error("Release head changed during deployment");
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  kind: "bp_authorization_adapter_process_deployment",
  mode: mode.slice(2),
  containers: containers.map((c) => ({
    name: c.Name,
    id: c.Id,
    image: c.Image,
    health: c.State.Health.Status,
  })),
  startupReceipts: receipts,
  sharedHead: JSON.parse(before),
  activationChanged: false,
  grantsChangedByScript: false,
  rollbackConfig: root + "/rollback.json",
  targetExecutionQualified: false,
};
const output = root + "/" + mode.slice(2) + "-" + Date.now() + ".json";
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  mode: 0o600,
});
fs.writeFileSync(
  "governance/policy/reports/business-partner-v2-compiler." +
    mode.slice(2) +
    ".dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    mode: report.mode,
    healthy: true,
    release: 18,
    receipts: receipts.length,
    output,
  }),
);
