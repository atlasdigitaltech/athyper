/**
 * AutonomyResolver — resolves the effective autonomy policy for a
 * (tenant, action_code, doc_class) triple via a three-level fallthrough:
 *
 *   1. DB row: (tenant_id, action_code, doc_class)       — most specific
 *   2. DB row: (tenant_id, action_code, NULL)             — tenant catch-all
 *   3. PLATFORM_DEFAULT_AUTONOMY[action_code]             — in-code default
 *
 * Results are cached in Redis for 60 seconds to avoid a DB round-trip on
 * every action invocation.  Cache key format:
 *   ai:autonomy:{tenantId}:{actionCode}:{docClass|"*"}
 */

import { sql } from "kysely";
import type { AnyDb, ActionPolicy, AutonomyLevel, AiLogger } from "./ai-runtime.types.js";

// Platform defaults — never stored in DB because tenant_id NOT NULL.
// A tenant opts in by inserting a row; absent rows get these defaults.
const PLATFORM_DEFAULT_AUTONOMY: Record<string, Pick<ActionPolicy, "autonomy_level" | "requires_human_confirmation">> = {
  extract_document:  { autonomy_level: "disabled", requires_human_confirmation: true  },
  classify:          { autonomy_level: "suggest",  requires_human_confirmation: true  },
  suggest:           { autonomy_level: "suggest",  requires_human_confirmation: false },
  autofill:          { autonomy_level: "disabled", requires_human_confirmation: true  },
  extract_entity:    { autonomy_level: "disabled", requires_human_confirmation: true  },
  match_record:      { autonomy_level: "suggest",  requires_human_confirmation: true  },
  summarize:         { autonomy_level: "disabled", requires_human_confirmation: false },
  translate:         { autonomy_level: "disabled", requires_human_confirmation: false },
};

const FALLBACK_POLICY: Pick<ActionPolicy, "autonomy_level" | "requires_human_confirmation"> = {
  autonomy_level: "disabled",
  requires_human_confirmation: true,
};

const CACHE_TTL_SECONDS = 60;

interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: "EX", ttl: number): Promise<unknown>;
}

export class AutonomyResolver {
  constructor(
    private readonly db:     AnyDb,
    private readonly cache:  RedisCache,
    private readonly logger: AiLogger,
  ) {}

  async resolve(tenantId: string, actionCode: string, docClass: string | null): Promise<ActionPolicy> {
    const cacheKey = `ai:autonomy:${tenantId}:${actionCode}:${docClass ?? "*"}`;

    const cached = await this.cache.get(cacheKey).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached) as ActionPolicy; } catch { /* fall through */ }
    }

    const policy = await this._resolveFromDb(tenantId, actionCode, docClass);
    await this.cache
      .set(cacheKey, JSON.stringify(policy), "EX", CACHE_TTL_SECONDS)
      .catch((e) => this.logger.warn("ai_autonomy_cache_set_failed", { err: String(e) }));

    return policy;
  }

  private async _resolveFromDb(
    tenantId: string,
    actionCode: string,
    docClass: string | null,
  ): Promise<ActionPolicy> {
    try {
      // Single query: fetch both specific and catch-all in one go, pick most specific
      const { rows } = await sql<{
        autonomy_level:              AutonomyLevel;
        min_confidence_for_auto:     number | null;
        requires_human_confirmation: boolean;
        is_active:                   boolean;
        doc_class:                   string | null;
      }>`
        SELECT autonomy_level, min_confidence_for_auto, requires_human_confirmation,
               is_active, doc_class
        FROM   control.ai_action_policy
        WHERE  tenant_id   = ${tenantId}::uuid
          AND  action_code = ${actionCode}
          AND  is_active   = true
          AND  (doc_class = ${docClass} OR doc_class IS NULL)
        ORDER BY CASE WHEN doc_class IS NOT NULL THEN 0 ELSE 1 END
        LIMIT  1
      `.execute(this.db);

      if (rows[0]) {
        return {
          autonomy_level:              rows[0].autonomy_level,
          min_confidence_for_auto:     rows[0].min_confidence_for_auto,
          requires_human_confirmation: rows[0].requires_human_confirmation,
          is_active:                   rows[0].is_active,
        };
      }
    } catch (e) {
      this.logger.warn("ai_autonomy_db_error", { actionCode, err: String(e) });
    }

    // Code-level platform default
    const def = PLATFORM_DEFAULT_AUTONOMY[actionCode] ?? FALLBACK_POLICY;
    return { ...def, min_confidence_for_auto: null, is_active: true };
  }
}
