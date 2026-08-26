import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultRepoRoot } from "../src/io.mjs";
import { executeStackOperation } from "../src/execution.mjs";

const fixedDate = new Date("2026-08-21T12:34:56.000Z");

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "athyper-stackctl-"));
  const secretRoot = join(root, "platform", "secrets");
  mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
  for (const name of ["tls.crt", "tls.key"]) {
    const path = join(secretRoot, name);
    writeFileSync(path, "fixture\n", { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  const calls = [];
  const run = (program, args) => {
    calls.push({ program, args });
    if (options.platformObjects && args[0] === "ps" && args.includes("label=com.docker.compose.project=athyper-platform")) {
      return { ok: true, status: 0, stdout: "existing-platform-container" };
    }
    if (options.failInstanceUp && args.includes("athyper-dev") && args.includes("up")) {
      return { ok: false, status: 1, stderr: "fixture startup failure" };
    }
    const cpIndex = args.indexOf("cp");
    if (cpIndex >= 0 && args[cpIndex + 1]?.startsWith("db:/tmp/")) {
      writeFileSync(args[cpIndex + 2], `PostgreSQL fixture: ${args[cpIndex + 1]}\n`);
    }
    return { ok: true, status: 0, stdout: "" };
  };
  return {
    root,
    calls,
    dependencies: {
      runtimeRoot: root,
      now: () => fixedDate,
      sourceRevision: "1".repeat(40),
      operator: "test-operator",
      run,
      policy: () => ({ errors: [] }),
      gates: () => ({ gates: {
        machinePhaseStatus: { status: "pass", problems: [] },
        coldStart: { status: "pass", problems: [] },
        stackV1Disposition: { status: "pass", problems: [] },
        stackV1ExportIntake: { status: "waived-clean-slate", problems: [] },
        stackV1Restore: { status: "waived-clean-slate", problems: [] },
      } }),
      plan: () => ({ blockers: [], services: [{ id: "db-migration" }], sources: { platformCompose: join(defaultRepoRoot, "deploy/compose/platform/compose.yaml") } }),
    },
  };
}

test("up starts platform before instance and writes an ownership receipt", () => {
  const context = fixture();
  const receipt = executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies);
  assert.equal(receipt.spec.status, "succeeded");
  const invocations = context.calls.map(({ args }) => args.join(" "));
  assert.ok(invocations[0].includes("label=com.docker.compose.project=athyper-platform"));
  assert.ok(invocations[1].startsWith("network ls") && invocations[1].includes("athyper-platform"));
  assert.ok(invocations[2].includes("--project-name athyper-platform") && invocations[2].endsWith("config --quiet"));
  assert.ok(invocations[3].includes("--project-name athyper-dev") && invocations[3].endsWith("config --quiet"));
  assert.ok(invocations[4].includes("--project-name athyper-platform") && invocations[4].includes(" up "));
  assert.ok(invocations[5].includes("--project-name athyper-dev") && invocations[5].endsWith("up --detach --wait db"));
  assert.ok(invocations[6].includes("--project-name athyper-dev") && invocations[6].endsWith("run --rm db-init"));
  assert.ok(invocations[7].includes("--project-name athyper-dev") && invocations[7].endsWith("run --rm db-migration"));
  assert.ok(invocations[8].includes("--project-name athyper-dev") && invocations[8].includes("--remove-orphans"));
  const active = JSON.parse(readFileSync(join(context.root, "instances/dev/receipts/active.json"), "utf8"));
  assert.equal(active.spec.state, "running");
  assert.equal(active.spec.project, "athyper-dev");
  const platform = JSON.parse(readFileSync(join(context.root, "platform/receipts/active.json"), "utf8"));
  assert.equal(platform.spec.project, "athyper-platform");
  const migration = JSON.parse(readFileSync(join(context.root, "instances/dev/receipts/migration.json"), "utf8"));
  assert.match(migration.spec.ddlSha256, /^[a-f0-9]{64}$/u);
});

test("up failure rolls the instance back without stopping the platform", () => {
  const context = fixture({ failInstanceUp: true });
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies),
    /fixture startup failure/u,
  );
  const invocations = context.calls.map(({ args }) => args.join(" "));
  assert.ok(invocations.some((line) => line.includes("--project-name athyper-dev") && line.includes(" down ")));
  assert.ok(!invocations.some((line) => line.includes("--project-name athyper-platform") && line.includes(" down ")));
  const receiptPath = join(context.root, "instances/dev/receipts/20260821T123456Z-up.json");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.spec.status, "rolled-back");
  assert.deepEqual(receipt.spec.rollback, { attempted: true, succeeded: true });
});

