/**
 * Endpoint Health Worker — Sprint 44
 *
 * Queue: jobs-endpoint-health
 *
 * One job type:
 *
 *   JOB_NAME.ENDPOINT_HEALTH_SWEEP  (scheduled every 5 min)
 *     Queries event.endpoint WHERE is_active = true AND health_check_url IS NOT NULL
 *     for every tenant. For each row, sends an HTTP HEAD request with a 5-second
 *     timeout and classifies the response:
 *
 *       2xx              → healthy
 *       4xx or 1xx/3xx   → degraded
 *       5xx or timeout   → down
 *       connection error → down
 *
 *     Updates health + last_checked_at + last_response_ms on each row.
 *
 *     When the health value transitions (e.g. healthy → down), inserts a row into
 *     event.outbox with topic = 'integration.health_changed' so the webhook delivery
 *     worker can fan the event out to any matching subscriptions (alerting pipelines).
 */

import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { sql, type Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ── Constants ─────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 5_000;

// ── Health classification ─────────────────────────────────────────────────────

type HealthValue = "healthy" | "degraded" | "down";

function classifyStatus(httpStatus: number): HealthValue {
  if (httpStatus >= 200 && httpStatus < 300) return "healthy";
  if (httpStatus >= 500)                     return "down";
  return "degraded"; // 1xx, 3xx, 4xx
}

// ── Probe one endpoint ────────────────────────────────────────────────────────

interface EndpointRow {
  id:               string;
  tenant_id:        string;
  health:           string;
  health_check_url: string;
}

async function probeEndpoint(
  db:     DB,
  ep:     EndpointRow,
  logger: JobLogger | undefined,
): Promise<void> {
  const prevHealth = ep.health as HealthValue;
  let   newHealth: HealthValue;
  let   responseMs: number | null = null;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res  = await fetch(ep.health_check_url, {
      method: "HEAD",
      signal: controller.signal,
      // Avoid following redirects silently — treat them as degraded
      redirect: "manual",
    });
    clearTimeout(tid);
    responseMs = Date.now() - start;
    newHealth  = classifyStatus(res.status);
  } catch {
    responseMs = Date.now() - start;
    newHealth  = "down";
  }

  // ── Persist result ───────────────────────────────────────────────────────
  await sql`
    UPDATE event.endpoint
    SET    health           = ${newHealth},
           last_checked_at  = now(),
           last_response_ms = ${responseMs}
    WHERE  id = ${ep.id}::uuid
  `.execute(db);

  logger?.info("endpoint_health_probed", {
    endpointId:  ep.id,
    tenantId:    ep.tenant_id,
    prev:        prevHealth,
    next:        newHealth,
    responseMs,
  });

  // ── Emit outbox event on status transition ───────────────────────────────
  if (newHealth !== prevHealth) {
    await sql`
      INSERT INTO event.outbox
        (tenant_id,  topic,                        event_type,
         entity_type, entity_id,
         payload,    created_by)
      VALUES
        (${ep.tenant_id}::uuid,
         'integration.health_changed',
         'endpoint.health_changed',
         'endpoint',
         ${ep.id}::uuid,
         ${JSON.stringify({
           endpointId: ep.id,
           from:       prevHealth,
           to:         newHealth,
           responseMs,
         })}::jsonb,
         ${SYSTEM_ACTOR_ID}::uuid)
    `.execute(db);

    logger?.info("endpoint_health_transition_emitted", {
      endpointId: ep.id,
      tenantId:   ep.tenant_id,
      from:       prevHealth,
      to:         newHealth,
    });
  }
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

async function sweepEndpointHealth(
  db:     DB,
  logger: JobLogger | undefined,
): Promise<void> {
  const endpoints = await sql<EndpointRow>`
    SELECT id, tenant_id, health, health_check_url
    FROM   event.endpoint
    WHERE  is_active        = true
    AND    health_check_url IS NOT NULL
  `.execute(db);

  if (endpoints.rows.length === 0) return;

  // Probe sequentially to avoid saturating upstream services on a large registry.
  // The 5-second per-probe timeout bounds the worst-case wall time.
  for (const ep of endpoints.rows) {
    await probeEndpoint(db, ep, logger).catch((err) => {
      logger?.error("endpoint_health_probe_error", {
        endpointId: ep.id,
        err:        err instanceof Error ? err.message : String(err),
      });
    });
  }

  logger?.info("endpoint_health_sweep_done", { count: endpoints.rows.length });
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createEndpointHealthWorker(deps: {
  db:          DB;
  connection:  ConnectionOptions;
  logger?:     JobLogger;
}): Worker {
  const { db, connection, logger } = deps;

  const worker = new Worker(
    QUEUE_NAME.ENDPOINT_HEALTH,
    async (job) => {
      if (job.name === JOB_NAME.ENDPOINT_HEALTH_SWEEP) {
        await sweepEndpointHealth(db, logger);
      }
    },
    { connection, concurrency: 1 },
  );

  return worker;
}
