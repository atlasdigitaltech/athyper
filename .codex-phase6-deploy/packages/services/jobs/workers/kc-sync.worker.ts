/**
 * KC Sync Worker — v2.0
 *
 * Queue: jobs-iam-kc-sync
 * Job:   kc-sync (no payload — reconciles all configured KC realms in one pass)
 *
 * CRITICAL FIXES FROM v1.0
 * ────────────────────────
 * v1 matched on master.principal.external_sub — JIT provisioning never sets that column,
 * so v1 synced ZERO JIT-provisioned users. v1 also used uppercase status values
 * ('ACTIVE'/'SUSPENDED') while the DDL stores lowercase ('active'/'suspended') —
 * meaning every WHERE clause silently matched nothing.
 *
 * WHAT THIS VERSION DOES PER REALM
 * ─────────────────────────────────
 * 1. Fetch ALL KC users from the Admin REST API into an in-memory map (subject_id → KcUser).
 * 2. Reconcile master.principal via master.principal_identity_binding.subject_id:
 *      • KC user absent         → mark binding sync_status = 'drift'
 *      • status changed         → UPDATE principal.status + INSERT to event.outbox
 *                                  (IAM outbox worker invalidates sessions within ~10 s)
 *      • always                 → UPDATE binding sync health (sync_status/synced_at/
 *                                  idp_enabled/idp_email_verified/username)
 *      • KC has name data       → UPDATE principal_profile display/given/family name
 * 3. Reconcile mesh.principal via mesh.principal_identity_binding.subject_id:
 *      • KC user absent         → mark mesh binding sync_status = 'drift'
 *      • status changed         → UPDATE mesh.principal.status;
 *                                  on disable: direct Redis cache invalidation
 *                                  via principal_sessions:{sub} set
 *      • always                 → UPDATE mesh binding sync health
 *
 * Multi-realm:
 *   KcSyncWorkerDeps.kcAdmins is an array — each element is a separate KC realm.
 *   All realms are processed sequentially within a single job run.
 *
 * Circuit breaker, scheduling, and wire-up unchanged from v1.
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

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const BATCH_SIZE = 100;
const KC_BREAKER_THRESHOLD = 3;
const KC_BREAKER_OPEN_MS = 600_000; // 10 min

// ─── Exported types ───────────────────────────────────────────────────────────

export interface KcAdminConfig {
  /** Base URL of the Keycloak server (e.g. https://auth.example.com) */
  baseUrl: string;
  /** KC realm name — used for Admin REST API calls */
  realm: string;
  /**
   * DB realm_key stored in principal_identity_binding.realm_key.
   * Defaults to `realm` when omitted (the common case: KC realm name = DB realm key).
   */
  realmKey?: string;
  /** Client ID with realm-management roles (view-users) */
  clientId: string;
  /** Client secret for client-credentials grant */
  clientSecret: string;
}

/**
 * Minimal cache interface for mesh session invalidation.
 * Implemented by the shared ioredis client — pass the same instance
 * used by the session service so principal_sessions sets are visible.
 */
export interface KcSyncCacheClient {
  smembers(key: string): Promise<string[]>;
  del(keys: string | string[]): Promise<unknown>;
}

// ─── Internal KC API types ────────────────────────────────────────────────────

