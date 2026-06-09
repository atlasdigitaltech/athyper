/**
 * ConfidenceResolver — resolves the effective confidence thresholds for a
 * (tenant, action_code, doc_class, model_id) quad via the same three-level
 * fallthrough as AutonomyResolver:
 *
 *   1. DB row: (tenant_id, action_code, doc_class, model_id)
 *   2. DB row: (tenant_id, action_code, NULL,      NULL)
 *   3. PLATFORM_DEFAULT_THRESHOLDS[action_code]
 *
 * The DB constraint act_threshold_order enforces min_suggest ≤ min_assist ≤ min_auto.
 * Redis TTL: 60 seconds (same as AutonomyResolver).
 */

import { sql } from "kysely";
import type { AnyDb, ConfidenceThreshold, AiLogger } from "./ai-runtime.types.js";

const PLATFORM_DEFAULT_THRESHOLDS: Record<string, ConfidenceThreshold> = {
  extract_document: { min_for_suggest: 0.40, min_for_assist: 0.70, min_for_auto: 0.95, drift_alert_below: 0.50, drift_window_hours: 24 },
  classify:         { min_for_suggest: 0.50, min_for_assist: 0.70, min_for_auto: 0.90, drift_alert_below: 0.55, drift_window_hours: 24 },
  suggest:          { min_for_suggest: 0.40, min_for_assist: 0.65, min_for_auto: 0.85, drift_alert_below: 0.45, drift_window_hours: 48 },
  autofill:         { min_for_suggest: 0.50, min_for_assist: 0.75, min_for_auto: 0.95, drift_alert_below: 0.55, drift_window_hours: 24 },
  extract_entity:   { min_for_suggest: 0.45, min_for_assist: 0.70, min_for_auto: 0.92, drift_alert_below: 0.50, drift_window_hours: 24 },
  match_record:     { min_for_suggest: 0.60, min_for_assist: 0.80, min_for_auto: 0.95, drift_alert_below: 0.65, drift_window_hours: 24 },
  summarize:        { min_for_suggest: 0.30, min_for_assist: 0.55, min_for_auto: 0.80, drift_alert_below: 0.35, drift_window_hours: 72 },
  translate:        { min_for_suggest: 0.50, min_for_assist: 0.70, min_for_auto: 0.90, drift_alert_below: 0.55, drift_window_hours: 48 },
};

const FALLBACK_THRESHOLD: ConfidenceThreshold = {
  min_for_suggest: 0.50, min_for_assist: 0.70, min_for_auto: 0.90,
  drift_alert_below: 0.55, drift_window_hours: 24,
};

const CACHE_TTL_SECONDS = 60;

interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: "EX", ttl: number): Promise<unknown>;
  del?(key: string | string[]): Promise<unknown>;
  scan?(
    cursor: string,
    matchFlag: "MATCH",
    pattern: string,
    countFlag: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
}

export async function invalidateConfidenceThreshold(
  cache: RedisCache,
  tenantId: string,
  actionCode?: string | null,
  docClass?: string | null,
  modelId?: string | null,
): Promise<number> {
  if (typeof cache.del !== "function") return 0;

  const pattern = `ai:threshold:${tenantId}:${actionCode ?? "*"}:${docClass ?? "*"}:${modelId ?? "*"}`;
  if (!pattern.includes("*")) {
    await cache.del(pattern).catch(() => undefined);
    return 1;
  }

  if (typeof cache.scan !== "function") return 0;
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, found] = await cache.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...found);
  } while (cursor !== "0");

  if (keys.length > 0) await cache.del(keys).catch(() => undefined);
  return keys.length;
}

export class ConfidenceResolver {
  constructor(
    private readonly db:     AnyDb,
    private readonly cache:  RedisCache,
    private readonly logger: AiLogger,
  ) {}

  async invalidate(
    tenantId: string,
    actionCode?: string | null,
    docClass?: string | null,
    modelId?: string | null,
  ): Promise<number> {
    return invalidateConfidenceThreshold(this.cache, tenantId, actionCode, docClass, modelId);
  }

  async resolve(
    tenantId:   string,
    actionCode: string,
    docClass:   string | null,
    modelId:    string | null,
  ): Promise<ConfidenceThreshold> {
    const cacheKey = `ai:threshold:${tenantId}:${actionCode}:${docClass ?? "*"}:${modelId ?? "*"}`;

    const cached = await this.cache.get(cacheKey).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached) as ConfidenceThreshold; } catch { /* fall through */ }
    }

    const threshold = await this._resolveFromDb(tenantId, actionCode, docClass, modelId);
    await this.cache
      .set(cacheKey, JSON.stringify(threshold), "EX", CACHE_TTL_SECONDS)
      .catch((e) => this.logger.warn("ai_threshold_cache_set_failed", { err: String(e) }));

    return threshold;
  }

  private async _resolveFromDb(
    tenantId:   string,
    actionCode: string,
    docClass:   string | null,
    modelId:    string | null,
  ): Promise<ConfidenceThreshold> {
    try {
      const { rows } = await sql<{
        min_for_suggest:    number;
        min_for_assist:     number;
        min_for_auto:       number;
        drift_alert_below:  number | null;
        drift_window_hours: number;
      }>`
        SELECT min_for_suggest, min_for_assist, min_for_auto,
               drift_alert_below, drift_window_hours
        FROM   control.ai_confidence_threshold
        WHERE  tenant_id   = ${tenantId}::uuid
          AND  action_code = ${actionCode}
          AND  is_active   = true
          AND  (doc_class = ${docClass} OR doc_class IS NULL)
          AND  (model_id  = ${modelId}  OR model_id  IS NULL)
        ORDER BY
          CASE WHEN doc_class IS NOT NULL THEN 0 ELSE 1 END,
          CASE WHEN model_id  IS NOT NULL THEN 0 ELSE 1 END
        LIMIT 1
      `.execute(this.db);

      if (rows[0]) return rows[0];
    } catch (e) {
      this.logger.warn("ai_threshold_db_error", { actionCode, err: String(e) });
    }

    return PLATFORM_DEFAULT_THRESHOLDS[actionCode] ?? FALLBACK_THRESHOLD;
  }
}
