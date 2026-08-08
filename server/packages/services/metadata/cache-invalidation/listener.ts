// Phase 5 — Three-Plane Permission Stack.
//
// Descriptor cache invalidation listener.
//
// Subscribes to two pg_notify channels:
//
//   `desc_invalidate` — published by the satellite-write triggers (Phase 1)
//                       and the Studio approve / emergency-override paths.
//                       Payload: { tenant_id, entity_code, reason, source, at }.
//                       We increment exact execution-descriptor generations.
//
//   `grant_revoke`    — published by mesh.account_grant revoke trigger
//                       (Phase 1). Payload: { grant_id, principal_id,
//                       account_id, tenant_id, fingerprint, new_status, at }.
//                       Permission-local runtime caches are invalidated; shared
//                       execution descriptors remain principal-agnostic.
//
// We also run a 30s poller against `event.descriptor_invalidation_outbox` for
// pending/failed rows. This is the fallback for missed
// notifications (LISTEN connection dropped, listener restarted, etc.).
// The poller uses a lease so multiple listener instances can recover safely.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import type pg from "pg";

import { createDirectPgClient } from "./direct-pg-client.js";
import {
  composeDescInvalidatePattern,
  composeExecutionDescriptorGenerationKey,
  composeExecutionDescriptorGenerationKeys,
  composeGrantRevokePattern,
} from "@athyper/svc-iam";
export {
  composeDescInvalidatePattern,
  composeExecutionDescriptorGenerationKey,
  composeExecutionDescriptorGenerationKeys,
  composeGrantRevokePattern,
} from "@athyper/svc-iam";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface DescriptorCacheRedis {
  incr(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
}

export interface DescriptorCacheLogDb {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface DescriptorCacheListenerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface CreateDescriptorCacheListenerOptions {
  redis: DescriptorCacheRedis;
  /** Polling-fallback connection. Reuses the pooled client for the durable event outbox. */
  logDb: DescriptorCacheLogDb;
  logger: DescriptorCacheListenerLogger;
  /** Override the env-resolved listen connection string (tests). */
  listenConnectionString?: string;
  /** Poll interval for the fallback scan. Defaults to 30s. */
  pollIntervalMs?: number;
  /** Reconnect delay after a LISTEN error. Defaults to 2s, capped at 30s. */
  reconnectInitialDelayMs?: number;
  /** Test seam for LISTEN reconnect coverage. */
  createListenClient?: () => Promise<pg.Client>;
  /** Test seam for reconnect backoff. */
  sleep?: (delayMs: number) => Promise<void>;
  /** @deprecated Generation invalidation no longer scans or deletes keys. */
  delBatchSize?: number;
}

export interface DescriptorCacheListener {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Runs one durable-log recovery pass (operational probe/tests). */
  recoverNow(): Promise<void>;
  /** For probes/tests: number of notifications processed since start. */
  readonly stats: () => Readonly<{
    notifications: number;
    pollerRuns: number;
    keysDeleted: number;
    generationsIncremented: number;
    errors: number;
    reconnects: number;
    invalidationLagSeconds: number;
    instanceId: string;
  }>;
}

// ─── Implementation ────────────────────────────────────────────────────────────

interface NotifyPayload {
  tenant_id?: string | null;
  entity_code?: string | null;
  reason?: string | null;
  source?: string | null;
  fingerprint?: string | null;
  account_id?: string | null;
  new_status?: string | null;
  principal_id?: string | null;
  at?: number | null;
  outbox_id?: string | null;
}

interface InvalidationLogRow {
  id: string;
  tenant_id: string | null;
  entity_code: string | null;
  plane_key: string | null;
  reason: string;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
}

const CHANNEL_DESC_INVALIDATE = "desc_invalidate";
const CHANNEL_GRANT_REVOKE    = "grant_revoke";
const RUNTIME_INVALIDATION_CHANNEL = "descriptor-runtime:invalidate:v1";
const RUNTIME_GENERATION_KEY = "descriptor-runtime:generation:v1";
const EXECUTION_DESCRIPTOR_INVALIDATION_CHANNEL = "execdesc:invalidate:v1";
const GLOBAL_SCOPE = "__all__";

export function createDescriptorCacheListener(
  options: CreateDescriptorCacheListenerOptions,
): DescriptorCacheListener {
  const { redis, logDb, logger } = options;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const reconnectInitialDelay = options.reconnectInitialDelayMs ?? 2_000;
  const instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  let listenClient: pg.Client | null = null;
  let pollerTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let reconnectDelay = reconnectInitialDelay;

  const counters = {
    notifications: 0,
    pollerRuns: 0,
    keysDeleted: 0,
    generationsIncremented: 0,
    errors: 0,
    reconnects: 0,
    invalidationLagSeconds: 0,
  };

  // ─── Redis helpers ────────────────────────────────────────────────────────────

  // ─── Log mark ─────────────────────────────────────────────────────────────────

  async function markProcessedById(id: string): Promise<void> {
    await logDb.query(
      `UPDATE event.descriptor_invalidation_outbox
          SET status       = 'completed',
              processed_at = now(),
              processed_by = $1,
              locked_at    = NULL,
              locked_by    = NULL,
              locked_until = NULL,
              last_error   = NULL
        WHERE id = $2 AND status IN ('pending','processing','failed')`,
      [instanceId, id],
    );
  }

  async function markFailedById(id: string, error: unknown): Promise<void> {
    await logDb.query(
      `UPDATE event.descriptor_invalidation_outbox
          SET status       = CASE WHEN attempts >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
              available_at = CASE WHEN attempts >= max_attempts THEN available_at ELSE now() + interval '30 seconds' END,
              locked_at    = NULL,
              locked_by    = NULL,
              locked_until = NULL,
              last_error   = left($1, 2048)
        WHERE id = $2 AND status = 'processing'`,
      [String(error), id],
    );
  }

  // ─── Notification handler ────────────────────────────────────────────────────

  async function onDescInvalidate(payload: NotifyPayload): Promise<void> {
    try {
      counters.invalidationLagSeconds = lagSeconds(payload.at);
      const incremented = await incrementDescriptorGenerations(
        payload.tenant_id ?? null,
        payload.entity_code ?? null,
        null,
        payload.reason ?? "metadata_publication",
      );
      await publishRuntimeInvalidation({
        ...(payload.tenant_id ? { tenant: payload.tenant_id } : {}),
        ...(payload.entity_code ? { entity: payload.entity_code } : {}),
        reason: payload.reason ?? "metadata_publication",
      });
      if (payload.outbox_id) await markProcessedById(payload.outbox_id);
      counters.notifications += 1;
      logger.info("cache_invalidation_processed", {
        channel: CHANNEL_DESC_INVALIDATE,
        reason: payload.reason ?? null,
        source: payload.source ?? null,
        generations_incremented: incremented,
        keys_deleted: 0,
      });
    } catch (err) {
      counters.errors += 1;
      logger.warn("cache_invalidation_purge_failed", {
        channel: CHANNEL_DESC_INVALIDATE,
        err: String(err),
      });
    }
  }

  async function onGrantRevoke(payload: NotifyPayload): Promise<void> {
    try {
      await publishRuntimeInvalidation({
        ...(payload.tenant_id ? { tenant: payload.tenant_id } : {}),
        ...(payload.principal_id ? { principal: payload.principal_id } : {}),
        reason: "permission_change",
      });
      counters.notifications += 1;
      logger.info("cache_invalidation_processed", {
        channel: CHANNEL_GRANT_REVOKE,
        new_status: payload.new_status ?? null,
        account_id: payload.account_id ?? null,
        keys_deleted: 0,
      });
    } catch (err) {
      counters.errors += 1;
      logger.warn("cache_invalidation_purge_failed", {
        channel: CHANNEL_GRANT_REVOKE,
        err: String(err),
      });
    }
  }

  async function publishRuntimeInvalidation(scope: Record<string, string>): Promise<void> {
    const generation = await redis.incr(RUNTIME_GENERATION_KEY);
    await redis.publish(RUNTIME_INVALIDATION_CHANNEL, JSON.stringify({
      ...scope,
      generation,
      emittedAt: Date.now(),
      origin: instanceId,
    }));
  }

  async function incrementDescriptorGenerations(
    tenant: string | null,
    entity: string | null,
    plane: string | null,
    reason: string,
  ): Promise<number> {
    const keys = composeExecutionDescriptorGenerationKeys(tenant, entity, plane);
    for (const key of keys) {
      const planeKey = key.split(":")[3] ?? GLOBAL_SCOPE;
      const generation = await redis.incr(key);
      counters.generationsIncremented += 1;
      await redis.publish(EXECUTION_DESCRIPTOR_INVALIDATION_CHANNEL, JSON.stringify({
        plane: planeKey,
        ...(tenant ? { tenant } : {}),
        ...(entity ? { entity } : {}),
        generation,
        reason,
        emittedAt: Date.now(),
        origin: instanceId,
      }));
    }
    return keys.length;
  }

  // ─── LISTEN bootstrap + reconnect ─────────────────────────────────────────────

  async function attach(): Promise<void> {
    const client = options.createListenClient
      ? await options.createListenClient()
      : await createDirectPgClient({
        connectionString: options.listenConnectionString,
        applicationName: `athyper-cache-listener-${instanceId}`,
      });
    listenClient = client;

    client.on("error", (err) => {
      counters.errors += 1;
      logger.error("cache_invalidation_listener_error", { err: String(err) });
      // Schedule reconnect.
      void scheduleReconnect();
    });

    client.on("notification", (msg) => {
      const payload = safeParseJson(msg.payload);
      if (msg.channel === CHANNEL_DESC_INVALIDATE) void onDescInvalidate(payload);
      else if (msg.channel === CHANNEL_GRANT_REVOKE) void onGrantRevoke(payload);
    });

    await client.query(`LISTEN ${CHANNEL_DESC_INVALIDATE}`);
    await client.query(`LISTEN ${CHANNEL_GRANT_REVOKE}`);
    reconnectDelay = reconnectInitialDelay;
    logger.info("cache_invalidation_listener_attached", { instance: instanceId });
  }

  async function scheduleReconnect(): Promise<void> {
    if (stopped) return;
    try { await listenClient?.end(); } catch { /* ignore */ }
    listenClient = null;

    const delay = Math.min(reconnectDelay, 30_000);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    counters.reconnects += 1;
    logger.warn("cache_invalidation_listener_reconnecting", { delay_ms: delay });
    await (options.sleep?.(delay) ?? new Promise((resolve) => setTimeout(resolve, delay)));
    if (stopped) return;
    try {
      await attach();
    } catch (err) {
      logger.error("cache_invalidation_listener_reattach_failed", { err: String(err) });
      void scheduleReconnect();
    }
  }

  // ─── Poller fallback ──────────────────────────────────────────────────────────

  async function runPollerOnce(): Promise<void> {
    counters.pollerRuns += 1;
    try {
      const result = await logDb.query<InvalidationLogRow>(
        `WITH candidates AS (
           SELECT id
             FROM event.descriptor_invalidation_outbox
            WHERE status IN ('pending','failed')
              AND available_at <= now()
              AND attempts < max_attempts
            ORDER BY available_at, created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 200
         )
         UPDATE event.descriptor_invalidation_outbox AS work
            SET status       = 'processing',
                attempts     = work.attempts + 1,
                locked_at    = now(),
                locked_by    = $1,
                locked_until = now() + interval '60 seconds'
           FROM candidates
          WHERE work.id = candidates.id
         RETURNING work.id, work.tenant_id, work.entity_code, work.plane_key,
                   work.reason, work.source_table, work.source_id, work.created_at`,
        [instanceId],
      );
      for (const row of result.rows) {
        try {
          counters.invalidationLagSeconds = lagSeconds(row.created_at);
          const isPermissionOnly = row.plane_key === "mesh" && !row.entity_code;
          if (!isPermissionOnly) {
            await incrementDescriptorGenerations(row.tenant_id, row.entity_code, row.plane_key, row.reason);
          }
          await publishRuntimeInvalidation({
            ...(row.tenant_id ? { tenant: row.tenant_id } : {}),
            ...(row.plane_key ? { plane: row.plane_key } : {}),
            ...(row.entity_code ? { entity: row.entity_code } : {}),
            reason: row.reason,
          });
          await markProcessedById(row.id);
        } catch (err) {
          counters.errors += 1;
          await markFailedById(row.id, err).catch(() => undefined);
          logger.warn("cache_invalidation_poller_row_failed", {
            id: row.id, err: String(err),
          });
        }
      }
      if (result.rows.length > 0) {
        logger.info("cache_invalidation_poller_drained", { count: result.rows.length });
      }
    } catch (err) {
      counters.errors += 1;
      logger.error("cache_invalidation_poller_failed", { err: String(err) });
    }
  }

  function schedulePoller(): void {
    if (stopped) return;
    pollerTimer = setTimeout(async () => {
      await runPollerOnce();
      schedulePoller();
    }, pollIntervalMs);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  async function start(): Promise<void> {
    stopped = false;
    try {
      await attach();
    } catch (err) {
      logger.error("cache_invalidation_listener_initial_attach_failed", { err: String(err) });
      void scheduleReconnect();
    }
    schedulePoller();
  }

  async function stop(): Promise<void> {
    stopped = true;
    if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
    try { await listenClient?.end(); } catch { /* ignore */ }
    listenClient = null;
    logger.info("cache_invalidation_listener_stopped", { instance: instanceId, ...counters });
  }

  return {
    start,
    stop,
    recoverNow: runPollerOnce,
    stats: () => Object.freeze({ ...counters, instanceId }),
  };
}

function lagSeconds(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const timestamp = typeof value === "number"
    ? (value > 10_000_000_000 ? value : value * 1_000)
    : Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 1_000) : 0;
}

/**
 * Exported for unit testing. Cache key v4 layout (Phase 3):
 *   desc:v4:{plane}:{tenantId}:{schemaHash}:{entityCode}:{compiledHash}
 *   desc:v4:{plane}:{tenantId}:{schemaHash}:{entityCode}:ptr
 * We glob plane + schemaHash + compiledHash; tenant + entity are precise when
 * the trigger payload carries them, wildcarded otherwise.
 */

/**
 * Exported for unit testing. Mesh-plane keys carry the binding fingerprint
 * in the principal slot but the v4 cache key (Phase 3 A1) keeps the
 * descriptor principal-agnostic, so on a grant revoke we drop the whole
 * tenant slice on mesh. The fingerprint is preserved in the audit row for
 * later forensic queries.
 */

function safeParseJson(raw: string | undefined): NotifyPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as NotifyPayload : {};
  } catch {
    return {};
  }
}
