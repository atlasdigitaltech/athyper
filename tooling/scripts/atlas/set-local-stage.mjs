// Local DEV only. Recreates only the API; preserves databases, audit, model volumes, and QA.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
const stage = process.argv[2];
if (!["read", "chat", "history", "mutation"].includes(stage))
  throw Error("Expected read, chat, history, or mutation");
const repo = process.cwd(),
  runtime = join(process.env.HOME, ".athyper");
const inspect = (name) =>
  JSON.parse(
    execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
  )[0];
const before = inspect("athyper-dev-api-1");
const files =
  before.Config.Labels["com.docker.compose.project.config_files"].split(",");
const overlay = join(runtime, "instances/dev/config/local-atlas.compose.json");
if (!files.includes(overlay)) throw Error("Expected local overlay missing");
const original = readFileSync(overlay, "utf8"),
  updated = JSON.parse(original);
const candidate = before.Image;
const receiptDir = join(runtime, "instances/dev/receipts/atlas-tools");
mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
writeFileSync(
  join(
    receiptDir,
    "local-atlas.compose.before-" + stage + "-" + Date.now() + ".json",
  ),
  original,
  { mode: 0o600, flag: "wx" },
);
const baseline = execFileSync("docker", ["ps", "--format", "{{json .}}"], {
  encoding: "utf8",
});
writeFileSync(join(receiptDir, "services-before.jsonl"), baseline);
updated.services.api.image = candidate;
updated.services.api.environment.ATLAS_LOCAL_INFERENCE_CONFIG_PATH =
  "/athyper/config/atlas-local-inference.json";
updated.services.api.environment.ATLAS_AGENT_TOOLS_ENABLED = String(
  ["read", "mutation"].includes(stage),
);
updated.services.api.environment.ATLAS_AGENT_MUTATIONS_ENABLED = String(
  stage === "mutation",
);
updated.services.api.environment.ATLAS_AGENT_GENERATION_ENABLED = String(
  stage !== "history",
);
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
const env = {
  ...process.env,
  ATHYPER_RUNTIME_ROOT: runtime,
  ATHYPER_RUNTIME_UID: String(process.getuid()),
  ATHYPER_RUNTIME_GID: String(process.getgid()),
  ATHYPER_INSTANCE: "dev",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
  ATHYPER_DDL_SHA256: hash.digest("hex"),
};
const args = [
  "compose",
  "--project-name",
  "athyper-dev",
  ...files.flatMap((f) => ["--file", f]),
];
try {
  writeFileSync(overlay, JSON.stringify(updated, null, 2) + "\n", {
    mode: 0o600,
  });
  const config = JSON.parse(
    execFileSync("docker", [...args, "config", "--format", "json"], {
      env,
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ).services.api;
  const old = Object.fromEntries(
    before.Config.Env.map((v) => {
      const i = v.indexOf("=");
      return [v.slice(0, i), v.slice(i + 1)];
    }),
  );
  const changed = Object.keys(config.environment).filter(
    (k) =>
      String(config.environment[k]) !== old[k] &&
      ![
        "ATLAS_LOCAL_INFERENCE_CONFIG_PATH",
        "ATLAS_AGENT_TOOLS_ENABLED",
        "ATLAS_AGENT_MUTATIONS_ENABLED",
        "ATLAS_AGENT_GENERATION_ENABLED",
      ].includes(k),
  );
  if (changed.length || config.image !== candidate)
    throw Error("Unexpected configuration changes: " + changed.join(","));
  const r = spawnSync(
    "docker",
    [
      ...args,
      "up",
      "--detach",
      "--no-deps",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "180",
      "api",
    ],
    { env, cwd: repo, stdio: "inherit" },
  );
  if (r.status) throw Error("API replacement failed");
  writeFileSync(
    join(receiptDir, "deployment.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        previousImage: before.Image,
        candidateImage: candidate,
        container: inspect("athyper-dev-api-1").Id,
        stage,
        composeFiles: files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("DEV API deployed and healthy: " + candidate);
} catch (error) {
  writeFileSync(overlay, original, { mode: 0o600 });
  spawnSync(
    "docker",
    [
      ...args,
      "up",
      "--detach",
      "--no-deps",
      "--wait",
      "--wait-timeout",
      "180",
      "api",
    ],
    { env, cwd: repo, stdio: "inherit" },
  );
  throw error;
}
