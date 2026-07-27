/**
 * Stale Lock Worker
 *
 * Queue:    jobs-stale-lock
 * Schedule: every STALE_LOCK_SWEEP_MS (default 5 min)
 * Job name: stale-lock-sweep
 *
 * Deletes expired rows from control.record_edit_lock.
 * Locks expire when expires_at < now() and the heartbeat has stopped
 * (user closed the tab, lost connectivity, session timed out, etc.).
 *
 * The acquire transaction also evicts the single expired row it encounters
 * as an opportunistic fast-path. This sweep handles bulk cleanup when
 * multiple locks expire between sweeps (e.g., after a server restart).
 *
 * Concurrency: 1 — single sweep at a time to avoid redundant deletes.
 */

import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import { QUEUE_NAME, JOB_NAME, type JobLogger } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

export interface StaleLockWorkerDeps {
  db:          DB;
  connection:  ConnectionOptions;
  logger?:     JobLogger;
}

export function createStaleLockWorker({ db, connection, logger }: StaleLockWorkerDeps): Worker {
  return new Worker(
    QUEUE_NAME.STALE_LOCK,
    async (job) => {
      if (job.name !== JOB_NAME.STALE_LOCK_SWEEP) return;

      const result = await sql<{ count: string }>`
        WITH deleted AS (
          DELETE FROM control.record_edit_lock
           WHERE expires_at < now()
          RETURNING id
        )
        SELECT count(*)::text AS count FROM deleted
      `.execute(db);

      const count = parseInt(result.rows[0]?.count ?? "0", 10);
      if (count > 0) {
        logger?.info("stale_lock_sweep_evicted", { count });
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );
}
