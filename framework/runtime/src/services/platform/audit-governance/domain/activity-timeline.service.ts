/**
 * Unified Activity Timeline Service
 *
 * Read-model that merges events from multiple audit tables into a single
 * chronological timeline. Queries by (tenant, entity, time range) using
 * UNION ALL across:
 *
 *   - core.workflow_event_log  (workflow events)
 *   - core.permission_decision_log (access decisions)
 *   - core.field_access_log      (field access)
 *   - core.security_event        (security events)
 *   - core.audit_log             (entity CRUD)
 */

import { sql } from "kysely";

import type { AuditFeatureFlagResolver } from "./audit-feature-flags.js";
import type { TimelineCacheService } from "./timeline-cache.service.js";
import type { AuditMetrics } from "../observability/metrics.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export type TimelineEventSource =
  | "workflow_audit"
  | "permission_decision"
  | "field_access"
  | "security_event"
  | "audit_log";

export interface ActivityTimelineEntry {
  id: string;
  source: TimelineEventSource;
  tenantId: string;
  eventType: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  actorDisplayName?: string;
  summary: string;
  details?: Record<string, unknown>;
  occurredAt: Date;
}

export interface TimelineQuery {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  startDate?: Date;
  endDate?: Date;
  sources?: TimelineEventSource[];
  limit?: number;
  offset?: number;
}

// ============================================================================
// Service
// ============================================================================

/** Default query timeout warning threshold in ms */
const TIMELINE_TIMEOUT_WARN_MS = 200;

export class ActivityTimelineService {
  private flagResolver?: AuditFeatureFlagResolver;
  private cache?: TimelineCacheService;
  private metricsCollector?: AuditMetrics;
  private timeoutWarnMs: number = TIMELINE_TIMEOUT_WARN_MS;
  private onSlowQuery?: (durationMs: number, query: TimelineQuery) => void;

  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Set the feature flag resolver (called during DI wiring).
   */
  setFlagResolver(resolver: AuditFeatureFlagResolver): void {
    this.flagResolver = resolver;
  }

  /**
   * Set the cache service (called during DI wiring).
   */
  setCache(cache: TimelineCacheService): void {
    this.cache = cache;
  }

  /**
   * Set the slow query callback for observability.
   */
  setSlowQueryHandler(
    handler: (durationMs: number, query: TimelineQuery) => void,
  ): void {
    this.onSlowQuery = handler;
  }

  /**
   * Set the metrics collector for recording timeline query latency (all queries).
   */
  setMetricsCollector(metrics: AuditMetrics): void {
    this.metricsCollector = metrics;
  }

