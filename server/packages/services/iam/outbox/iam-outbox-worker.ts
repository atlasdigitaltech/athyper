/**
 * IAM Outbox Worker
 *
 * Polls event.outbox (topic = 'iam') and invalidates Redis session cache
 * when principal or persona state changes.
 *
 * Pattern: transactional outbox with claim-based polling.
 *   - Batch claim via:  UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
 *   - Process each event: SCAN + DEL session:{principalId}:* in Redis
 *   - Mark completed; on failure: reschedule with 30 s backoff
 *
 * Relevant IAM event_types (entity_id = principalId):
 *   principal.deactivated     principal.locked      principal.unlocked
 *   persona.changed           org_membership.added  org_membership.removed
 *   (any other iam event with entity_id set → broad invalidation)
 *
 * Polling interval: 10 s (configurable via POLL_INTERVAL_MS)
 * Batch size:       50  (configurable via BATCH_SIZE)
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutboxWorkerCache {
  /**
   * Cursor-based pattern scan (ioredis).
   * Used as a fallback for backend session invalidation when per-principal
   * key sets are not yet populated (migration period).
   */
  scan?(
    cursor: string,
    matchFlag: "MATCH",
    pattern: string,
    countFlag: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
  del(keys: string[]): Promise<unknown>;
  /**
   * Return all members of a Redis set.
   * Used for:
   *   - Frontend session invalidation via user_sessions:{ns}:{sub} sets (P1)
   *   - Backend session invalidation via principal_sessions:{sub} sets (P2)
   */
  smembers(key: string): Promise<string[]>;
  incr?(key: string): Promise<number>;
  publish?(channel: string, message: string): Promise<number>;
}

export interface OutboxWorkerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface IamOutboxWorkerDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<Record<string, any>>;
  cache: OutboxWorkerCache;
  logger?: OutboxWorkerLogger;
  pollIntervalMs?: number;
  batchSize?: number;
  /**
   * Realm keys used as session namespaces in the web BFF.
   * Each namespace is checked when invalidating frontend sessions.
   * Defaults to ["athyper", "platform"] — the web BFF session namespaces.
   */
  sessionNamespaces?: string[];
}

interface ClaimedEvent {
  id: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  tenant_id: string;
  payload: unknown;
}

