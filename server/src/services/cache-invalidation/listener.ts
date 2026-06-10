// Phase 5 — Three-Plane Permission Stack.
//
// Descriptor cache invalidation listener.
//
// Subscribes to two pg_notify channels:
//
//   `desc_invalidate` — published by the satellite-write triggers (Phase 1)
//                       and the Studio approve / emergency-override paths.
//                       Payload: { tenant_id, entity_code, reason, source, at }.
//                       We DEL all `desc:*:v4:{tenant}:*:*:{entity}:*` keys.
//
//   `grant_revoke`    — published by mesh.account_grant revoke trigger
//                       (Phase 1). Payload: { grant_id, principal_id,
//                       account_id, tenant_id, fingerprint, new_status, at }.
//                       We DEL `desc:mesh:v4:{tenant}:{fingerprint}:*` keys
//                       so the partner's next request rebuilds from scratch.
//
// We also run a 30s poller against `log.descriptor_cache_invalidation` for
// rows where `processed_at IS NULL`. This is the fallback for missed
// notifications (LISTEN connection dropped, listener restarted, etc.).
// Every successful purge updates `processed_at`, `processed_by`,
// `redis_keys_deleted` so ops can verify the listener is healthy.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import type pg from "pg";

import { createDirectPgClient } from "./direct-pg-client.js";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface DescriptorCacheRedis {
  scan(
    cursor: string,
    matchFlag: "MATCH",
    pattern: string,
    countFlag: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
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
  /** Polling-fallback connection. Reuses the pooled client; only SELECT + UPDATE on log.* */
  logDb: DescriptorCacheLogDb;
  logger: DescriptorCacheListenerLogger;
  /** Override the env-resolved listen connection string (tests). */
  listenConnectionString?: string;
  /** Poll interval for the fallback scan. Defaults to 30s. */
  pollIntervalMs?: number;
  /** Reconnect delay after a LISTEN error. Defaults to 2s, capped at 30s. */
  reconnectInitialDelayMs?: number;
  /** Maximum keys deleted per Redis DEL batch. Defaults to 200. */
  delBatchSize?: number;
}

export interface DescriptorCacheListener {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** For probes/tests: number of notifications processed since start. */
  readonly stats: () => Readonly<{
    notifications: number;
    pollerRuns: number;
    keysDeleted: number;
    errors: number;
    reconnects: number;
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
  at?: number | null;
}

interface InvalidationLogRow {
  id: string;
  tenant_id: string | null;
  entity_code: string | null;
  plane_key: string | null;
  reason: string;
  triggered_by_table: string | null;
  triggered_by_id: string | null;
  created_at: string;
}

const CHANNEL_DESC_INVALIDATE = "desc_invalidate";
const CHANNEL_GRANT_REVOKE    = "grant_revoke";

export function createDescriptorCacheListener(
  options: CreateDescriptorCacheListenerOptions,
): DescriptorCacheListener {
  const { redis, logDb, logger } = options;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const reconnectInitialDelay = options.reconnectInitialDelayMs ?? 2_000;
  const delBatchSize = options.delBatchSize ?? 200;
  const instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  let listenClient: pg.Client | null = null;
  let pollerTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let reconnectDelay = reconnectInitialDelay;

  const counters = {
    notifications: 0,
    pollerRuns: 0,
    keysDeleted: 0,
    errors: 0,
    reconnects: 0,
  };

  // ─── Redis helpers ────────────────────────────────────────────────────────────

  async function scanAndDelete(pattern: string): Promise<number> {
    let cursor = "0";
    let total = 0;
    const buffer: string[] = [];
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      for (const key of keys) {
        buffer.push(key);
        if (buffer.length >= delBatchSize) {
          total += await redis.del(...buffer.splice(0, delBatchSize));
        }
      }
    } while (cursor !== "0");
    if (buffer.length > 0) total += await redis.del(...buffer);
    return total;
  }

  function patternForDescInvalidate(tenant: string | null, entity: string | null): string {
    return composeDescInvalidatePattern(tenant, entity);
  }

  function patternForGrantRevoke(tenant: string | null, fingerprint: string | null): string {
    return composeGrantRevokePattern(tenant, fingerprint);
  }

  // ─── Log mark ─────────────────────────────────────────────────────────────────

  async function markProcessedById(id: string, keysDeleted: number): Promise<void> {
    await logDb.query(
      `UPDATE log.descriptor_cache_invalidation
          SET processed_at       = now(),
              processed_by       = $1,
              redis_keys_deleted = $2
        WHERE id = $3 AND processed_at IS NULL`,
      [instanceId, keysDeleted, id],
    );
  }

  // ─── Notification handler ────────────────────────────────────────────────────

  async function onDescInvalidate(payload: NotifyPayload): Promise<void> {
    const pattern = patternForDescInvalidate(payload.tenant_id ?? null, payload.entity_code ?? null);
    try {
      const deleted = await scanAndDelete(pattern);
      counters.keysDeleted += deleted;
      counters.notifications += 1;
      logger.info("cache_invalidation_processed", {
        channel: CHANNEL_DESC_INVALIDATE,
        pattern,
        reason: payload.reason ?? null,
        source: payload.source ?? null,
        keys_deleted: deleted,
      });
    } catch (err) {
      counters.errors += 1;
      logger.warn("cache_invalidation_purge_failed", {
        channel: CHANNEL_DESC_INVALIDATE,
        pattern,
        err: String(err),
      });
    }
  }

  async function onGrantRevoke(payload: NotifyPayload): Promise<void> {
    const pattern = patternForGrantRevoke(payload.tenant_id ?? null, payload.fingerprint ?? null);
    try {
      const deleted = await scanAndDelete(pattern);
      counters.keysDeleted += deleted;
      counters.notifications += 1;
      logger.info("cache_invalidation_processed", {
        channel: CHANNEL_GRANT_REVOKE,
        pattern,
        new_status: payload.new_status ?? null,
        account_id: payload.account_id ?? null,
        keys_deleted: deleted,
      });
    } catch (err) {
      counters.errors += 1;
      logger.warn("cache_invalidation_purge_failed", {
        channel: CHANNEL_GRANT_REVOKE,
        pattern,
        err: String(err),
      });
    }
  }

  // ─── LISTEN bootstrap + reconnect ─────────────────────────────────────────────

  async function attach(): Promise<void> {
    const client = await createDirectPgClient({
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
    await new Promise((resolve) => setTimeout(resolve, delay));
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
        `SELECT id, tenant_id, entity_code, plane_key, reason,
                triggered_by_table, triggered_by_id, created_at
           FROM log.descriptor_cache_invalidation
          WHERE processed_at IS NULL
            AND created_at > now() - interval '1 hour'
          ORDER BY created_at
          LIMIT 200`,
      );
      for (const row of result.rows) {
        const pattern = row.plane_key === "mesh"
          ? patternForGrantRevoke(row.tenant_id, null)
          : patternForDescInvalidate(row.tenant_id, row.entity_code);
        try {
          const deleted = await scanAndDelete(pattern);
          counters.keysDeleted += deleted;
          await markProcessedById(row.id, deleted);
        } catch (err) {
          counters.errors += 1;
          logger.warn("cache_invalidation_poller_row_failed", {
            id: row.id, pattern, err: String(err),
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
    stats: () => Object.freeze({ ...counters, instanceId }),
  };
}

/**
 * Exported for unit testing. Cache key v4 layout (Phase 3):
 *   desc:v4:{plane}:{tenantId}:{schemaHash}:{entityCode}:{compiledHash}
 *   desc:v4:{plane}:{tenantId}:{schemaHash}:{entityCode}:ptr
 * We glob plane + schemaHash + compiledHash; tenant + entity are precise when
 * the trigger payload carries them, wildcarded otherwise.
 */
export function composeDescInvalidatePattern(
  tenant: string | null,
  entity: string | null,
): string {
  const t = tenant ?? "*";
  const e = entity ?? "*";
  return `desc:v4:*:${t}:*:${e}:*`;
}

/**
 * Exported for unit testing. Mesh-plane keys carry the binding fingerprint
 * in the principal slot but the v4 cache key (Phase 3 A1) keeps the
 * descriptor principal-agnostic, so on a grant revoke we drop the whole
 * tenant slice on mesh. The fingerprint is preserved in the audit row for
 * later forensic queries.
 */
export function composeGrantRevokePattern(
  tenant: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fingerprint: string | null,
): string {
  const t = tenant ?? "*";
  return `desc:mesh:v4:${t}:*:*:*:*`;
}

function safeParseJson(raw: string | undefined): NotifyPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as NotifyPayload : {};
  } catch {
    return {};
  }
}
