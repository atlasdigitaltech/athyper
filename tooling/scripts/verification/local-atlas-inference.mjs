import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(homedir(), ".athyper");
const configPath = join(repo, "deploy/config/atlas/local-inference.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (!/^ollama\/ollama@sha256:[a-f0-9]{64}$/.test(config.engine.image))
  throw Error("Immutable official Ollama image is required");
const env = { ...process.env, ATLAS_OLLAMA_IMAGE: config.engine.image };
const args = [
  "compose",
  "-p",
  "athyper-dev-atlas",
  "-f",
  join(repo, "deploy/compose/atlas/compose.yaml"),
];
function run(args, options = {}) {
  const r = spawnSync("docker", args, {
    env,
    cwd: repo,
    stdio: "inherit",
    ...options,
  });
  if (r.error || r.status !== 0)
    throw Error("Docker operation failed", { cause: r.error });
}
const inspect = (name) =>
  JSON.parse(
    execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
  )[0];
const command = process.argv[2] ?? "status";
if (command === "up" || command === "recreate") {
  run([...args, "config", "--quiet"]);
  run([
    ...args,
    "up",
    "-d",
    "--no-deps",
    ...(command === "recreate" ? ["--force-recreate"] : []),
    "--wait",
    "--wait-timeout",
    "120",
    "atlas-inference",
  ]);
  if (config.model.digest) {
    // Fail initialization on a missing/mismatched artifact or failed generation.
    // Process health remains independent; this requires the existing API attachment.
    run([
      "exec",
      "athyper-dev-api-1",
      "node",
      "/athyper/bin/atlas-inference-readiness.mjs",
    ]);
  }
} else if (command === "attach-api") {
  const api = inspect("athyper-dev-api-1");
  const path = join(root, "instances/dev/config/local-atlas.compose.json");
  const files =
    api.Config.Labels["com.docker.compose.project.config_files"].split(",");
  if (!files.includes(path))
    throw Error("Expected preserved Atlas API overlay missing");
  const receipt = join(root, "instances/dev/receipts/atlas-inference");
  mkdirSync(receipt, { recursive: true, mode: 0o700 });
  copyFileSync(path, join(receipt, "api-overlay-before.json"));
  const overlay = JSON.parse(readFileSync(path, "utf8"));
  overlay.services.api.networks = {
    ...overlay.services.api.networks,
    "atlas-inference": {},
  };
  const mounts = [
    configPath + ":/athyper/config/atlas-local-inference.json:ro",
    join(repo, "tooling/scripts/verification/atlas-inference-readiness.mjs") +
      ":/athyper/bin/atlas-inference-readiness.mjs:ro",
  ];
  overlay.services.api.volumes = [
    ...new Set([...(overlay.services.api.volumes ?? []), ...mounts]),
  ];
  overlay.networks = {
    ...overlay.networks,
    "atlas-inference": { external: true, name: "athyper-dev-atlas_inference" },
  };
  writeFileSync(path, JSON.stringify(overlay, null, 2) + "\n", { mode: 0o600 });
  const hash = createHash("sha256"),
    ddl = join(repo, "server/db/ddl");
  function visit(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile())
        hash
          .update(p.slice(ddl.length + 1))
          .update("\0")
          .update(readFileSync(p))
          .update("\0");
    }
  }
  visit(ddl);
  const apiEnv = {
    ...process.env,
    ATHYPER_RUNTIME_ROOT: root,
    ATHYPER_INSTANCE: "dev",
    ATHYPER_RUNTIME_UID: String(process.getuid()),
    ATHYPER_RUNTIME_GID: String(process.getgid()),
    ATHYPER_DDL_SHA256: hash.digest("hex"),
  };
  const compose = [
    "compose",
    "-p",
    "athyper-dev",
    ...files.flatMap((f) => ["-f", f]),
  ];
  const merged = JSON.parse(
    execFileSync("docker", [...compose, "config", "--format", "json"], {
      env: apiEnv,
    }),
  ).services.api;
  const old = Object.fromEntries(
    api.Config.Env.map((v) => {
      const i = v.indexOf("=");
      return [v.slice(0, i), v.slice(i + 1)];
    }),
  );
  if (
    Object.keys(merged.environment).some(
      (k) => String(merged.environment[k]) !== old[k],
    )
  )
    throw Error("API environment drift; inspect before applying");
  if (merged.image !== api.Config.Image)
    throw Error("API image drift; inspect before applying");
  run(
    [
      ...compose,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "180",
      "api",
    ],
    { env: apiEnv },
  );
} else if (command === "readiness") {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "athyper-dev-api-1",
      "node",
      "/athyper/bin/atlas-inference-readiness.mjs",
    ],
    { stdio: "inherit" },
  );
  process.exitCode = r.status ?? 1;
} else if (command === "status") {
  run([...args, "ps"]);
} else throw Error("Use up, recreate, attach-api, readiness, or status");