type PayloadRecord = Record<string, unknown>;

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createIamOutboxWorker(deps: IamOutboxWorkerDeps) {
  const {
    db,
    cache,
    logger,
    pollIntervalMs = 10_000,
    batchSize = 50,
    sessionNamespaces = ["athyper", "platform"],
  } = deps;

  const TOPIC = "iam";
  const RUNTIME_INVALIDATION_CHANNEL = "descriptor-runtime:invalidate:v1";
  const RUNTIME_GENERATION_KEY = "descriptor-runtime:generation:v1";
  const LOCK_OWNER = `iam-worker-${process.pid}`;
  const RETRY_DELAY_MS = 30_000;
  const uniqueSessionNamespaces = [...new Set(sessionNamespaces)];

  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function authEpochKey(principalId: string): string {
    return `session:auth_epoch:${principalId}`;
  }

  function asRecord(value: unknown): PayloadRecord | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as PayloadRecord
      : null;
  }

  function parsePayload(payload: unknown): PayloadRecord {
    if (typeof payload === "string") {
      try {
        return asRecord(JSON.parse(payload)) ?? {};
      } catch {
        return {};
      }
    }
    return asRecord(payload) ?? {};
  }

  function addId(target: Set<string>, value: unknown): void {
    if (typeof value === "string" && value.trim().length > 0) {
      target.add(value);
    }
  }

  // ─── Cache invalidation ──────────────────────────────────────────────────

  async function scanAndDelete(pattern: string): Promise<number> {
    if (typeof cache.scan !== "function") return 0;
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== "0");
    if (keys.length > 0) await cache.del(keys);
    return keys.length;
  }

  async function subjectIdsForPrincipal(principalId: string): Promise<string[]> {
    const rows = await db
      .selectFrom("master.principal_identity_binding")
      .select("subject_id")
      .where("principal_id", "=", principalId)
      .where("provider_code", "=", "keycloak")
      .execute() as Array<{ subject_id: string | null }>;

    return rows
      .map((row) => row.subject_id)
      .filter((subjectId): subjectId is string => typeof subjectId === "string" && subjectId.length > 0);
  }

  async function principalIdsForGroups(tenantId: string, groupIds: string[]): Promise<string[]> {
    if (groupIds.length === 0) return [];
    const rows = await db
      .selectFrom("master.auth_group_member")
      .select("principal_id")
      .where("tenant_id", "=", tenantId)
      .where("group_id", "in", [...new Set(groupIds)])
      .execute() as Array<{ principal_id: string | null }>;

    return rows
      .map((row) => row.principal_id)
      .filter((principalId): principalId is string => typeof principalId === "string" && principalId.length > 0);
  }

  async function groupIdsForRoles(tenantId: string, roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows = await db
      .selectFrom("master.auth_group_role")
      .select("group_id")
      .where("tenant_id", "=", tenantId)
      .where("role_id", "in", [...new Set(roleIds)])
      .where("is_active", "=", true)
      .execute() as Array<{ group_id: string | null }>;

    return rows
      .map((row) => row.group_id)
      .filter((groupId): groupId is string => typeof groupId === "string" && groupId.length > 0);
  }

  async function affectedPrincipalIds(event: ClaimedEvent): Promise<string[]> {
    const ids = new Set<string>();
    const groupIds = new Set<string>();
    const roleIds = new Set<string>();
    const payload = parsePayload(event.payload);
    const oldRow = asRecord(payload.old);
    const newRow = asRecord(payload.new);
    const rows = [payload, oldRow, newRow].filter((row): row is PayloadRecord => row !== null);

    for (const row of rows) {
      addId(ids, row.principal_id);
      addId(ids, row.delegate_id);
      addId(groupIds, row.group_id);
      addId(roleIds, row.role_id);
    }

    if (
      event.entity_type === "principal" ||
      event.event_type === "auth_epoch_changed" ||
      event.event_type === "auth_epoch_bumped" ||
      event.event_type?.startsWith("principal.")
    ) {
      addId(ids, event.entity_id);
    }
    if (event.entity_type === "auth_group") {
      addId(groupIds, event.entity_id);
    }

    const groupsFromRoles = await groupIdsForRoles(event.tenant_id, [...roleIds]);
    for (const groupId of groupsFromRoles) groupIds.add(groupId);

    const principalsFromGroups = await principalIdsForGroups(event.tenant_id, [...groupIds]);
    for (const principalId of principalsFromGroups) ids.add(principalId);

    return [...ids];
  }

  /**
   * Invalidate backend API session and bootstrap cache for a principal.
   *
   * Strategy (P2 SMEMBERS-first with SCAN fallback):
   *   1. Try SMEMBERS on per-principal key sets (O(n) on the principal's keys only).
   *      These sets are populated by session.service and bootstrap.service after the
   *      P2 migration. For sessions written before migration, the sets are empty.
   *   2. Fall back to SCAN on the full keyspace for the principal's prefix pattern
   *      if the per-principal sets return 0 keys. This handles the transition period
   *      (≤ 5 min TTL) until all active sessions have been re-written using the set path.
   *   3. Once the transition is stable, the SCAN fallback can be removed.
   */
  async function invalidateBackendSessions(sub: string): Promise<number> {
    // Try per-principal set lookup first (P2 path — avoids full keyspace SCAN)
    const sessionSetKey = `principal_sessions:${sub}`;
    const bootstrapSetKey = `bootstrap_keys:${sub}`;

    const [sessionKeys, bootstrapKeys] = await Promise.all([
      cache.smembers(sessionSetKey),
      cache.smembers(bootstrapSetKey),
    ]);

    let invalidated = 0;

    if (sessionKeys.length > 0 || bootstrapKeys.length > 0) {
      // P2 path: DEL all tracked keys + the tracking sets themselves
      const allKeys = [...sessionKeys, ...bootstrapKeys, sessionSetKey, bootstrapSetKey];
      await cache.del(allKeys);
      invalidated = sessionKeys.length + bootstrapKeys.length;
    } else {
      // Fallback: SCAN for sessions and bootstrap written before P2 migration
      const sessionCount = await scanAndDelete(`session:${sub}:*`);
      const bootstrapCount = await scanAndDelete(`bootstrap:${sub}:*`);
      invalidated = sessionCount + bootstrapCount;
    }

    return invalidated;
  }

  /**
   * Invalidate frontend BFF sessions for a principal across all known namespaces.
   *
   * Uses the user_sessions:{namespace}:{sub} set (maintained by the web BFF) to
   * find all active session IDs, then DELs the session blobs and the index set.
   * This closes the 8-hour window where a deactivated user's web session remained valid.
   */
  async function invalidateFrontendSessions(sub: string): Promise<number> {
    let invalidated = 0;

    for (const ns of uniqueSessionNamespaces) {
      const indexKey = `user_sessions:${ns}:${sub}`;
      const sids = await cache.smembers(indexKey);
      if (sids.length === 0) continue;

      const sessKeys = sids.map((sid) => `sess:${ns}:${sid}`);
      await cache.del([...sessKeys, indexKey]);
      invalidated += sids.length;
    }

    return invalidated;
  }

  async function invalidatePrincipalSessions(principalId: string): Promise<{
    invalidated: number;
    effectivePrincipals: string[];
  }> {
    // Cache keys use KC subjects, so expand the principal id through bindings.
    const subjects = new Set([principalId, ...(await subjectIdsForPrincipal(principalId))]);
    let invalidated = 0;

    await cache.del([authEpochKey(principalId)]).catch(() => undefined);

    for (const sub of subjects) {
      const backendCount = await invalidateBackendSessions(sub);
      const frontendCount = await invalidateFrontendSessions(sub);
      invalidated += backendCount + frontendCount;
    }

    return { invalidated, effectivePrincipals: [...subjects] };
  }

  async function publishRuntimeInvalidation(
    tenantId: string,
    effectivePrincipal: string,
    reason: string,
  ): Promise<void> {
    if (!cache.incr || !cache.publish) return;
    const generation = await cache.incr(RUNTIME_GENERATION_KEY);
    await cache.publish(RUNTIME_INVALIDATION_CHANNEL, JSON.stringify({
      tenant: tenantId,
      principal: effectivePrincipal,
      reason,
      generation,
      emittedAt: Date.now(),
      origin: LOCK_OWNER,
    }));
  }

  // ─── Security cleanup ────────────────────────────────────────────────────

  /**
   * Revoke all trusted devices for a principal when they are deactivated or
   * locked out. Trusted devices allow step-up bypass — a deactivated principal
   * must not retain that bypass regardless of cookie state.
   *
   * Best-effort: errors are logged but do not block session invalidation.
   */
  async function revokeTrustedDevices(
    tenantId: string,
    principalId: string,
    reason: string,
  ): Promise<number> {
    try {
      const result = await db
        .updateTable("master.trusted_device")
        .set({
          is_revoked:  true,
          revoked_at:  new Date() as unknown as string,
          updated_at:  new Date() as unknown as string,
          updated_by:  null, // system action — no user principal
        })
        .where("tenant_id",    "=", tenantId)
        .where("principal_id", "=", principalId)
        .where("is_revoked",   "=", false)
        .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

      const n = Number(result?.numUpdatedRows ?? 0);
      if (n > 0) {
        logger?.info("iam_trusted_devices_revoked", {
          principal_id: principalId,
          tenant_id:    tenantId,
          count:        n,
          reason,
        });
      }
      return n;
    } catch (err) {
      logger?.warn("iam_trusted_device_revoke_failed", {
        principal_id: principalId,
        tenant_id:    tenantId,
        err: String(err),
      });
      return 0;
    }
  }

  // ─── Batch processing ────────────────────────────────────────────────────

  async function claimBatch(): Promise<ClaimedEvent[]> {
    // Claim-and-lock: atomically select and mark as 'processing'.
    // Uses a subquery with FOR UPDATE SKIP LOCKED for safe concurrent workers.
    const result = await sql<ClaimedEvent>`
      UPDATE event.outbox
      SET
        status     = 'processing',
        locked_at  = now(),
        locked_by  = ${LOCK_OWNER},
        attempts   = attempts + 1
      WHERE id IN (
        SELECT id
        FROM event.outbox
        WHERE topic        = ${TOPIC}
          AND status       = 'pending'
          AND available_at <= now()
        ORDER BY available_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, event_type, entity_type, entity_id, tenant_id, payload
    `.execute(db);

    return result.rows as ClaimedEvent[];
  }

  async function processBatch(): Promise<void> {
    const events = await claimBatch();
    if (events.length === 0) return;

    logger?.info("iam_outbox_batch_claimed", { count: events.length });

    for (const event of events) {
      try {
        let invalidated = 0;
        let devicesRevoked = 0;

        const principalIds = await affectedPrincipalIds(event);
        for (const principalId of principalIds) {
          const result = await invalidatePrincipalSessions(principalId);
          invalidated += result.invalidated;
          for (const effectivePrincipal of result.effectivePrincipals) {
            await publishRuntimeInvalidation(
              event.tenant_id,
              effectivePrincipal,
              event.event_type ?? "permission_change",
            );
          }

          // On deactivation or lock: revoke all trusted devices.
          // Trusted devices grant step-up bypass — an inactive/locked principal
          // must not retain that capability.
          if (
            event.event_type === "principal.deactivated" ||
            event.event_type === "principal.locked"
          ) {
            devicesRevoked = await revokeTrustedDevices(
              event.tenant_id,
              principalId,
              event.event_type,
            );
          }
        }

        // Mark as completed
        await db
          .updateTable("event.outbox")
          .set({
            status: "completed",
            processed_at: new Date() as unknown as string,
            locked_at: null,
            locked_by: null,
          })
          .where("id", "=", event.id)
          .execute();

        logger?.info("iam_event_processed", {
          id: event.id,
          event_type: event.event_type,
          principal_ids: principalIds,
          cache_keys_deleted: invalidated,       // backend + frontend combined
          trusted_devices_revoked: devicesRevoked,
        });
      } catch (err) {
        logger?.error("iam_event_failed", { id: event.id, err: String(err) });

        // Reschedule with backoff — preserve attempts count already incremented
        await db
          .updateTable("event.outbox")
          .set({
            status: "pending",
            available_at: new Date(Date.now() + RETRY_DELAY_MS) as unknown as string,
            locked_at: null,
            locked_by: null,
            last_error: String(err).slice(0, 500),
          })
          .where("id", "=", event.id)
          .execute();
      }
    }
  }

  // ─── Poll loop ───────────────────────────────────────────────────────────

  function scheduleNext(): void {
    if (!running) return;
    timer = setTimeout(async () => {
      try {
        await processBatch();
      } catch (err) {
        logger?.error("iam_outbox_poll_error", { err: String(err) });
      } finally {
        scheduleNext();
      }
    }, pollIntervalMs);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    start(): void {
      if (running) return;
      running = true;
      logger?.info("iam_outbox_worker_started", {
        topic: TOPIC,
        lock_owner: LOCK_OWNER,
        poll_interval_ms: pollIntervalMs,
        batch_size: batchSize,
      });
      // Run once immediately, then schedule
      void processBatch().catch((err) => {
        logger?.error("iam_outbox_initial_poll_error", { err: String(err) });
      }).finally(() => scheduleNext());
    },

    stop(): void {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      logger?.info("iam_outbox_worker_stopped", {});
    },
  };
}
