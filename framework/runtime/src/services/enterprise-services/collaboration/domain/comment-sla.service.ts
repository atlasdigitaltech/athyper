/**
 * Comment SLA Service
 *
 * Tracks and reports on comment response times and SLA compliance.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * SLA Metrics
 */
export interface SLAMetrics {
  entityType: string;
  entityId: string;
  firstCommentAt: Date;
  firstResponseAt?: Date;
  firstResponseTimeSeconds?: number;
  totalComments: number;
  totalResponses: number;
  avgResponseTimeSeconds?: number;
  maxResponseTimeSeconds?: number;
  slaTargetSeconds?: number;
  isSLABreached: boolean;
}

/**
 * SLA Config
 */
export interface SLAConfig {
  entityType: string;
  slaTargetSeconds: number;
  enabled: boolean;
  businessHoursOnly: boolean;
}

/**
 * Comment SLA Service
 */
export class CommentSLAService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
  ) {}

  /**
   * Track new comment for SLA purposes
   *
   * Called after every comment creation.
   */
  async trackComment(
    tenantId: string,
    entityType: string,
    entityId: string,
    commentId: string,
    commenterId: string,
    parentCommentId?: string,
  ): Promise<void> {
    const now = new Date();

    // Get SLA config for this entity type
    const slaConfig = await this.getSLAConfig(tenantId, entityType);

    // Check if this is the first comment on the entity
    const existing = await this.db
      .selectFrom("collab.comment_sla_metrics")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .executeTakeFirst();

    if (!existing) {
      // First comment - initialize SLA tracking
      await this.db
        .insertInto("collab.comment_sla_metrics")
        .values({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          entity_type: entityType,
          entity_id: entityId,
          first_comment_at: now,
          first_comment_by: commenterId,
          total_comments: 1,
          total_responses: 0,
          sla_target_seconds: slaConfig?.slaTargetSeconds ?? null,
          is_sla_breached: false,
          created_at: now,
          updated_at: now,
        })
        .execute();

      // Log first comment (no response time)
      await this.logResponseHistory(
        tenantId,
        entityType,
        entityId,
        commentId,
        commenterId,
        null,
        null,
      );
    } else {
      // Subsequent comment
      const isResponse = existing.first_comment_by !== commenterId;

      // Calculate response time (time since first comment or previous comment)
      const responseTimeSeconds = Math.floor(
        (now.getTime() - new Date(existing.first_comment_at).getTime()) / 1000,
      );

      // Update metrics
      const updateSet: Record<string, any> = {
        updated_at: now,
      };

      // Increment total_comments via raw SQL expression
      updateSet.total_comments = (eb: any) => eb.raw("total_comments + 1");

      if (isResponse && !existing.first_response_at) {
        updateSet.first_response_at = now;
        updateSet.first_response_by = commenterId;
        updateSet.first_response_time_seconds = responseTimeSeconds;
        if (slaConfig && responseTimeSeconds > slaConfig.slaTargetSeconds) {
          updateSet.is_sla_breached = true;
        }
      }

      await this.db
        .updateTable("collab.comment_sla_metrics")
        .set(updateSet as any)
        .where("tenant_id", "=", tenantId)
        .where("entity_type", "=", entityType)
        .where("entity_id", "=", entityId)
        .execute();

      // Log response history
      await this.logResponseHistory(
        tenantId,
        entityType,
        entityId,
        commentId,
        commenterId,
        parentCommentId ?? null,
        responseTimeSeconds,
      );
    }
  }

  /**
   * Get SLA metrics for an entity
   */
  async getSLAMetrics(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<SLAMetrics | undefined> {
    const row = await this.db
      .selectFrom("collab.comment_sla_metrics")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      firstCommentAt: row.first_comment_at,
      firstResponseAt: row.first_response_at ?? undefined,
      firstResponseTimeSeconds: row.first_response_time_seconds ?? undefined,
      totalComments: row.total_comments,
      totalResponses: row.total_responses,
      avgResponseTimeSeconds: row.avg_response_time_seconds ?? undefined,
      maxResponseTimeSeconds: row.max_response_time_seconds ?? undefined,
      slaTargetSeconds: row.sla_target_seconds ?? undefined,
      isSLABreached: row.is_sla_breached,
    };
  }

  /**
   * Get SLA breaches (for reporting/alerting)
   */
  async getSLABreaches(
    tenantId: string,
    entityType?: string,
    limit: number = 50,
  ): Promise<SLAMetrics[]> {
    let query = this.db
      .selectFrom("collab.comment_sla_metrics")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_sla_breached", "=", true);

    if (entityType) {
      query = query.where("entity_type", "=", entityType);
    }

    const rows = await query
      .orderBy("first_comment_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      firstCommentAt: row.first_comment_at,
      firstResponseAt: row.first_response_at ?? undefined,
      firstResponseTimeSeconds: row.first_response_time_seconds ?? undefined,
      totalComments: row.total_comments,
      totalResponses: row.total_responses,
      avgResponseTimeSeconds: row.avg_response_time_seconds ?? undefined,
      maxResponseTimeSeconds: row.max_response_time_seconds ?? undefined,
      slaTargetSeconds: row.sla_target_seconds ?? undefined,
      isSLABreached: row.is_sla_breached,
    }));
  }

  /**
   * Get pending responses (no response yet)
   */
  async getPendingResponses(
    tenantId: string,
    entityType?: string,
    limit: number = 50,
  ): Promise<SLAMetrics[]> {
    let query = this.db
      .selectFrom("collab.comment_sla_metrics")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("first_response_at", "is", null);

    if (entityType) {
      query = query.where("entity_type", "=", entityType);
    }

    const rows = await query
      .orderBy("first_comment_at", "asc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      firstCommentAt: row.first_comment_at,
      firstResponseAt: row.first_response_at ?? undefined,
      firstResponseTimeSeconds: row.first_response_time_seconds ?? undefined,
      totalComments: row.total_comments,
      totalResponses: row.total_responses,
      avgResponseTimeSeconds: row.avg_response_time_seconds ?? undefined,
      maxResponseTimeSeconds: row.max_response_time_seconds ?? undefined,
      slaTargetSeconds: row.sla_target_seconds ?? undefined,
      isSLABreached: row.is_sla_breached,
    }));
  }

  /**
   * Get or create SLA config
   */
  async getSLAConfig(
    tenantId: string,
    entityType: string,
  ): Promise<SLAConfig | undefined> {
    const row = await this.db
      .selectFrom("collab.comment_sla_config")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      entityType: row.entity_type,
      slaTargetSeconds: row.sla_target_seconds,
      enabled: row.enabled,
      businessHoursOnly: row.business_hours_only,
    };
  }

  /**
   * Set SLA config
   */
  async setSLAConfig(
    tenantId: string,
    entityType: string,
    slaTargetSeconds: number,
    options?: {
      businessHoursOnly?: boolean;
    },
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("collab.comment_sla_config")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        created_by: "system",
        entity_type: entityType,
        sla_target_seconds: slaTargetSeconds,
        enabled: true,
        business_hours_only: options?.businessHoursOnly ?? false,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "entity_type"]).doUpdateSet({
          sla_target_seconds: slaTargetSeconds,
          business_hours_only: options?.businessHoursOnly ?? false,
          updated_at: now,
        }),
      )
      .execute();
  }

  /**
   * Log response history
   */
  private async logResponseHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    commentId: string,
    commenterId: string,
    parentCommentId: string | null,
    responseTimeSeconds: number | null,
  ): Promise<void> {
    await this.db
      .insertInto("collab.comment_response")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        comment_id: commentId,
        parent_comment_id: parentCommentId,
        commenter_id: commenterId,
        response_time_seconds: responseTimeSeconds,
        created_at: new Date(),
      })
      .onConflict((oc) => oc.columns(["tenant_id", "comment_id"]).doNothing())
      .execute();
  }
}
