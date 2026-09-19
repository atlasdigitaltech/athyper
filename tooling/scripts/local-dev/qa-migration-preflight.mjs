/** Rehearse pending transactional migrations against retained QA, then roll back. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { qaProject } from "./qa-runtime.mjs";
const root = resolve(import.meta.dirname, "../../../server/db/migrations");
const run = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const project = qaProject();
const c = JSON.parse(run(["inspect", `${project}-db-1`]))[0];
if (
  c.Config.Labels["com.docker.compose.project"] !== project ||
  !c.State.Running
)
  throw new Error("Running QA database required");
const directory = join(
  homedir(),
  ".athyper/qualification/migrations",
  String(Date.now()),
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const receipt = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  environment: "qa",
  databaseContainer: c.Id,
  mode: "transaction-rollback-rehearsal",
  releaseQualified: false,
  planes: [],
};
for (const plane of ["studio", "neon", "mesh"]) {
  const ledger = () =>
    run([
      "exec",
      c.Id,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      `athyper_${plane}`,
      "-Atc",
      "SELECT row_to_json(m) FROM public.athyper_schema_migration_v1 m ORDER BY migration_name",
    ]);
  const before = ledger();
  const applied = new Set(
    before
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s))
      .filter((m) => m.status === "applied")
      .map((m) => m.migration_name),
  );
  const names = readFileSync(join(root, "manifests", `${plane}.txt`), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#") && !applied.has(s));
  const migrations = [];
  const statements = names.map((name) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name))
      throw new Error("Unsafe migration path");
    const source = readFileSync(join(root, name), "utf8");
    if (
      (source.match(/^BEGIN;\s*$/gm) ?? []).length > 1 ||
      (source.match(/^COMMIT;\s*$/gm) ?? []).length > 1 ||
      (source.match(/^BEGIN;\s*$/gm) ?? []).length !==
        (source.match(/^COMMIT;\s*$/gm) ?? []).length
    )
      throw new Error(
        `Explicit single-transaction migration required: ${name}`,
      );
    migrations.push({
      name,
      sha256: createHash("sha256").update(source).digest("hex"),
    });
    return `\\echo ${plane}/${name}\n${source.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "")}`;
  });
  const source = `BEGIN; SET LOCAL app.database_plane='${plane}';\n${statements.join("\n")}\nROLLBACK;`;
  let passed = false,
    failure = null;
  try {
    const output = run(
      [
        "exec",
        "-i",
        c.Id,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: source },
    );
    writeFileSync(join(directory, `${plane}.log`), output, { mode: 0o600 });
    passed = true;
  } catch (error) {
    const output = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? error.message;
    writeFileSync(join(directory, `${plane}.log`), `${output}\n${stderr}`, {
      mode: 0o600,
    });
    failure =
      stderr.split("\n").find((line) => line.startsWith("ERROR:")) ??
      "Rehearsal failed; see private log";
    process.exitCode = 1;
  }
  const ledgerUnchanged = before === ledger();
  if (!ledgerUnchanged) {
    passed = false;
    process.exitCode = 1;
    failure =
      "Migration ledger changed during rehearsal; investigate concurrent changes";
  }
  receipt.planes.push({ plane, passed, ledgerUnchanged, migrations, failure });
  console.log(
    `${plane}: ${passed ? `${names.length} pending migrations passed and rolled back` : failure}`,
  );
}
receipt.passed = receipt.planes.every((p) => p.passed);
writeFileSync(
  join(directory, "receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(`Migration rehearsal receipt: ${join(directory, "receipt.json")}`);
