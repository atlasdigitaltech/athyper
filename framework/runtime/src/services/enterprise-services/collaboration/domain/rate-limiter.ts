/**
 * Comment Rate Limiter
 *
 * Enforces rate limits on comment creation to prevent spam.
 * Checks recent comment count per user within a time window.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetAt: Date;
}

/**
 * Comment Rate Limiter
 */
export class CommentRateLimiter {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
    private readonly config?: {
      commentsPerMinute?: number;
    },
  ) {}

  /**
   * Check if user can create a comment
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @returns Rate limit result
   */
  async checkLimit(tenantId: string, userId: string): Promise<RateLimitResult> {
    const limit = this.config?.commentsPerMinute ?? 10;
    const windowMinutes = 1;
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const resetAt = new Date(Date.now() + windowMinutes * 60 * 1000);

    // Count recent comments from this user
    const result = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("commenter_id", "=", userId)
      .where("created_at", ">=", windowStart)
      .executeTakeFirst();

    const currentCount = Number(result?.count ?? 0);
    const allowed = currentCount < limit;

    if (!allowed) {
      this.logger.warn(
        {
          tenantId,
          userId,
          currentCount,
          limit,
        },
        "[collab] Rate limit exceeded for user",
      );
    }

    return {
      allowed,
      currentCount,
      limit,
      resetAt,
    };
  }

  /**
   * Check rate limit and throw error if exceeded
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @throws Error if rate limit exceeded
   */
  async enforceLimit(tenantId: string, userId: string): Promise<void> {
    const result = await this.checkLimit(tenantId, userId);

    if (!result.allowed) {
      throw new Error(
        `Rate limit exceeded: ${result.currentCount}/${result.limit} comments in the last minute. Please try again later.`,
      );
    }
  }
}
