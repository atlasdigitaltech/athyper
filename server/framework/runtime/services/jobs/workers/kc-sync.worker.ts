/**
 * KC Sync Worker — Sprint 38
 *
 * Queue: jobs-iam-kc-sync
 * Job:   kc-sync (no payload — reconciles all tenants in one pass)
 *
 * What it does:
 *   1. Fetches users from the Keycloak Admin REST API (paginated, BATCH_SIZE at a time).
 *   2. For each KC user that has a matching master.principal (matched by external_sub = KC user ID):
 *      - KC enabled  → local principal.status = 'ACTIVE'   (if currently SUSPENDED)
 *      - KC disabled → local principal.status = 'SUSPENDED' (if currently ACTIVE)
 *   3. New KC users without a local principal are skipped (JIT provisioning handles first login).
 *   4. Logs summary: synced, skipped, errors.
 *
 * Circuit breaker:
 *   After KC_BREAKER_THRESHOLD consecutive KC API failures the circuit opens for
 *   KC_BREAKER_OPEN_MS (default 10 min). Jobs that fire while the circuit is open
 *   are skipped immediately (BullMQ still removes them from the queue as completed).
 *
 * Keycloak admin credentials:
 *   The worker obtains a short-lived admin token via client-credentials grant from
 *   the configured realm's token endpoint. The token is re-fetched on each job run.
 *
 * Wiring:
 *   createJobsService() creates a Queue + Worker for IAM_KC_SYNC and schedules
 *   a recurring upsertJobScheduler every IAM_KC_SYNC_MS (default 900 000 ms / 15 min).
 *   The Worker is only created when kcAdminConfig is provided in JobsServiceDeps.
 */

import { Worker, Queue, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import type { Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  type KcSyncJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── KC Admin API types ───────────────────────────────────────────────────────

export interface KcAdminConfig {
  /** Base URL of the Keycloak server (e.g. https://auth.example.com) */
  baseUrl: string;
  /** Realm to sync users from */
  realm: string;
  /** Client ID with realm-management roles (view-users, manage-users) */
  clientId: string;
  /** Client secret for client-credentials grant */
  clientSecret: string;
}

interface KcUser {
  id:       string;  // KC user UUID (= external_sub in master.principal)
  username: string;
  email?:   string;
  enabled:  boolean;
}

interface TokenResponse {
  access_token: string;
  expires_in:   number;
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

const KC_BREAKER_THRESHOLD = 3;   // consecutive failures to open the circuit
const KC_BREAKER_OPEN_MS   = 600_000; // 10 min — stay open after trip
const BATCH_SIZE            = 100;    // KC users per page

let consecutiveFailures = 0;
let circuitOpenUntil    = 0;

function isCircuitOpen(): boolean {
  if (Date.now() < circuitOpenUntil) return true;
  return false;
}

function onKcSuccess(): void {
  consecutiveFailures = 0;
}

function onKcFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= KC_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + KC_BREAKER_OPEN_MS;
  }
}

// ─── KC Admin API helpers ─────────────────────────────────────────────────────

async function fetchAdminToken(cfg: KcAdminConfig): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/realms/${cfg.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const resp = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`KC token fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as TokenResponse;
  return data.access_token;
}

async function fetchKcUsersBatch(
  cfg:    KcAdminConfig,
  token:  string,
  first:  number,
): Promise<KcUser[]> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/admin/realms/${cfg.realm}/users?first=${first}&max=${BATCH_SIZE}&briefRepresentation=false`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    throw new Error(`KC users list failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json() as Promise<KcUser[]>;
}

// ─── Sync logic ───────────────────────────────────────────────────────────────

interface SyncResult {
  total:       number;
  synced:      number;
  skipped:     number;
  errors:      number;
}

async function reconcileUsers(
  db:     AnyDb,
  cfg:    KcAdminConfig,
  logger?: JobLogger,
): Promise<SyncResult> {
  const result: SyncResult = { total: 0, synced: 0, skipped: 0, errors: 0 };

  const token = await fetchAdminToken(cfg);

  let first = 0;
  while (true) {
    const batch = await fetchKcUsersBatch(cfg, token, first);
    if (batch.length === 0) break;

    result.total += batch.length;

    for (const kcUser of batch) {
      try {
        const targetStatus = kcUser.enabled ? "ACTIVE" : "SUSPENDED";
        const currentStatus = kcUser.enabled ? "SUSPENDED" : "ACTIVE"; // only update if different

        // Update principal if status differs — match by external_sub = KC user ID
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateResult = await (db as any)
          .updateTable("master.principal")
          .set({ status: targetStatus, updated_at: new Date() })
          .where("external_sub", "=", kcUser.id)
          .where("status", "=", currentStatus)
          .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

        const updated = Number(updateResult?.numUpdatedRows ?? 0);
        if (updated > 0) {
          result.synced++;
          logger?.info("kc_sync_principal_updated", {
            kc_user_id: kcUser.id,
            username:   kcUser.username,
            status:     targetStatus,
          });
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.errors++;
        logger?.warn("kc_sync_user_error", { kc_user_id: kcUser.id, err: String(err) });
      }
    }

    first += batch.length;
    if (batch.length < BATCH_SIZE) break; // last page
  }

  return result;
}

// ─── Job handler ──────────────────────────────────────────────────────────────

async function runSync(
  db:     AnyDb,
  cfg:    KcAdminConfig,
  logger?: JobLogger,
): Promise<void> {
  if (isCircuitOpen()) {
    logger?.warn("kc_sync_circuit_open", {
      open_until: new Date(circuitOpenUntil).toISOString(),
    });
    return;
  }

  try {
    const startedAt = Date.now();
    const result = await reconcileUsers(db, cfg, logger);
    onKcSuccess();

    logger?.info("kc_sync_complete", {
      ...result,
      duration_ms: Date.now() - startedAt,
      realm: cfg.realm,
    });
  } catch (err) {
    onKcFailure();
    logger?.error("kc_sync_error", {
      err:                String(err),
      consecutive_fails:  consecutiveFailures,
      circuit_open_until: circuitOpenUntil > Date.now()
        ? new Date(circuitOpenUntil).toISOString()
        : null,
    });
    throw err; // let BullMQ retry up to max attempts
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export interface KcSyncWorkerDeps {
  db:         AnyDb;
  kcAdmin:    KcAdminConfig;
  connection: ConnectionOptions;
  logger?:    JobLogger;
}

export function createKcSyncWorker(
  deps: KcSyncWorkerDeps,
): Worker<KcSyncJobData> {
  const { db, kcAdmin, connection, logger } = deps;

  return new Worker<KcSyncJobData>(
    QUEUE_NAME.IAM_KC_SYNC,
    async (_job: Job) => {
      await runSync(db, kcAdmin, logger);
    },
    {
      connection,
      concurrency: 1, // singleton — KC admin calls are serialized
    },
  );
}

// ─── Queue export ─────────────────────────────────────────────────────────────

export function createKcSyncQueue(connection: ConnectionOptions): Queue<KcSyncJobData> {
  return new Queue<KcSyncJobData>(QUEUE_NAME.IAM_KC_SYNC, { connection });
}
