/**
 * Database Backup Worker  (I-07 — automated pg_dump)
 *
 * Queue:    jobs-backup
 * Job name: pg-dump
 *
 * Schedule: driven exclusively by control.cron_schedule (DB-managed).
 *           Default seed: daily at 02:00 UTC (see
 *           server/db/sql/900_seed_data/010_system/002_control/
 *           013_platform_cron_backup.sql).
 *           Ops can change frequency / pause / re-enable without a deploy.
 *
 * What it does:
 *   1. Spawns `pg_dump --format=custom` against DATABASE_ADMIN_URL
 *      (direct connection — bypasses PgBouncer; correct for pg_dump).
 *   2. Compresses with gzip (level 6).
 *   3. Uploads to object storage at key:
 *        db-snapshots/YYYY-MM-DDTHH-MM-SS-sssZ.pgdump.gz
 *   4. Prunes objects older than BACKUP_RETENTION_DAYS (default 30).
 *
 * Prerequisites:
 *   - `postgresql-client` package installed in the container image
 *     (see Dockerfile.dev: `apk add --no-cache postgresql-client`).
 *   - BACKUP_S3_BUCKET env var set to the target bucket name.
 *   - DATABASE_ADMIN_URL env var — full connection string including credentials.
 *   - backupStorage dep wired in createJobsService() by the runtime bootstrap.
 *
 * Concurrency: 1 — backups must not overlap (lock_key in cron_schedule row).
 */

import { Worker } from "bullmq";
import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import type { ConnectionOptions } from "bullmq";
import { QUEUE_NAME, JOB_NAME, type DbBackupJobData, type JobLogger } from "../jobs.types.js";

// ─── Storage interface ────────────────────────────────────────────────────────

export interface BackupObjectStorage {
  put(key: string, body: Buffer, opts?: { contentType?: string }): Promise<void>;
  list(prefix: string): Promise<Array<{ key: string; lastModified: Date }>>;
  delete(key: string): Promise<void>;
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export interface BackupWorkerDeps {
  connection:    ConnectionOptions;
  backupStorage: BackupObjectStorage;
  logger?:       JobLogger;
}

export function createBackupWorker({ connection, backupStorage, logger }: BackupWorkerDeps): Worker<DbBackupJobData> {
  return new Worker<DbBackupJobData>(
    QUEUE_NAME.BACKUP,
    async (job) => {
      const databaseUrl   = job.data.databaseUrl ?? process.env["DATABASE_ADMIN_URL"];
      const bucket        = job.data.bucket       ?? process.env["BACKUP_S3_BUCKET"] ?? "athyper-backups";
      const retentionDays = Number(process.env["BACKUP_RETENTION_DAYS"] ?? "30");

      if (!databaseUrl) {
        throw new Error("backup: DATABASE_ADMIN_URL is not set — cannot run pg_dump");
      }

      const ts  = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
      const key = `db-snapshots/${ts}.pgdump.gz`;

      logger?.info("backup_start", { key, bucket, retentionDays });

      // ── 1. pg_dump | gzip ─────────────────────────────────────────────────
      const dumpedBuffer = await runPgDump(databaseUrl, logger);

      // ── 2. Upload to object storage ───────────────────────────────────────
      await backupStorage.put(key, dumpedBuffer, { contentType: "application/octet-stream" });
      logger?.info("backup_uploaded", { key, sizeBytes: dumpedBuffer.byteLength });

      // ── 3. Prune old backups ──────────────────────────────────────────────
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      const objects = await backupStorage.list("db-snapshots/");
      let pruned = 0;
      for (const obj of objects) {
        if (obj.lastModified < cutoff) {
          await backupStorage.delete(obj.key);
          logger?.info("backup_pruned", { key: obj.key });
          pruned++;
        }
      }

      logger?.info("backup_complete", { key, sizeBytes: dumpedBuffer.byteLength, pruned, retentionDays });
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 50 },
    },
  );
}

// ─── pg_dump helper ───────────────────────────────────────────────────────────

function runPgDump(databaseUrl: string, logger?: JobLogger): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // --format=custom: compressed, selective-restore capable
    // --compress=0: we apply gzip ourselves for streaming control
    // --no-password: credentials are embedded in the connection URL
    const dump = spawn(
      "pg_dump",
      ["--format=custom", "--compress=0", "--no-password", databaseUrl],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const gzip   = createGzip({ level: 6 });
    const chunks: Buffer[] = [];

    dump.stdout.pipe(gzip);

    gzip.on("data", (chunk: Buffer) => { chunks.push(chunk); });

    let stderrBuf = "";
    dump.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });

    dump.on("error", (err) => {
      logger?.error("backup_spawn_error", { err: err.message });
      reject(err);
    });

    dump.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${stderrBuf.trim()}`));
      }
    });

    gzip.on("error", (err) => {
      logger?.error("backup_gzip_error", { err: err.message });
      reject(err);
    });

    gzip.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
