/**
 * Mention Service
 *
 * Parses @mentions from comment text and creates mention records.
 * Supports both @username and @{uuid} formats.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { MentionRepository } from "../persistence/mention.repository.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Parsed mention from text
 */
export interface ParsedMention {
  text: string; // Full mention text (e.g., "@john" or "@{uuid}")
  position: number; // Character position in text
  userId?: string; // Resolved user ID (if @{uuid} format)
  username?: string; // Username to resolve (if @username format)
}

/**
 * Mention processing result
 */
export interface MentionProcessingResult {
  mentionsCreated: number;
  mentionedUserIds: string[];
  unresolved: string[]; // Usernames that couldn't be resolved
}

/**
 * Mention Service
 */
export class MentionService {
  private jobQueue: any; // Job queue instance (set dynamically)

  constructor(
    private readonly repo: MentionRepository,
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
    private readonly config?: {
      maxMentionsPerComment?: number;
    },
  ) {}

  /**
   * Set job queue instance (called during module contribution)
   */
  setJobQueue(jobQueue: any) {
    this.jobQueue = jobQueue;
  }

  /**
   * Parse mentions from text
   *
   * Matches:
   * - @username (alphanumeric, dots, underscores, hyphens)
   * - @{uuid} (exact UUID format)
   *
   * @param text - Comment text to parse
   * @returns Array of parsed mentions
   */
  parseMentions(text: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];

    // Regex pattern:
    // - @\{[a-f0-9-]{36}\} matches @{uuid}
    // - @[\w.-]+ matches @username (word chars, dots, hyphens)
    const pattern = /@(\{[a-f0-9-]{36}\}|[\w.-]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0]; // e.g., "@john" or "@{uuid}"
      const captured = match[1]; // e.g., "john" or "{uuid}"

      // Check if it's a UUID format
      if (captured.startsWith("{") && captured.endsWith("}")) {
        const userId = captured.slice(1, -1); // Remove braces
        mentions.push({
          text: fullMatch,
          position: match.index,
          userId,
        });
      } else {
        // It's a username
        mentions.push({
          text: fullMatch,
          position: match.index,
          username: captured,
        });
      }
    }

    return mentions;
  }

  /**
   * Resolve a username to a user ID
   *
   * @param tenantId - Tenant ID
   * @param username - Username to resolve
   * @returns User ID or undefined if not found
   */
  async resolveUsername(
    tenantId: string,
    username: string,
  ): Promise<string | undefined> {
    const result = await this.db
      .selectFrom("core.principal")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("principal_code", "=", username)
      .where("is_active", "=", true)
      .executeTakeFirst();

    return result?.id;
  }

  /**
   * Process mentions in a comment
   *
   * Parses text, resolves usernames, creates mention records, and returns result.
   *
   * @param tenantId - Tenant ID
   * @param commentType - Type of comment (entity_comment or approval_comment)
   * @param commentId - Comment ID
   * @param commentText - Comment text to parse
   * @returns Processing result with created mentions and unresolved usernames
   */
  async processMentions(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    commentText: string,
  ): Promise<MentionProcessingResult> {
    const maxMentions = this.config?.maxMentionsPerComment ?? 20;

    // Parse mentions from text
    const parsed = this.parseMentions(commentText);

    if (parsed.length === 0) {
      return {
        mentionsCreated: 0,
        mentionedUserIds: [],
        unresolved: [],
      };
    }

    // Enforce max mentions limit
    if (parsed.length > maxMentions) {
      this.logger.warn(
        {
          tenantId,
          commentId,
          count: parsed.length,
          max: maxMentions,
        },
        "[collab] Too many mentions in comment, truncating",
      );
      parsed.splice(maxMentions);
    }

    // Resolve usernames to user IDs
    const mentionedUserIds = new Set<string>();
    const unresolved: string[] = [];

    for (const mention of parsed) {
      let userId: string | undefined;

      if (mention.userId) {
        // Already have UUID from @{uuid} format
        userId = mention.userId;
      } else if (mention.username) {
        // Need to resolve username
        userId = await this.resolveUsername(tenantId, mention.username);
        if (!userId) {
          unresolved.push(mention.username);
          this.logger.debug(
            {
              tenantId,
              username: mention.username,
            },
            "[collab] Could not resolve username",
          );
          continue;
        }
      }

      if (userId) {
        mentionedUserIds.add(userId);
      }
    }

    // Create mention records for resolved users
    let mentionsCreated = 0;
    for (const mention of parsed) {
      let userId: string | undefined;

      if (mention.userId) {
        userId = mention.userId;
      } else if (mention.username) {
        userId = await this.resolveUsername(tenantId, mention.username);
      }

      if (userId) {
        await this.repo.create({
          tenantId,
          commentType,
          commentId,
          mentionedUserId: userId,
          mentionText: mention.text,
          position: mention.position,
        });
        mentionsCreated++;
      }
    }

    // Queue notification jobs for mentioned users
    if (this.jobQueue && mentionedUserIds.size > 0) {
      for (const userId of mentionedUserIds) {
        try {
          await this.jobQueue.add("mention-notification", {
            tenantId,
            mentionedUserId: userId,
            commentType,
            commentId,
          });
        } catch (err) {
          this.logger.error(
            {
              tenantId,
              userId,
              commentId,
              error: String(err),
            },
            "[collab] Failed to queue mention notification",
          );
        }
      }
    }

    this.logger.info(
      {
        tenantId,
        commentType,
        commentId,
        mentionsCreated,
        unresolved: unresolved.length,
        mentionedUsers: Array.from(mentionedUserIds),
      },
      "[collab] Processed mentions",
    );

    return {
      mentionsCreated,
      mentionedUserIds: Array.from(mentionedUserIds),
      unresolved,
    };
  }

  /**
   * Get mentions for a comment
   */
  async getByComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ) {
    return this.repo.listByComment(tenantId, commentType, commentId);
  }

  /**
   * Get mentions for a user (notification inbox)
   */
  async getByUser(
    tenantId: string,
    userId: string,
    options?: { limit?: number; offset?: number },
  ) {
    return this.repo.listByUser(tenantId, userId, options);
  }
}