interface KcUser {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  enabled: boolean;
  firstName?: string;
  lastName?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

// ─── Sync result ──────────────────────────────────────────────────────────────

interface SyncResult {
  total: number;
  synced: number;
  drift: number;
  errors: number;
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
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

// ─── KC Admin API ─────────────────────────────────────────────────────────────

async function fetchAdminToken(cfg: KcAdminConfig): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/realms/${cfg.realm}/protocol/openid-connect/token`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`KC token fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as TokenResponse;
  return data.access_token;
}

async function fetchKcUsersBatch(
  cfg: KcAdminConfig,
  token: string,
  first: number,
): Promise<KcUser[]> {
  const url =
    `${cfg.baseUrl.replace(/\/$/, "")}/admin/realms/${cfg.realm}/users` +
    `?first=${first}&max=${BATCH_SIZE}&briefRepresentation=false`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    throw new Error(`KC users list failed: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<KcUser[]>;
}

/** Fetches every user in the realm and returns a Map keyed by KC user UUID (= subject_id in DB). */
async function fetchAllKcUsers(cfg: KcAdminConfig): Promise<Map<string, KcUser>> {
  const token = await fetchAdminToken(cfg);
  const map = new Map<string, KcUser>();
  let first = 0;
  while (true) {
    const batch = await fetchKcUsersBatch(cfg, token, first);
    if (batch.length === 0) break;
    for (const user of batch) map.set(user.id, user);
    first += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }
  return map;
}

// ─── Mesh session cache invalidation ─────────────────────────────────────────
// Mesh principals don't have tenant_id, so we can't write to event.outbox.
// Instead, directly delete the Redis keys tracked in the principal_sessions set.

async function invalidateMeshSessions(
  sub: string,
  cache: KcSyncCacheClient,
  logger?: JobLogger,
): Promise<void> {
  const setKey = `principal_sessions:${sub}`;
  const keys = await cache.smembers(setKey).catch(() => [] as string[]);
  if (keys.length > 0) {
    await cache.del([...keys, setKey]).catch(() => undefined);
    logger?.info("kc_sync_mesh_sessions_invalidated", { sub, count: keys.length });
  }
}

// ─── Master principal reconciliation ─────────────────────────────────────────
// Covers neon and admin planes — both use master.principal / master.principal_identity_binding.

async function reconcileMasterPrincipals(
  db: AnyDb,
  kcUsers: Map<string, KcUser>,
  realmKey: string,
  logger?: JobLogger,
): Promise<SyncResult> {
  const result: SyncResult = { total: 0, synced: 0, drift: 0, errors: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bindings = await (db as any)
    .selectFrom("master.principal_identity_binding as pib")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .innerJoin("master.principal as p", (join: any) =>
      join.onRef("p.id", "=", "pib.principal_id").onRef("p.tenant_id", "=", "pib.tenant_id"),
    )
    .select([
      "pib.id as binding_id",
      "pib.tenant_id",
      "pib.principal_id",
      "pib.subject_id",
      "pib.username as binding_username",
      "p.status as principal_status",
      "p.name as principal_name",
    ])
    .where("pib.realm_key", "=", realmKey)
    .where("pib.provider_code", "=", "keycloak")
    .execute() as Array<{
      binding_id: string;
      tenant_id: string;
      principal_id: string;
      subject_id: string;
      binding_username: string | null;
      principal_status: string;
      principal_name: string;
    }>;

  result.total = bindings.length;

  for (const binding of bindings) {
    try {
      const kcUser = kcUsers.get(binding.subject_id);

      if (!kcUser) {
        // KC user absent (deleted from realm or wrong realm) → drift
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("master.principal_identity_binding")
          .set({ sync_status: "drift", updated_at: new Date(), updated_by: SYSTEM_UUID })
          .where("id", "=", binding.binding_id)
          .execute();
        result.drift++;
        logger?.warn("kc_sync_master_drift", {
          subject_id: binding.subject_id,
          principal_id: binding.principal_id,
        });
        continue;
      }

      const targetStatus = kcUser.enabled ? "active" : "suspended";
      const statusChanged = binding.principal_status !== targetStatus;

      if (statusChanged) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("master.principal")
          .set({ status: targetStatus, updated_at: new Date(), updated_by: SYSTEM_UUID })
          .where("id", "=", binding.principal_id)
          .where("tenant_id", "=", binding.tenant_id)
          .execute();

        // Write to event.outbox so the IAM outbox worker invalidates all Redis
        // sessions for this principal within ~10 seconds.
        const eventType = kcUser.enabled ? "principal.reactivated" : "principal.deactivated";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .insertInto("event.outbox")
          .values({
            tenant_id: binding.tenant_id,
            topic: "iam",
            event_type: eventType,
            entity_type: "principal",
            entity_id: binding.principal_id,
            actor_id: SYSTEM_UUID,
            source: "kc_sync",
            payload: JSON.stringify({ sub: binding.subject_id, kc_enabled: kcUser.enabled }),
            created_by: SYSTEM_UUID,
          })
          .execute();

        logger?.info("kc_sync_master_status_changed", {
          principal_id: binding.principal_id,
          from: binding.principal_status,
          to: targetStatus,
        });
      }

      // Always update binding sync health fields
      const resolvedUsername = kcUser.username || binding.binding_username || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .updateTable("master.principal_identity_binding")
        .set({
          sync_status: "synced",
          synced_at: new Date(),
          idp_enabled: kcUser.enabled,
          idp_email_verified: kcUser.emailVerified ?? false,
          username: resolvedUsername,
          sync_error_message: null,
          sync_retry_count: 0,
          updated_at: new Date(),
          updated_by: SYSTEM_UUID,
        })
        .where("id", "=", binding.binding_id)
        .execute();

      // Sync display name from KC if available and different from local
      const kcDisplayName = [kcUser.firstName, kcUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (kcDisplayName && kcDisplayName !== binding.principal_name) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("master.principal_profile")
          .set({
            display_name: kcDisplayName,
            given_name: kcUser.firstName || null,
            family_name: kcUser.lastName || null,
            updated_at: new Date(),
            updated_by: SYSTEM_UUID,
          })
          .where("tenant_id", "=", binding.tenant_id)
          .where("principal_id", "=", binding.principal_id)
          .execute();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("master.principal")
          .set({ name: kcDisplayName, updated_at: new Date(), updated_by: SYSTEM_UUID })
          .where("id", "=", binding.principal_id)
          .where("tenant_id", "=", binding.tenant_id)
          .execute();
      }

      result.synced++;
    } catch (err) {
      result.errors++;
      logger?.warn("kc_sync_master_error", {
        binding_id: binding.binding_id,
        principal_id: binding.principal_id,
        err: String(err),
      });
    }
  }

  return result;
}

// ─── Mesh principal reconciliation ───────────────────────────────────────────
// Covers mesh plane — uses mesh.principal / mesh.principal_identity_binding.
// mesh.principal uses 'active'/'inactive' (not 'suspended') to match its status enum.
// Sessions are invalidated directly via Redis (no tenant_id, so event.outbox isn't used).

async function reconcileMeshPrincipals(
  db: AnyDb,
  kcUsers: Map<string, KcUser>,
  realmKey: string,
  cache?: KcSyncCacheClient,
  logger?: JobLogger,
): Promise<SyncResult> {
  const result: SyncResult = { total: 0, synced: 0, drift: 0, errors: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bindings = await (db as any)
    .selectFrom("mesh.principal_identity_binding as pib")
    .innerJoin("mesh.principal as p", "p.id", "pib.principal_id")
    .select([
      "pib.id as binding_id",
      "pib.principal_id",
      "pib.subject_id",
      "p.status as principal_status",
    ])
    .where("pib.realm_key", "=", realmKey)
    .where("pib.provider_code", "=", "keycloak")
    .execute() as Array<{
      binding_id: string;
      principal_id: string;
      subject_id: string;
      principal_status: string;
    }>;

  result.total = bindings.length;

  for (const binding of bindings) {
    try {
      const kcUser = kcUsers.get(binding.subject_id);

      if (!kcUser) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("mesh.principal_identity_binding")
          .set({ sync_status: "drift", updated_at: new Date(), updated_by: "kc_sync" })
          .where("id", "=", binding.binding_id)
          .execute();
        result.drift++;
        logger?.warn("kc_sync_mesh_drift", {
          subject_id: binding.subject_id,
          principal_id: binding.principal_id,
        });
        continue;
      }

      // mesh.principal status values: 'active' | 'inactive' | 'locked' | 'retired'
      const targetStatus = kcUser.enabled ? "active" : "inactive";
      const statusChanged = binding.principal_status !== targetStatus;

      if (statusChanged) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .updateTable("mesh.principal")
          .set({ status: targetStatus, updated_at: new Date(), updated_by: "kc_sync" })
          .where("id", "=", binding.principal_id)
          .execute();

        // On disable: invalidate Redis sessions directly (mesh has no tenant_id,
        // so we can't write to event.outbox for the IAM outbox worker).
        if (!kcUser.enabled && cache) {
          await invalidateMeshSessions(binding.subject_id, cache, logger);
        }

        logger?.info("kc_sync_mesh_status_changed", {
          principal_id: binding.principal_id,
          from: binding.principal_status,
          to: targetStatus,
        });
      }

      // Always update mesh binding sync health
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .updateTable("mesh.principal_identity_binding")
        .set({
          sync_status: "synced",
          synced_at: new Date(),
          updated_at: new Date(),
          updated_by: "kc_sync",
        })
        .where("id", "=", binding.binding_id)
        .execute();

      result.synced++;
    } catch (err) {
      result.errors++;
      logger?.warn("kc_sync_mesh_error", {
        binding_id: binding.binding_id,
        principal_id: binding.principal_id,
        err: String(err),
      });
    }
  }

  return result;
}

// ─── Main sync orchestrator ───────────────────────────────────────────────────

async function runSync(
  db: AnyDb,
  configs: KcAdminConfig[],
  cache?: KcSyncCacheClient,
  logger?: JobLogger,
): Promise<void> {
  if (isCircuitOpen()) {
    logger?.warn("kc_sync_circuit_open", {
      open_until: new Date(circuitOpenUntil).toISOString(),
    });
    return;
  }

  try {
    for (const cfg of configs) {
      const realmKey = cfg.realmKey ?? cfg.realm;
      const startedAt = Date.now();

      const kcUsers = await fetchAllKcUsers(cfg);

      const masterResult = await reconcileMasterPrincipals(db, kcUsers, realmKey, logger);
      const meshResult = await reconcileMeshPrincipals(db, kcUsers, realmKey, cache, logger);

      logger?.info("kc_sync_complete", {
        realm: cfg.realm,
        realm_key: realmKey,
        kc_total: kcUsers.size,
        master: masterResult,
        mesh: meshResult,
        duration_ms: Date.now() - startedAt,
      });
    }
    onKcSuccess();
  } catch (err) {
    onKcFailure();
    logger?.error("kc_sync_error", {
      err: String(err),
      consecutive_fails: consecutiveFailures,
      circuit_open_until:
        circuitOpenUntil > Date.now()
          ? new Date(circuitOpenUntil).toISOString()
          : null,
    });
    throw err;
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export interface KcSyncWorkerDeps {
  db: AnyDb;
  /** One entry per KC realm to sync. All realms run sequentially within one job. */
  kcAdmins: KcAdminConfig[];
  connection: ConnectionOptions;
  /**
   * Optional Redis client for mesh session invalidation.
   * When provided, disabling a mesh principal immediately deletes its Redis session
   * keys so the user is logged out at the next request (not after TTL expiry).
   */
  cache?: KcSyncCacheClient;
  logger?: JobLogger;
}

export function createKcSyncWorker(deps: KcSyncWorkerDeps): Worker<KcSyncJobData> {
  const { db, kcAdmins, connection, cache, logger } = deps;

  return new Worker<KcSyncJobData>(
    QUEUE_NAME.IAM_KC_SYNC,
    async (_job: Job) => {
      await runSync(db, kcAdmins, cache, logger);
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
