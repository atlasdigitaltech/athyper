/** One-time local QA baseline switch. Old Docker volumes are never deleted. */
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  renameSync,
  existsSync,
  readdirSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { loadModel } from "../../../deploy/stackctl/src/model.mjs";
process.umask(0o077);
const [deploymentArg, frozenArg] = process.argv.slice(2);
if (!deploymentArg || !frozenArg)
  throw new Error(
    "Usage: node tooling/scripts/local-dev/qa-isolate.mjs <detached-deployment-checkout> <frozen-candidate>",
  );
const deployment = resolve(deploymentArg),
  frozen = resolve(frozenArg);
const repo = resolve(import.meta.dirname, "../../..");
if (deployment === repo || deployment.startsWith(repo + "/"))
  throw new Error("Use an external detached deployment checkout");
const run = (program, args, options = {}) =>
  execFileSync(program, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const docker = (...args) => run("docker", args);
const candidate = JSON.parse(readFileSync(join(frozen, "candidate.json")));
for (const [name, expected] of Object.entries(candidate.files)) {
  if (
    !/^[a-z.-]+$/.test(name) ||
    createHash("sha256")
      .update(readFileSync(join(frozen, name)))
      .digest("hex") !== expected
  )
    throw new Error("Candidate checksum mismatch");
}
if (
  run("git", ["-C", deployment, "rev-parse", "HEAD"]).trim() !==
    candidate.sourceRevision ||
  run("git", ["-C", deployment, "branch", "--show-current"]).trim()
)
  throw new Error("Deployment must be detached at candidate source");
const runtime = join(homedir(), ".athyper");
const directory = join(
  runtime,
  "qualification",
  "qa-isolation",
  String(Date.now()),
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stamp = directory.split("/").at(-1),
  prefix = `athyper-qa-candidate-${stamp}`;
const inspect = JSON.parse(docker("inspect", "athyper-qa-db-1"))[0];
if (
  inspect.Config.Labels["com.docker.compose.project"] !== "athyper-qa" ||
  !inspect.State.Running
)
  throw new Error("Retained QA database must be running for IAM capture");
const active = JSON.parse(
  readFileSync(join(runtime, "instances/qa/receipts/active.json")),
);
if (active.spec.state !== "stopped")
  throw new Error("Stop QA applications through Stack v2 before isolation");
const running = docker(
  "ps",
  "--filter",
  "label=com.docker.compose.project=athyper-qa",
  "--format",
  "{{.Names}}",
)
  .trim()
  .split("\n")
  .filter(Boolean);
if (running.some((name) => name !== "athyper-qa-db-1"))
  throw new Error(
    "Only the retained QA database may be running during IAM capture",
  );
const sql =
  "SELECT json_build_object('users',(SELECT count(*) FROM user_entity),'accounts',(SELECT json_agg(u ORDER BY username) FROM (SELECT id,realm_id,username,enabled,email_verified FROM user_entity WHERE username IN ('catl.admin','catl.owner')) u),'credentials',(SELECT count(*) FROM credential),'roleMappings',(SELECT count(*) FROM user_role_mapping),'requiredActions',(SELECT count(*) FROM user_required_action))";
const iamBefore = JSON.parse(
  docker(
    "exec",
    inspect.Id,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_iam",
    "-Atc",
    sql,
  ),
);
if (
  iamBefore.accounts?.length !== 2 ||
  iamBefore.accounts.some((a) => !a.enabled)
)
  throw new Error("Expected existing enabled Cirrus IAM users");
const oldVolumeNames = docker(
  "volume",
  "ls",
  "-q",
  "--filter",
  "label=com.docker.compose.project=athyper-qa",
)
  .trim()
  .split("\n")
  .filter(Boolean);
const receipt = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  sourceRevision: candidate.sourceRevision,
  frozen,
  deployment,
  prefix,
  phase: "capturing",
  oldDatabaseContainer: inspect.Id,
  oldVolumes: JSON.parse(docker("volume", "inspect", ...oldVolumeNames)).map(
    (v) => ({ name: v.Name, driver: v.Driver, labels: v.Labels }),
  ),
  iamBefore,
  newVolumes: [],
  releaseQualified: false,
};
const save = () =>
  writeFileSync(
    join(directory, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
save();
const fd = openSync(join(directory, "iam.dump"), "wx", 0o600);
try {
  run(
    "docker",
    [
      "exec",
      inspect.Id,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "athyper_iam",
      "-Fc",
    ],
    { stdio: ["ignore", fd, "pipe"] },
  );
} finally {
  closeSync(fd);
}
receipt.iamDumpSha256 = createHash("sha256")
  .update(readFileSync(join(directory, "iam.dump")))
  .digest("hex");
cpSync(
  join(runtime, "instances/qa/receipts"),
  join(directory, "old-receipts"),
  { recursive: true },
);
const composePaths = [
  "deploy/compose/instance/compose.yaml",
  "deploy/compose/instance/compose.parity.yaml",
];
const templatePath = join(deployment, "deploy/instances/templates/qa.yaml");
const templateSource = readFileSync(templatePath, "utf8");
const template = YAML.parseDocument(templateSource);
if (template.getIn(["spec", "composeProject"]) !== "athyper-qa")
  throw new Error("QA deployment already isolated; use its recovery receipt");
writeFileSync(join(directory, "qa-template.yaml"), templateSource, {
  mode: 0o600,
});
template.setIn(["spec", "composeProject"], prefix);
writeFileSync(templatePath, String(template));
for (const relative of composePaths) {
  const config = YAML.parse(readFileSync(join(deployment, relative), "utf8"));
  for (const [key, value] of Object.entries(config.volumes ?? {})) {
    if (value?.external || value?.name)
      throw new Error(
        "Explicit volume overrides are not supported; use project-scoped volumes",
      );
    receipt.newVolumes.push(`${prefix}_${key}`);
  }
}
const imageSet = YAML.parse(readFileSync(join(frozen, "images.yaml"), "utf8"));
const ddlHash = createHash("sha256");
function hashTree(path, base = path) {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const item = join(path, entry.name);
    if (entry.isDirectory()) hashTree(item, base);
    else if (entry.isFile())
      ddlHash
        .update(item.slice(base.length + 1))
        .update("\0")
        .update(readFileSync(item))
        .update("\0");
  }
}
hashTree(join(deployment, "server/db/ddl"));
const env = {
  ...process.env,
  ATHYPER_RUNTIME_ROOT: runtime,
  ATHYPER_INSTANCE: "qa",
  ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test",
  ATHYPER_POSTGRES_BIND: loadModel(deployment, "qa").instance.spec.debugPorts
    .postgres,
  ATHYPER_DDL_SHA256: ddlHash.digest("hex"),
};
for (const image of imageSet.spec.images)
  env["ATHYPER_IMAGE_" + image.id.toUpperCase().replaceAll("-", "_")] =
    image.reference;
const compose = (...args) =>
  run(
    "docker",
    [
      "compose",
      "-p",
      prefix,
      ...composePaths.flatMap((p) => ["-f", join(deployment, p)]),
      ...args,
    ],
    { cwd: deployment, env },
  );
compose("config", "--quiet");
receipt.phase = "backup-complete";
save();
docker("stop", inspect.Id);
compose("up", "-d", "--wait", "--no-deps", "db");
const fresh = JSON.parse(docker("inspect", `${prefix}-db-1`))[0];
if (!fresh.Mounts.some((m) => m.Name === `${prefix}_db-data`))
  throw new Error("Fresh QA database volume binding failed");
compose("run", "--rm", "--no-deps", "db-init");
const fdIn = openSync(join(directory, "iam.dump"), "r");
try {
  run(
    "docker",
    [
      "exec",
      "-i",
      fresh.Id,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      "athyper_iam",
      "--exit-on-error",
    ],
    { stdio: [fdIn, "pipe", "pipe"] },
  );
} finally {
  closeSync(fdIn);
}
const iamAfter = JSON.parse(
  docker(
    "exec",
    fresh.Id,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_iam",
    "-Atc",
    sql,
  ),
);
if (JSON.stringify(iamBefore) !== JSON.stringify(iamAfter))
  throw new Error("IAM identity or credential counts changed during restore");
receipt.iamAfter = iamAfter;
receipt.phase = "iam-restored-product-databases-empty";
save();
const migration = join(runtime, "instances/qa/receipts/migration.json");
if (existsSync(migration))
  renameSync(migration, join(directory, "retired-migration.json"));
const ownership = {
  ...active,
  spec: {
    ...active.spec,
    project: prefix,
    state: "stopped",
    updatedAt: new Date().toISOString(),
    composeFiles: composePaths.map((p) => join(deployment, p)),
  },
};
writeFileSync(
  join(runtime, "instances/qa/receipts/active.json"),
  JSON.stringify(ownership, null, 2) + "\n",
  { mode: 0o600 },
);
receipt.phase = "ready-for-native-foundation";
save();
console.log(
  `Fresh QA volumes prepared; existing IAM preserved. Recovery receipt: ${join(directory, "receipt.json")}`,
);
console.log(
  `Run pnpm athyper up qa --confirm qa --initialize-database from ${deployment}`,
);