  /**
   * Query the unified activity timeline across all audit sources.
   * Returns events ordered by occurrence time (newest first).
   * Returns empty array when timeline feature flag is disabled.
   */
  async query(params: TimelineQuery): Promise<ActivityTimelineEntry[]> {
    // Check feature flag — return empty when disabled
    if (this.flagResolver) {
      const flags = await this.flagResolver.resolve(params.tenantId);
      if (!flags.timelineEnabled) {
        return [];
      }
    }

    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get(params);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();

    const {
      tenantId,
      entityType,
      entityId,
      actorUserId,
      startDate,
      endDate,
      sources,
      limit = 100,
      offset = 0,
    } = params;

    const enabledSources = sources ?? [
      "workflow_audit",
      "permission_decision",
      "field_access",
      "security_event",
      "audit_log",
    ];

    // Build individual CTEs per source
    const fragments: ReturnType<typeof sql>[] = [];

    if (enabledSources.includes("workflow_audit")) {
      fragments.push(
        this.buildWorkflowAuditFragment(
          tenantId,
          entityType,
          entityId,
          actorUserId,
          startDate,
          endDate,
        ),
      );
    }
    if (enabledSources.includes("permission_decision")) {
      fragments.push(
        this.buildPermissionDecisionFragment(
          tenantId,
          entityType,
          entityId,
          actorUserId,
          startDate,
          endDate,
        ),
      );
    }
    if (enabledSources.includes("field_access")) {
      fragments.push(
        this.buildFieldAccessFragment(
          tenantId,
          entityType,
          entityId,
          actorUserId,
          startDate,
          endDate,
        ),
      );
    }
    if (enabledSources.includes("security_event")) {
      fragments.push(
        this.buildSecurityEventFragment(
          tenantId,
          actorUserId,
          startDate,
          endDate,
        ),
      );
    }
    if (enabledSources.includes("audit_log")) {
      fragments.push(
        this.buildAuditLogFragment(
          tenantId,
          entityType,
          entityId,
          actorUserId,
          startDate,
          endDate,
        ),
      );
    }

    if (fragments.length === 0) {
      return [];
    }

    // UNION ALL all fragments, order by occurred_at desc
    const unionAll = fragments.reduce((acc, frag, i) =>
      i === 0 ? frag : sql`${acc} UNION ALL ${frag}`,
    );

    const result = await sql<any>`
      SELECT * FROM (${unionAll}) AS timeline
      ORDER BY occurred_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `.execute(this.db);

    const entries = (result.rows ?? []).map((r: any) => this.mapRow(r));

    // Record latency for ALL queries
    const durationMs = Date.now() - startTime;
    this.metricsCollector?.timelineQueryLatency(durationMs, {
      tenant: tenantId,
    });

    // Timeout guard: warn on slow queries
    if (durationMs > this.timeoutWarnMs && this.onSlowQuery) {
      this.onSlowQuery(durationMs, params);
    }

    // Cache results
    if (this.cache) {
      await this.cache.set(params, entries);
    }

    return entries;
  }

  // --------------------------------------------------------------------------
  // Source query fragments
  // --------------------------------------------------------------------------

  private buildWorkflowAuditFragment(
    tenantId: string,
    entityType?: string,
    entityId?: string,
    actorUserId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (entityType) conditions.push(sql`entity_type = ${entityType}`);
    if (entityId) conditions.push(sql`entity_id = ${entityId}`);
    if (actorUserId) conditions.push(sql`actor_user_id = ${actorUserId}`);
    if (startDate)
      conditions.push(
        sql`event_timestamp >= ${startDate.toISOString()}::timestamptz`,
      );
    if (endDate)
      conditions.push(
        sql`event_timestamp <= ${endDate.toISOString()}::timestamptz`,
      );

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    return sql`
      SELECT
        id::text,
        'workflow_audit' AS source,
        tenant_id::text AS tenant_id,
        event_type,
        severity,
        entity_type,
        entity_id,
        actor_user_id,
        actor->>'displayName' AS actor_display_name,
        COALESCE(comment, event_type) AS summary,
        details,
        event_timestamp AS occurred_at
      FROM core.workflow_event_log
      WHERE ${where}
    `;
  }

  private buildPermissionDecisionFragment(
    tenantId: string,
    entityType?: string,
    entityId?: string,
    actorUserId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (entityType) conditions.push(sql`resource_type = ${entityType}`);
    if (entityId) conditions.push(sql`resource_id = ${entityId}`);
    if (actorUserId) conditions.push(sql`principal_id::text = ${actorUserId}`);
    if (startDate)
      conditions.push(
        sql`decided_at >= ${startDate.toISOString()}::timestamptz`,
      );
    if (endDate)
      conditions.push(sql`decided_at <= ${endDate.toISOString()}::timestamptz`);

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    return sql`
      SELECT
        id::text,
        'permission_decision' AS source,
        tenant_id::text AS tenant_id,
        'permission.' || decision AS event_type,
        CASE WHEN decision = 'denied' THEN 'warning' ELSE 'info' END AS severity,
        resource_type AS entity_type,
        resource_id AS entity_id,
        principal_id::text AS actor_user_id,
        NULL AS actor_display_name,
        'Permission ' || decision || ' on ' || permission_code AS summary,
        context AS details,
        decided_at AS occurred_at
      FROM core.permission_decision_log
      WHERE ${where}
    `;
  }

