/**
 * Comment Analytics Service
 *
 * Provides engagement analytics, metrics, and insights.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Daily Analytics
 */
export interface DailyAnalytics {
  date: string;
  entityType?: string;
  totalComments: number;
  totalReplies: number;
  uniqueCommenters: number;
  totalReactions: number;
  totalFlags: number;
  avgCommentLength?: number;
}

/**
 * User Engagement Metrics
 */
export interface UserEngagement {
  userId: string;
  periodStart: string;
  periodEnd: string;
  totalComments: number;
  totalReplies: number;
  totalReactionsGiven: number;
  totalReactionsReceived: number;
  totalMentionsReceived: number;
  avgResponseTimeSeconds?: number;
  engagementScore?: number;
}

/**
 * Thread Analytics
 */
export interface ThreadAnalytics {
  entityType: string;
  entityId: string;
  totalComments: number;
  uniqueParticipants: number;
  totalReactions: number;
  threadDepth: number;
  firstCommentAt: Date;
  lastCommentAt: Date;
  isActive: boolean;
}

/**
 * Analytics Summary
 */
export interface AnalyticsSummary {
  totalComments: number;
  totalUsers: number;
  avgCommentsPerUser: number;
  totalThreads: number;
  activeThreads: number;
  avgResponseTimeSeconds?: number;
  topContributors: Array<{ userId: string; commentCount: number }>;
}

/**
 * Comment Analytics Service
 */
export class CommentAnalyticsService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger
  ) {}

  /**
   * Get daily analytics for a date range
   */
  async getDailyAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    entityType?: string
  ): Promise<DailyAnalytics[]> {
    let query = this.db
      .selectFrom("collab.comment_analytics_daily")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("date", ">=", startDate as any)
      .where("date", "<=", endDate as any);

    if (entityType) {
      query = query.where("entity_type", "=", entityType);
    }

    const rows = await query.orderBy("date", "asc").execute();

    return rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      entityType: row.entity_type ?? undefined,
      totalComments: row.total_comments,
      totalReplies: row.total_replies,
      uniqueCommenters: row.unique_commenters,
      totalReactions: row.total_reactions,
      totalFlags: row.total_flags,
      avgCommentLength: row.avg_comment_length != null ? Number(row.avg_comment_length) : undefined,
    }));
  }

  /**
   * Get user engagement leaderboard
   */
  async getUserEngagementLeaderboard(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number = 10
  ): Promise<UserEngagement[]> {
    const rows = await this.db
      .selectFrom("collab.comment_user_analytics")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("period_start", "=", periodStart as any)
      .where("period_end", "=", periodEnd as any)
      .orderBy("engagement_score", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      userId: row.user_id,
      periodStart: row.period_start.toISOString().split('T')[0],
      periodEnd: row.period_end.toISOString().split('T')[0],
      totalComments: row.total_comments,
      totalReplies: row.total_replies,
      totalReactionsGiven: row.total_reactions_given,
      totalReactionsReceived: row.total_reactions_received,
      totalMentionsReceived: row.total_mentions_received,
      avgResponseTimeSeconds: row.avg_response_time_seconds ?? undefined,
      engagementScore: row.engagement_score ?? undefined,
    }));
  }

  /**
   * Get most active threads
   */
  async getMostActiveThreads(
    tenantId: string,
    entityType?: string,
    limit: number = 10,
    activeOnly: boolean = true
  ): Promise<ThreadAnalytics[]> {
    let query = this.db
      .selectFrom("collab.comment_thread_analytics")
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (entityType) {
      query = query.where("entity_type", "=", entityType);
    }

    if (activeOnly) {
      query = query.where("is_active", "=", true);
    }

    const rows = await query.orderBy("total_comments", "desc").limit(limit).execute();

    return rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      totalComments: row.total_comments,
      uniqueParticipants: row.unique_participants,
      totalReactions: row.total_reactions,
      threadDepth: row.thread_depth,
      firstCommentAt: row.first_comment_at,
      lastCommentAt: row.last_comment_at,
      isActive: row.is_active,
    }));
  }

  /**
   * Get analytics summary
   */
  async getAnalyticsSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsSummary> {
    // Total comments in period
    const commentStats = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => [
        fn.count<number>("id").as("total"),
        fn.count<number>("commenter_id").as("unique_users"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDate)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    // Thread stats
    const threadStats = await this.db
      .selectFrom("collab.comment_thread_analytics")
      .select(({ fn }) => [
        fn.count<number>("id").as("total_threads"),
        fn.sum<number>("total_comments").as("active_threads"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .executeTakeFirst();

    // Top contributors
    const topContributors = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => [
        "commenter_id" as const,
        fn.count<number>("id").as("comment_count"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDate)
      .where("deleted_at", "is", null)
      .groupBy("commenter_id")
      .orderBy("comment_count", "desc")
      .limit(5)
      .execute();

    const totalComments = Number(commentStats?.total ?? 0);
    const totalUsers = Number(commentStats?.unique_users ?? 0);

    return {
      totalComments,
      totalUsers,
      avgCommentsPerUser: totalUsers > 0 ? totalComments / totalUsers : 0,
      totalThreads: Number(threadStats?.total_threads ?? 0),
      activeThreads: Number(threadStats?.active_threads ?? 0),
      topContributors: topContributors.map((row) => ({
        userId: row.commenter_id,
        commentCount: Number(row.comment_count),
      })),
    };
  }

  /**
   * Update daily analytics (called by scheduled job)
   *
   * Aggregates comment data into daily metrics.
   */
  async updateDailyAnalytics(tenantId: string, date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    // Aggregate comment stats for the day
    const stats = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => [
        "entity_type" as const,
        fn.count<number>("id").as("total_comments"),
        fn.count<number>("id").as("total_replies"),
        fn.count<number>("commenter_id").as("unique_commenters"),
        fn.count<number>("id").as("avg_length"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", date)
      .where("created_at", "<", nextDate)
      .where("deleted_at", "is", null)
      .groupBy("entity_type")
      .execute();

    // Upsert daily analytics
    for (const stat of stats) {
      await this.db
        .insertInto("collab.comment_analytics_daily")
        .values({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          date: dateStr,
          entity_type: stat.entity_type ?? null,
          total_comments: Number(stat.total_comments),
          total_replies: Number(stat.total_replies ?? 0),
          unique_commenters: Number(stat.unique_commenters),
          total_reactions: 0, // TODO: aggregate from reactions table
          total_flags: 0, // TODO: aggregate from flags table
          avg_comment_length: String(Math.floor(Number(stat.avg_length ?? 0))),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.columns(['tenant_id', 'date', 'entity_type']).doUpdateSet({
            total_comments: Number(stat.total_comments),
            total_replies: Number(stat.total_replies ?? 0),
            unique_commenters: Number(stat.unique_commenters),
            avg_comment_length: String(Math.floor(Number(stat.avg_length ?? 0))),
            updated_at: new Date(),
          })
        )
        .execute();
    }

    this.logger.info(
      { tenantId, date: dateStr, statsCount: stats.length },
      "[collab] Daily analytics updated"
    );
  }
}
