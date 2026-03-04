/**
 * Audit Slow Query Handler
 *
 * Callback for ActivityTimelineService.onSlowQuery.
 * Persists slow query events to core.security_event for auditor visibility
 * and increments the slow query metric.
 *
 * Contract: handle() NEVER throws — audit observability must not break queries.
 */

import { sql } from "kysely";

import type { TimelineQuery } from "./activity-timeline.service.js";
import type { AuditMetrics } from "../observability/metrics.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface SlowQueryLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export class AuditSlowQueryHandler {
  constructor(
    private readonly db: Kysely<DB> | null,
    private readonly metrics?: AuditMetrics,
    private readonly logger?: SlowQueryLogger,
  ) {}

  /**
   * Handle a slow query detection. Fire-and-forget — never blocks the caller.
   */
  handle(durationMs: number, query: TimelineQuery): void {
    // Metrics always (sync)
    this.metrics?.querySlowDetected({ tenant: query.tenantId });

    // Log (sync)
    this.logger?.warn(
      { durationMs, tenantId: query.tenantId, sources: query.sources },
      "[audit:timeline] Slow query detected",
    );

    // Persist to security_event (async, fire-and-forget)
    this.persistSlowQueryEvent(durationMs, query).catch(() => {
      // Swallow — persistence failure must not propagate
    });
  }

  private async persistSlowQueryEvent(
    durationMs: number,
    query: TimelineQuery,
  ): Promise<void> {
    if (!this.db) return;

    // Redact: no actorUserId in the logged details
    const queryParams = {
      tenantId: query.tenantId,
      entityType: query.entityType,
      entityId: query.entityId,
      sources: query.sources,
      limit: query.limit,
      offset: query.offset,
      startDate: query.startDate?.toISOString(),
      endDate: query.endDate?.toISOString(),
    };

    await sql`
      INSERT INTO core.security_event (
        id, tenant_id, event_type, severity, details, occurred_at
      ) VALUES (
        gen_random_uuid(),
        ${query.tenantId}::uuid,
        'AUDIT_QUERY_SLOW',
        'warning',
        ${JSON.stringify({ durationMs, queryParams })}::jsonb,
        now()
      )
    `.execute(this.db);
  }
}