  private buildFieldAccessFragment(
    tenantId: string,
    entityType?: string,
    entityId?: string,
    actorUserId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (entityType) conditions.push(sql`entity_type = ${entityType}`);
    if (entityId) conditions.push(sql`entity_id = ${entityId}`);
    if (actorUserId) conditions.push(sql`principal_id::text = ${actorUserId}`);
    if (startDate)
      conditions.push(
        sql`accessed_at >= ${startDate.toISOString()}::timestamptz`,
      );
    if (endDate)
      conditions.push(
        sql`accessed_at <= ${endDate.toISOString()}::timestamptz`,
      );

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    return sql`
      SELECT
        id::text,
        'field_access' AS source,
        tenant_id::text AS tenant_id,
        'field.' || access_type AS event_type,
        CASE WHEN classification IN ('restricted','confidential') THEN 'warning' ELSE 'info' END AS severity,
        entity_type,
        entity_id,
        principal_id::text AS actor_user_id,
        NULL AS actor_display_name,
        access_type || ' access on ' || field_name AS summary,
        NULL::jsonb AS details,
        accessed_at AS occurred_at
      FROM core.field_access_log
      WHERE ${where}
    `;
  }

  private buildSecurityEventFragment(
    tenantId: string,
    actorUserId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (actorUserId) conditions.push(sql`principal_id::text = ${actorUserId}`);
    if (startDate)
      conditions.push(
        sql`occurred_at >= ${startDate.toISOString()}::timestamptz`,
      );
    if (endDate)
      conditions.push(
        sql`occurred_at <= ${endDate.toISOString()}::timestamptz`,
      );

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    return sql`
      SELECT
        id::text,
        'security_event' AS source,
        tenant_id::text AS tenant_id,
        event_type,
        severity,
        NULL AS entity_type,
        NULL AS entity_id,
        principal_id::text AS actor_user_id,
        NULL AS actor_display_name,
        event_type AS summary,
        details,
        occurred_at
      FROM core.security_event
      WHERE ${where}
    `;
  }

  private buildAuditLogFragment(
    tenantId: string,
    entityType?: string,
    entityId?: string,
    actorUserId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const conditions = [sql`tenant_id = ${tenantId}::uuid`];
    if (entityType) conditions.push(sql`entity_type = ${entityType}`);
    if (entityId) conditions.push(sql`entity_id = ${entityId}`);
    if (actorUserId) conditions.push(sql`performed_by = ${actorUserId}`);
    if (startDate)
      conditions.push(
        sql`performed_at >= ${startDate.toISOString()}::timestamptz`,
      );
    if (endDate)
      conditions.push(
        sql`performed_at <= ${endDate.toISOString()}::timestamptz`,
      );

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    return sql`
      SELECT
        id::text,
        'audit_log' AS source,
        tenant_id::text AS tenant_id,
        action AS event_type,
        'info' AS severity,
        entity_type,
        entity_id,
        performed_by AS actor_user_id,
        NULL AS actor_display_name,
        action || ' on ' || entity_type AS summary,
        changes AS details,
        performed_at AS occurred_at
      FROM core.audit_log
      WHERE ${where}
    `;
  }

  // --------------------------------------------------------------------------
  // Row mapping
  // --------------------------------------------------------------------------

  private mapRow(row: any): ActivityTimelineEntry {
    return {
      id: row.id,
      source: row.source as TimelineEventSource,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      severity: row.severity ?? "info",
      entityType: row.entity_type ?? undefined,
      entityId: row.entity_id ?? undefined,
      actorUserId: row.actor_user_id ?? undefined,
      actorDisplayName: row.actor_display_name ?? undefined,
      summary: row.summary ?? row.event_type,
      details:
        typeof row.details === "string"
          ? JSON.parse(row.details)
          : (row.details ?? undefined),
      occurredAt:
        row.occurred_at instanceof Date
          ? row.occurred_at
          : new Date(row.occurred_at),
    };
  }
}
