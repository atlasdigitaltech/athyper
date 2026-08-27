import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { createValidator } from "./schema.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function atomicEvidence(path, document) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function verifiedBackup(repoRoot, manifestPath) {
  const validate = createValidator(repoRoot);
  const manifest = validate(readJson(manifestPath), manifestPath);
  if (manifest.kind !== "StackBackup" || manifest.metadata.instance !== "stg") {
    throw new Error("STAGING evidence accepts only a controller-owned STG StackBackup");
  }
  if (!/^[a-f0-9]{40}$/u.test(manifest.spec.sourceRevision)
    || /^0{40}$/u.test(manifest.spec.sourceRevision)) {
    throw new Error("STAGING backup must carry an immutable source revision");
  }
  const root = dirname(manifestPath);
  const artifacts = [manifest.spec.database.globals, ...manifest.spec.database.dumps]
    .map((item) => {
      if (basename(item.file) !== item.file) throw new Error(`Backup artifact path is unsafe: ${item.file}`);
      const path = join(root, item.file);
      const bytes = readFileSync(path);
      const digest = sha256(bytes);
      if (!bytes.length || bytes.length !== item.sizeBytes || digest !== item.sha256) {
        throw new Error(`Backup artifact integrity failed: ${item.file}`);
      }
      return { file: item.file, sha256: digest, sizeBytes: bytes.length };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
  const aggregate = Buffer.from(artifacts
    .map(({ file, sha256: digest, sizeBytes }) => `${file}\0${sizeBytes}\0${digest}\n`)
    .join(""), "utf8");
  return {
    manifest,
    artifacts,
    aggregateSha256: sha256(aggregate),
    aggregateSizeBytes: artifacts.reduce((total, item) => total + item.sizeBytes, 0),
  };
}

export function recordPreMigrationBackupEvidence(repoRoot, manifestPath, outputPath) {
  const validate = createValidator(repoRoot);
  const verified = verifiedBackup(repoRoot, manifestPath);
  const evidence = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "PreMigrationBackupReceipt",
    metadata: { instance: "stg" },
    spec: {
      createdAt: verified.manifest.spec.createdAt,
      sourceRevision: verified.manifest.spec.sourceRevision,
      database: {
        sha256: verified.aggregateSha256,
        sizeBytes: verified.aggregateSizeBytes,
        format: "postgres-directory",
      },
    },
  };
  validate(evidence, outputPath);
  atomicEvidence(outputPath, evidence);
  return evidence;
}

export function recordRestoreDrillEvidence(repoRoot, manifestPath, backupEvidencePath, restoreReceiptPath, outputPath) {
  const validate = createValidator(repoRoot);
  const verified = verifiedBackup(repoRoot, manifestPath);
  const backupEvidence = validate(readJson(backupEvidencePath), backupEvidencePath);
  const restore = validate(readJson(restoreReceiptPath), restoreReceiptPath);
  if (backupEvidence.kind !== "PreMigrationBackupReceipt" || backupEvidence.metadata.instance !== "stg") {
    throw new Error("Restore drill requires STAGING pre-migration backup evidence");
  }
  if (backupEvidence.spec.database.sha256 !== verified.aggregateSha256) {
    throw new Error("Pre-migration evidence no longer matches the verified backup artifacts");
  }
  if (restore.kind !== "StackOperationReceipt"
    || restore.metadata.instance !== "stg"
    || restore.spec.operation !== "restore"
    || restore.spec.status !== "succeeded") {
    throw new Error("Restore drill requires a successful controller-owned STG restore receipt");
  }
  if (restore.spec.artifacts.backupId !== verified.manifest.metadata.id) {
    throw new Error("Restore receipt consumed a different backup ID");
  }
  const project = restore.spec.artifacts.restoreProject;
  const volume = restore.spec.artifacts.restoreVolume;
  if (!/^athyper-stg-restore-[a-z0-9][a-z0-9-]+$/u.test(project)
    || volume !== `${project}_db-data`) {
    throw new Error("Restore receipt did not target the isolated retained STAGING restore volume");
  }
  const successful = restore.spec.commands.filter(({ status }) => status === 0)
    .map(({ arguments: values }) => values.join(" "));
  const restoredDatabases = successful.filter((line) => line.includes(" pg_restore ")).length;
  const globalsRestored = successful.some((line) => line.includes("postgres-globals.sql") && line.includes("ON_ERROR_STOP=1"));
  const queryPassed = successful.some((line) => line.includes("SELECT 1"));
  const volumeInspected = successful.some((line) => line.startsWith("volume inspect ") && line.includes(volume));
  const isolatedProjectStopped = successful.some((line) => line.includes(`--project-name ${project}`) && line.endsWith("down --remove-orphans"));
  if (restoredDatabases !== 4 || !globalsRestored || !queryPassed || !volumeInspected || !isolatedProjectStopped) {
    throw new Error("Restore receipt is missing required database, query, volume, or isolation checks");
  }
  const evidence = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "RestoreDrillReceipt",
    metadata: { instance: "stg" },
    spec: {
      restoredAt: restore.spec.completedAt,
      backupSha256: verified.aggregateSha256,
      targetProject: project,
      checks: [
        { id: "backup-integrity-reverified", passed: true },
        { id: "postgres-globals-restored", passed: true },
        { id: "four-databases-restored", passed: true },
        { id: "post-restore-query-passed", passed: true },
        { id: "restore-volume-retained", passed: true },
        { id: "restore-project-stopped", passed: true },
      ],
    },
  };
  validate(evidence, outputPath);
  atomicEvidence(outputPath, evidence);
  return evidence;
}
