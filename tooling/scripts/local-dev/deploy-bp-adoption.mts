/** Scoped DEV launcher. Secrets travel on stdin, never argv or output. */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
const args = process.argv.slice(2);
const candidateOption = args.find((a) => a.startsWith("--candidate="));
const candidateHash =
  candidateOption?.slice("--candidate=".length) ??
  "77adde8e8e610196f099f776f6c121543dd8d47b571a0eb2fe99c7b8377e2492";
if (
  !/^[a-f0-9]{64}$/.test(candidateHash) ||
  args.filter((a) => a !== candidateOption).length !== 1 ||
  args.some(
    (a) => !["--apply", "--check"].includes(a) && a !== candidateOption,
  ) ||
  (candidateOption && !args.includes("--check"))
)
  throw Error("USE_CHECK_OR_APPLY");
const base = join(homedir(), ".athyper/instances/dev");
function privateJson(path: string) {
  const s = statSync(path);
  if (!s.isFile() || s.mode & 0o077 || s.uid !== process.getuid?.())
    throw Error("PRIVATE_FILE_REQUIRED");
  return JSON.parse(readFileSync(path, "utf8"));
}
const candidate = privateJson(
  join(base, "candidates/business-partner-package", candidateHash + ".json"),
);
if (sha256(canonicalBytes(candidate)) !== candidateHash)
  throw Error("CANDIDATE_CHANGED");
const configuration = privateJson(
  join(base, "secrets/dev-publication-athyper/server.json"),
);
const credentials = privateJson(
  join(base, "secrets/dev-publication-athyper/client.json"),
);
if (configuration.tenantId !== "11111111-1111-4111-8111-111111111111")
  throw Error("ATHYPER_ONLY");
if (
  execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "com.docker.compose.project"}}',
      "athyper-dev-source-worker-1",
    ],
    { encoding: "utf8" },
  ).trim() !== "athyper-dev-source"
)
  throw Error("DEV_WORKER_REQUIRED");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
if (!/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host))
  throw Error("LOCAL_DATABASE_REQUIRED");
const password = readFileSync(
  join(base, "secrets/postgres-password"),
  "utf8",
).trim();
const databaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/athyper_neon`;
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "-w",
    process.cwd(),
    "athyper-dev-source-worker-1",
    "/bin/sh",
    join(process.cwd(), "deploy/compose/instance/scripts/start-runtime.sh"),
    "adopt-dev-business-partner",
  ],
  {
    input: JSON.stringify({
      candidateHash,
      candidate,
      configuration,
      credentials,
      databaseUrl,
      apply: args.includes("--apply"),
    }),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  },
);
// Only structured, explicitly allowlisted runner output crosses this boundary.
for (const line of result.stdout.split("\n"))
  if (line.startsWith("BP_ADOPTION ")) console.log(line.slice(12));
if (result.status !== 0) {
  console.error("DEV adoption failed; no success is implied.");
  process.exitCode = 1;
}
