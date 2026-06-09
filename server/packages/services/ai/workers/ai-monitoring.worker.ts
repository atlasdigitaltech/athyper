/**
 * AI Monitoring Worker — drift detection for inference confidence.
 *
 * Triggered lazily: each /ai/actions/run request sets a Redis key with a 24h TTL
 * for the (tenant, action, doc_class) triple.  When the key expires and the next
 * request fires for that triple, the monitor runs.
 *
 * This avoids adding a new BullMQ queue.  The trade-off: monitoring fires on
 * the first request after the window elapses, not at a fixed clock time.
 * For Phase 7c (A-16), replace with a true nightly BullMQ cron job.
 *
 * The worker:
 *   1. Reads ai_inference_log for the last drift_window_hours
 *   2. Computes rolling mean confidence
 *   3. Compares against drift_alert_below threshold
 *   4. Writes a row to log.ai_monitoring_log when drift is detected
 */

import { sql } from "kysely";
import type { AnyDb, AiLogger } from "../ai-runtime.types.js";
import type { ConfidenceResolver } from "../confidence-resolver.service.js";

const DRIFT_CHECK_KEY = (tenantId: string, actionCode: string, docClass: string | null) =>
  `ai:drift:last:${tenantId}:${actionCode}:${docClass ?? "*"}`;

const DRIFT_WINDOW_KEY_TTL = 24 * 60 * 60; // 24 hours

interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: "EX", ttl: number): Promise<unknown>;
}

interface MonitoringDeps {
  db:                 AnyDb;
  cache:              RedisCache;
  confidenceResolver: ConfidenceResolver;
  logger:             AiLogger;
}

export async function maybeTriggerDriftCheck(
  deps:      MonitoringDeps,
  tenantId:  string,
  actionCode: string,
  docClass:  string | null,
  principalId: string,
): Promise<void> {
  const key = DRIFT_CHECK_KEY(tenantId, actionCode, docClass);
  const seen = await deps.cache.get(key).catch(() => null);
  if (seen) return; // still within the window — skip

  // Set the key first (prevent concurrent drift checks from the same triple)
  await deps.cache.set(key, "1", "EX", DRIFT_WINDOW_KEY_TTL).catch(() => null);

  // Run async, non-blocking
  runDriftCheck(deps, tenantId, actionCode, docClass, principalId).catch((e) =>
    deps.logger.error("ai_drift_check_failed", { tenantId, actionCode, err: String(e) }),
  );
}

async function runDriftCheck(
  deps:       MonitoringDeps,
  tenantId:   string,
  actionCode: string,
  docClass:   string | null,
  principalId: string,
): Promise<void> {
  const { db, confidenceResolver, logger } = deps;

  const threshold = await confidenceResolver.resolve(tenantId, actionCode, docClass, null);
  if (!threshold.drift_alert_below) return;

  const windowHours = threshold.drift_window_hours ?? 24;

  try {
    // Compute rolling mean confidence from recent inference log rows
    const { rows } = await sql<{
      mean_confidence: number | null;
      sample_count:    number;
    }>`
      SELECT
        AVG(confidence)::float   AS mean_confidence,
        COUNT(*)::int            AS sample_count
      FROM log.ai_inference_log
      WHERE tenant_id    = ${tenantId}::uuid
        AND action_type  = ${actionCode}
        AND created_at  >= now() - (${windowHours} || ' hours')::interval
        AND confidence IS NOT NULL
    `.execute(db);

    const row = rows[0];
    if (!row || row.sample_count < 5) return; // too few samples for meaningful drift

    const meanConf = row.mean_confidence ?? 1;
    const isAlert  = meanConf < threshold.drift_alert_below;

    if (isAlert) {
      await sql`
        INSERT INTO log.ai_monitoring_log (
          tenant_id, log_type, monitor_type,
          metric_name, metric_value, baseline_value,
          is_alert, is_alert_sent,
          window_start, window_end,
          detail,
          created_by
        ) VALUES (
          ${tenantId}::uuid,
          'system',
          'drift',
          'mean_confidence',
          ${meanConf}::numeric,
          ${threshold.drift_alert_below}::numeric,
          true, false,
          now() - (${windowHours} || ' hours')::interval,
          now(),
          ${JSON.stringify({
            action_code: actionCode,
            doc_class:   docClass,
            sample_count: row.sample_count,
            monitoring_date: new Date().toISOString().split("T")[0],
          })}::jsonb,
          ${principalId}::uuid
        )
      `.execute(db);

      logger.warn("ai_drift_alert", {
        tenantId, actionCode, docClass, meanConf,
        alertBelow: threshold.drift_alert_below,
        sampleCount: row.sample_count,
      });
    }
  } catch (e) {
    logger.error("ai_drift_check_query_failed", { tenantId, actionCode, err: String(e) });
  }
}