test("DEV preserved-database up validates the existing migration receipt and skips clean-slate migration", () => {
  const context = fixture();
  const receiptDirectory = join(context.root, "instances/dev/receipts");
  mkdirSync(receiptDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(join(receiptDirectory, "migration.json"), `${JSON.stringify({
    apiVersion: "athyper.io/v1alpha1",
    kind: "FoundationMigrationReceipt",
    metadata: { instance: "dev" },
    spec: {
      project: "athyper-dev",
      completedAt: fixedDate.toISOString(),
      sourceRevision: "1".repeat(40),
      ddlSha256: "2".repeat(64),
      mode: "fresh-database-foundation",
    },
  })}\n`, { mode: 0o600 });

  const receipt = executeStackOperation(defaultRepoRoot, "up", "dev", {
    confirm: "dev",
    preserveDatabase: true,
  }, context.dependencies);
  const invocations = context.calls.map(({ args }) => args.join(" "));
  assert.equal(receipt.spec.status, "succeeded");
  assert.equal(receipt.spec.artifacts.migrationMode, "preserved-existing-database");
  assert.ok(invocations.some((line) => line.endsWith("run --rm db-init")));
  assert.ok(!invocations.some((line) => line.endsWith("run --rm db-migration")));
});

test("preserved-database up refuses an absent migration receipt", () => {
  const context = fixture();
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", {
      confirm: "dev",
      preserveDatabase: true,
    }, context.dependencies),
    /requires an existing migration receipt/u,
  );
  assert.deepEqual(context.calls, []);
});

test("down is receipt-owned and retains Docker volumes", () => {
  const context = fixture();
  executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies);
  const receipt = executeStackOperation(defaultRepoRoot, "down", "dev", { confirm: "dev" }, context.dependencies);
  assert.equal(receipt.spec.status, "succeeded");
  const command = context.calls.at(-1).args;
  assert.ok(command.includes("down"));
  assert.ok(!command.includes("--volumes"));
  const active = JSON.parse(readFileSync(join(context.root, "instances/dev/receipts/active.json"), "utf8"));
  assert.equal(active.spec.state, "stopped");
});

test("backup is checksummed and restore targets a new retained volume", () => {
  const context = fixture();
  executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies);
  const backupReceipt = executeStackOperation(defaultRepoRoot, "backup", "dev", { confirm: "dev" }, context.dependencies);
  assert.equal(backupReceipt.spec.artifacts.backupId, "20260821T123456Z");
  const manifestPath = join(context.root, "backups/dev/20260821T123456Z/backup.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.spec.database.dumps.length, 4);
  assert.match(manifest.spec.database.globals.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(manifest.spec.database.dumps.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256)));

  const restoreReceipt = executeStackOperation(defaultRepoRoot, "restore", "dev", {
    confirm: "dev",
    backupId: "20260821T123456Z",
    confirmRestore: "20260821T123456Z",
  }, context.dependencies);
  assert.equal(restoreReceipt.spec.status, "succeeded");
  assert.match(restoreReceipt.spec.artifacts.restoreProject, /^athyper-dev-restore-/u);
  assert.match(restoreReceipt.spec.artifacts.restoreVolume, /_db-data$/u);
  const restoreCommands = restoreReceipt.spec.commands.map(({ arguments: args }) => args.join(" "));
  assert.ok(restoreCommands.some((line) => line.includes(" up ") && line.endsWith(" db")));
  const globalsCopy = restoreCommands.findIndex((line) => line.includes("postgres-globals.sql db:/tmp/postgres-globals.sql"));
  const globalsRestore = restoreCommands.findIndex((line) => line.includes("sed '/^CREATE ROLE postgres;$/d'") && line.includes("ON_ERROR_STOP=1"));
  const databaseInit = restoreCommands.findIndex((line) => line.endsWith("run --rm db-init"));
  const firstDatabaseRestore = restoreCommands.findIndex((line) => line.includes(" pg_restore "));
  assert.ok(globalsCopy >= 0);
  assert.ok(globalsCopy < globalsRestore);
  assert.ok(globalsRestore < databaseInit);
  assert.ok(databaseInit < firstDatabaseRestore);
  assert.equal(restoreCommands.filter((line) => line.includes(" pg_restore ")).length, 4);
  assert.ok(restoreCommands.some((line) => line.includes(" rm -f ") && line.includes("postgres-globals.sql")));
  assert.ok(restoreCommands.some((line) => line.includes(" down --remove-orphans")));
  assert.ok(restoreCommands.every((line) => !line.includes("--volumes")));
});

test("mutations require exact explicit confirmation before Docker execution", () => {
  const context = fixture();
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "qa" }, context.dependencies),
    /--confirm dev/u,
  );
  assert.deepEqual(context.calls, []);
});

test("up refuses to adopt an existing platform project without its receipt", () => {
  const context = fixture({ platformObjects: true });
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies),
    /No controller ownership receipt exists for athyper-platform/u,
  );
  assert.ok(!context.calls.some(({ args }) => args.includes("up")));
});

test("up cannot bypass an absent application migration runner", () => {
  const context = fixture();
  context.dependencies.plan = () => ({
    blockers: [],
    services: [{ id: "api" }],
    sources: { platformCompose: join(defaultRepoRoot, "deploy/compose/platform/compose.yaml") },
  });
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies),
    /cannot bypass the migration gate/u,
  );
  assert.deepEqual(context.calls, []);
});

test("a global controller lock rejects concurrent mutations", () => {
  const context = fixture();
  mkdirSync(join(context.root, "locks/stackctl-operation.lock"), { recursive: true, mode: 0o700 });
  assert.throws(
    () => executeStackOperation(defaultRepoRoot, "up", "dev", { confirm: "dev" }, context.dependencies),
    /Another stackctl mutation holds/u,
  );
  assert.deepEqual(context.calls, []);
});
