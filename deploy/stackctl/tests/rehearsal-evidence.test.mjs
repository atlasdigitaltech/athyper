import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultRepoRoot } from "../src/io.mjs";
import {
  recordPreMigrationBackupEvidence,
  recordRestoreDrillEvidence,
} from "../src/rehearsal-evidence.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "athyper-rehearsal-evidence-"));
  const files = [
    ["postgres-globals.sql", "globals\n"],
    ["athyper_iam.dump", "iam\n"],
    ["athyper_neon.dump", "neon\n"],
    ["athyper_mesh.dump", "mesh\n"],
    ["athyper_studio.dump", "studio\n"],
  ];
  for (const [name, value] of files) writeFileSync(join(root, name), value, { mode: 0o600 });
  const artifact = ([file, value]) => ({ file, sha256: digest(value), sizeBytes: Buffer.byteLength(value) });
  const manifest = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StackBackup",
    metadata: { instance: "stg", id: "20260821T123456Z" },
    spec: {
      createdAt: "2026-08-21T12:34:56.000Z",
      project: "athyper-stg",
      sourceRevision: "a".repeat(40),
      database: {
        format: "postgres-custom-per-database",
        globals: artifact(files[0]),
        dumps: files.slice(1).map(([file, value]) => ({
          ...artifact([file, value]),
          database: file.slice(0, -5),
        })),
      },
    },
  };
  const manifestPath = join(root, "backup.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { root, manifestPath };
}

test("controller backup and restore receipts become checksum-linked STAGING evidence", () => {
  const { root, manifestPath } = fixture();
  const backupEvidencePath = join(root, "pre-migration-backup.json");
  const backup = recordPreMigrationBackupEvidence(defaultRepoRoot, manifestPath, backupEvidencePath);
  assert.equal(backup.spec.database.format, "postgres-directory");
  assert.match(backup.spec.database.sha256, /^[a-f0-9]{64}$/u);
  const project = "athyper-stg-restore-20260821t123456z";
  const volume = `${project}_db-data`;
  const command = (arguments_) => ({ program: "docker", arguments: arguments_, status: 0 });
  const restoreReceipt = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StackOperationReceipt",
    metadata: { instance: "stg", id: "20260821T130000Z-restore" },
    spec: {
      operation: "restore",
      status: "succeeded",
      project: "athyper-stg",
      startedAt: "2026-08-21T13:00:00.000Z",
      completedAt: "2026-08-21T13:01:00.000Z",
      sourceRevision: "a".repeat(40),
      commands: [
        command(["compose", "--project-name", project, "exec", "db", "sh", "-ec", "postgres-globals.sql ON_ERROR_STOP=1"]),
        ...["athyper_iam", "athyper_neon", "athyper_mesh", "athyper_studio"].map((database) => command(["compose", "--project-name", project, "exec", "db", "pg_restore", database])),
        command(["compose", "--project-name", project, "exec", "db", "psql", "SELECT 1"]),
        command(["compose", "--project-name", project, "down", "--remove-orphans"]),
        command(["volume", "inspect", volume]),
      ],
      artifacts: { operator: "test", backupId: "20260821T123456Z", restoreProject: project, restoreVolume: volume },
      rollback: { attempted: false, succeeded: false },
    },
  };
  const restoreReceiptPath = join(root, "restore-receipt.json");
  writeFileSync(restoreReceiptPath, `${JSON.stringify(restoreReceipt)}\n`, { mode: 0o600 });
  const restoreEvidencePath = join(root, "restore-drill.json");
  const restore = recordRestoreDrillEvidence(defaultRepoRoot, manifestPath, backupEvidencePath, restoreReceiptPath, restoreEvidencePath);
  assert.equal(restore.spec.backupSha256, backup.spec.database.sha256);
  assert.equal(restore.spec.targetProject, project);
  assert.equal(restore.spec.checks.length, 6);
  assert.equal(JSON.parse(readFileSync(restoreEvidencePath, "utf8")).kind, "RestoreDrillReceipt");
});

test("backup evidence refuses artifact drift", () => {
  const { root, manifestPath } = fixture();
  writeFileSync(join(root, "athyper_neon.dump"), "tampered\n", { mode: 0o600 });
  assert.throws(
    () => recordPreMigrationBackupEvidence(defaultRepoRoot, manifestPath, join(root, "evidence.json")),
    /integrity failed/u,
  );
});
