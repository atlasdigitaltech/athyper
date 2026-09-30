/** Reproducible, bounded QA product grants. IAM users/MFA and releases are unchanged. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { qaProject } from "./qa-runtime.mjs";
process.umask(0o077);
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((a) => a !== "--apply"))
  throw Error("Use [--apply]; otherwise transactions roll back");
const project = qaProject();
if (!/^athyper-qa-candidate-[0-9]{13}$/.test(project))
  throw Error("Fresh isolated QA required");
const out = join(
  homedir(),
  ".athyper/qualification/qa-grants",
  String(Date.now()),
);
mkdirSync(out, { recursive: true, mode: 0o700 });
const results = [];
for (const [plane, path] of [
  [
    "studio",
    "server/db/scripts/operations/studio/provision-cirrusatlantic-publication-qa.sql",
  ],
  ["neon", "server/db/scripts/operations/provision-cirrusatlantic-bp-qa.sql"],
]) {
  const sql = readFileSync(resolve(path), "utf8");
  const log = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `${project}-db-1`,
      "psql",
      "-U",
      "postgres",
      "-d",
      `athyper_${plane}`,
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `apply=${apply}`,
    ],
    { input: sql, encoding: "utf8" },
  );
  writeFileSync(join(out, plane + ".log"), log, { mode: 0o600 });
  results.push({
    plane,
    source: path,
    sha256: createHash("sha256").update(sql).digest("hex"),
    passed: true,
  });
}
const receipt = {
  schema: "athyper.qa-journey-grants/1",
  project,
  applied: apply,
  iamChanged: false,
  releasesChanged: false,
  results,
};
writeFileSync(
  join(out, "receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify({ evidence: out, ...receipt }));
