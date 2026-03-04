/**
 * Collaboration Module
 *
 * Provides activity timelines, record-level comments, approval comments,
 * file attachments, @mentions, and threaded discussions.
 */

import { TOKENS } from "../../../kernel/tokens.js";

import {
  GetTimelineHandler,
  ListCommentsHandler,
  CreateCommentHandler,
  UpdateCommentHandler,
  DeleteCommentHandler,
  ListApprovalCommentsHandler,
  CreateApprovalCommentHandler,
  CreateReplyHandler,
  ListRepliesHandler,
  SearchCommentsHandler,
  FlagCommentHandler,
  ListFlagsHandler,
  ReviewFlagHandler,
  GetSLAMetricsHandler,
  GetSLABreachesHandler,
  SetSLAConfigHandler,
  GetAnalyticsSummaryHandler,
  GetDailyAnalyticsHandler,
  GetEngagementLeaderboardHandler,
  GetActiveThreadsHandler,
  ListRetentionPoliciesHandler,
  CreateRetentionPolicyHandler,
  UpdateRetentionPolicyHandler,
  DeleteRetentionPolicyHandler,
  ListArchivedCommentsHandler,
  RestoreArchivedCommentHandler,
} from "./api/handlers.js";
import {
  ToggleReactionHandler,
  GetReactionsHandler,
  ToggleApprovalReactionHandler,
} from "./api/reaction.handlers.js";
import {
  MarkCommentAsReadHandler,
  MarkAllCommentsAsReadHandler,
  GetUnreadCountHandler,
} from "./api/read-tracking.handlers.js";
import { ApprovalCommentService } from "./domain/approval-comment.service.js";
import { AttachmentLinkService } from "./domain/attachment-link.service.js";
import { CommentAnalyticsService } from "./domain/comment-analytics.service.js";
import { CommentModerationService } from "./domain/comment-moderation.service.js";
import { CommentRetentionService } from "./domain/comment-retention.service.js";
import { CommentSearchService } from "./domain/comment-search.service.js";
import { CommentSLAService } from "./domain/comment-sla.service.js";
import { EntityCommentService } from "./domain/entity-comment.service.js";
import { MentionService } from "./domain/mention.service.js";
import { CommentRateLimiter } from "./domain/rate-limiter.js";
import { ReactionService } from "./domain/reaction.service.js";
import { ReadTrackingService } from "./domain/read-tracking.service.js";
import { CollabTimelineService } from "./domain/timeline.service.js";
import { registerAnalyticsAggregationWorker } from "./jobs/analytics-aggregation.worker.js";
import { registerMentionNotificationWorker } from "./jobs/mention-notification.worker.js";
import { registerRetentionExecutionWorker } from "./jobs/retention-execution.worker.js";
import { ApprovalCommentRepository } from "./persistence/approval-comment.repository.js";
import { CommentFlagRepository } from "./persistence/comment-flag.repository.js";
import { EntityCommentRepository } from "./persistence/entity-comment.repository.js";
import { MentionRepository } from "./persistence/mention.repository.js";
import { ReactionRepository } from "./persistence/reaction.repository.js";
import { ReadTrackingRepository } from "./persistence/read-tracking.repository.js";

import type { RuntimeConfig } from "../../../kernel/config.schema.js";
import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";

export const module: RuntimeModule = {
  name: "enterprise.collaboration",

  async register(c: Container) {
    const logger = await c.resolve<Logger>(TOKENS.logger);
    logger.info("[collab] Registering collaboration module");

    // Phase 1: Timeline Service
    c.register(TOKENS.collabTimelineService, async () => {
      const activityTimeline = await c.resolve(TOKENS.auditTimeline) as any;
      return new CollabTimelineService(activityTimeline);
    }, "singleton");

    // Phase 5: Mention Repository
    c.register(TOKENS.collabMentionRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      return new MentionRepository(db);
    }, "singleton");

    // Phase 5: Mention Service
    c.register(TOKENS.collabMentionService, async () => {
      const repo = await c.resolve(TOKENS.collabMentionRepo) as any;
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      const config = await c.resolve<RuntimeConfig>(TOKENS.config);

      return new MentionService(repo, db, logger, {
        maxMentionsPerComment: config.collab.rateLimits.mentionsPerComment,
      });
    }, "singleton");

    // Phase 2: Entity Comment Repository
    c.register(TOKENS.collabCommentRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      return new EntityCommentRepository(db);
    }, "singleton");

    // Phase 2: Entity Comment Service
    c.register(TOKENS.collabCommentService, async () => {
      const repo = await c.resolve(TOKENS.collabCommentRepo) as any;
      const auditWriter = await c.resolve(TOKENS.auditWriter);
      const logger = await c.resolve<Logger>(TOKENS.logger);
      const config = await c.resolve<RuntimeConfig>(TOKENS.config);
      const mentionService = config.collab.mentionsEnabled
        ? await c.resolve(TOKENS.collabMentionService) as any
        : undefined;

      return new EntityCommentService(repo, auditWriter, logger, {
        maxCommentLength: config.collab.maxCommentLength,
      }, mentionService);
    }, "singleton");

    // Phase 3: Approval Comment Repository
    c.register(TOKENS.collabApprovalCommentRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      return new ApprovalCommentRepository(db);
    }, "singleton");

    // Phase 3: Approval Comment Service
    c.register(TOKENS.collabApprovalCommentService, async () => {
      const repo = await c.resolve(TOKENS.collabApprovalCommentRepo) as any;
      const auditWriter = await c.resolve(TOKENS.auditWriter);
      const logger = await c.resolve<Logger>(TOKENS.logger);
      const config = await c.resolve<RuntimeConfig>(TOKENS.config);
      const mentionService = config.collab.mentionsEnabled
        ? await c.resolve(TOKENS.collabMentionService) as any
        : undefined;

      return new ApprovalCommentService(repo, auditWriter, logger, {
        maxCommentLength: config.collab.maxCommentLength,
      }, mentionService);
    }, "singleton");

    // Phase 4: Attachment Link Service
    c.register(TOKENS.collabAttachmentService, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new AttachmentLinkService(db, logger);
    }, "singleton");

    // Phase 7: Rate Limiter
    c.register(TOKENS.collabRateLimiter, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      const config = await c.resolve<RuntimeConfig>(TOKENS.config);
      return new CommentRateLimiter(db, logger, {
        commentsPerMinute: config.collab.rateLimits.commentsPerMinute,
      });
    }, "singleton");

    // Phase 7: Search Service
    c.register(TOKENS.collabSearchService, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new CommentSearchService(db, logger);
    }, "singleton");

    // Enhancement 1: Reaction Repository & Service
    c.register(TOKENS.collabReactionRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      return new ReactionRepository(db);
    }, "singleton");

    c.register(TOKENS.collabReactionService, async () => {
      const repo = await c.resolve(TOKENS.collabReactionRepo) as any;
      const auditWriter = await c.resolve(TOKENS.auditWriter);
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new ReactionService(repo, auditWriter, logger);
    }, "singleton");

    // Enhancement 2: Read Tracking Repository & Service
    c.register(TOKENS.collabReadTrackingRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      // Optionally inject memory cache for Redis
      try {
        const cache = await c.resolve(TOKENS.cache) as any;
        return new ReadTrackingRepository(db, cache);
      } catch {
        return new ReadTrackingRepository(db);
      }
    }, "singleton");

    c.register(TOKENS.collabReadTrackingService, async () => {
      const repo = await c.resolve(TOKENS.collabReadTrackingRepo) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new ReadTrackingService(repo, logger);
    }, "singleton");

    // Phase 3 Enhancement: Moderation Repository
    c.register(TOKENS.collabModerationRepo, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      return new CommentFlagRepository(db);
    }, "singleton");

    // Phase 3 Enhancement: Moderation Service
    c.register(TOKENS.collabModerationService, async () => {
      const repo = await c.resolve(TOKENS.collabModerationRepo) as any;
      const auditWriter = await c.resolve(TOKENS.auditWriter);
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new CommentModerationService(repo, auditWriter, logger);
    }, "singleton");

    // Phase 3 Enhancement: SLA Tracking Service
    c.register(TOKENS.collabSLAService, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new CommentSLAService(db, logger);
    }, "singleton");

    // Phase 3 Enhancement: Analytics Service
    c.register(TOKENS.collabAnalyticsService, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new CommentAnalyticsService(db, logger);
    }, "singleton");

    // Phase 3 Enhancement: Retention Service
    c.register(TOKENS.collabRetentionService, async () => {
      const db = await c.resolve(TOKENS.db) as any;
      const auditWriter = await c.resolve(TOKENS.auditWriter);
      const logger = await c.resolve<Logger>(TOKENS.logger);
      return new CommentRetentionService(db, auditWriter, logger);
    }, "singleton");

    // Phase 1: Timeline Handler
    c.register("collab.handler.timeline", async () => new GetTimelineHandler(), "singleton");

    // Phase 2: Comment Handlers
    c.register("collab.handler.comments.list", async () => new ListCommentsHandler(), "singleton");
    c.register("collab.handler.comments.create", async () => new CreateCommentHandler(), "singleton");
    c.register("collab.handler.comments.update", async () => new UpdateCommentHandler(), "singleton");
    c.register("collab.handler.comments.delete", async () => new DeleteCommentHandler(), "singleton");

    // Phase 3: Approval Comment Handlers
    c.register("collab.handler.approvalComments.list", async () => new ListApprovalCommentsHandler(), "singleton");
    c.register("collab.handler.approvalComments.create", async () => new CreateApprovalCommentHandler(), "singleton");

    // Phase 6: Reply Handlers (Threading)
    c.register("collab.handler.replies.create", async () => new CreateReplyHandler(), "singleton");
    c.register("collab.handler.replies.list", async () => new ListRepliesHandler(), "singleton");

    // Phase 7: Search Handler
    c.register("collab.handler.search", async () => new SearchCommentsHandler(), "singleton");

    // Enhancement 1: Reaction Handlers
    c.register("collab.handler.reactions.toggle", async () => new ToggleReactionHandler(), "singleton");
    c.register("collab.handler.reactions.get", async () => new GetReactionsHandler(), "singleton");
    c.register("collab.handler.approvalReactions.toggle", async () => new ToggleApprovalReactionHandler(), "singleton");

    // Enhancement 2: Read Tracking Handlers
    c.register("collab.handler.read.mark", async () => new MarkCommentAsReadHandler(), "singleton");
    c.register("collab.handler.read.markAll", async () => new MarkAllCommentsAsReadHandler(), "singleton");
    c.register("collab.handler.read.count", async () => new GetUnreadCountHandler(), "singleton");

    // Phase 3: Moderation Handlers
    c.register("collab.handler.flags.create", async () => new FlagCommentHandler(), "singleton");
    c.register("collab.handler.flags.list", async () => new ListFlagsHandler(), "singleton");
    c.register("collab.handler.flags.review", async () => new ReviewFlagHandler(), "singleton");

    // Phase 3: SLA Handlers
    c.register("collab.handler.sla.metrics", async () => new GetSLAMetricsHandler(), "singleton");
    c.register("collab.handler.sla.breaches", async () => new GetSLABreachesHandler(), "singleton");
    c.register("collab.handler.sla.config", async () => new SetSLAConfigHandler(), "singleton");

    // Phase 3: Analytics Handlers
    c.register("collab.handler.analytics.summary", async () => new GetAnalyticsSummaryHandler(), "singleton");
    c.register("collab.handler.analytics.daily", async () => new GetDailyAnalyticsHandler(), "singleton");
    c.register("collab.handler.analytics.leaderboard", async () => new GetEngagementLeaderboardHandler(), "singleton");
    c.register("collab.handler.analytics.threads", async () => new GetActiveThreadsHandler(), "singleton");

    // Phase 3: Retention Handlers
    c.register("collab.handler.retention.policies.list", async () => new ListRetentionPoliciesHandler(), "singleton");
    c.register("collab.handler.retention.policies.create", async () => new CreateRetentionPolicyHandler(), "singleton");
    c.register("collab.handler.retention.policies.update", async () => new UpdateRetentionPolicyHandler(), "singleton");
    c.register("collab.handler.retention.policies.delete", async () => new DeleteRetentionPolicyHandler(), "singleton");
    c.register("collab.handler.retention.archived.list", async () => new ListArchivedCommentsHandler(), "singleton");
    c.register("collab.handler.retention.archived.restore", async () => new RestoreArchivedCommentHandler(), "singleton");

    logger.info("[collab] Collaboration module registered");
  },

  async contribute(c: Container) {
    const logger = await c.resolve<Logger>(TOKENS.logger);
    logger.info("[collab] Contributing collaboration module routes");

    const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

    // Phase 1: Timeline Route
    routes.add({
      method: "GET",
      path: "/api/collab/timeline",
      handlerToken: "collab.handler.timeline",
      authRequired: true,
      tags: ["collab", "timeline"],
    });

    // Phase 2: Comment Routes
    routes.add({
      method: "GET",
      path: "/api/collab/comments",
      handlerToken: "collab.handler.comments.list",
      authRequired: true,
      tags: ["collab", "comments"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/comments",
      handlerToken: "collab.handler.comments.create",
      authRequired: true,
      tags: ["collab", "comments"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/collab/comments/:id",
      handlerToken: "collab.handler.comments.update",
      authRequired: true,
      tags: ["collab", "comments"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/collab/comments/:id",
      handlerToken: "collab.handler.comments.delete",
      authRequired: true,
      tags: ["collab", "comments"],
    });

    // Enhancement 1: Reaction Routes
    routes.add({
      method: "POST",
      path: "/api/collab/comments/:id/reactions",
      handlerToken: "collab.handler.reactions.toggle",
      authRequired: true,
      tags: ["collab", "comments", "reactions"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/comments/:id/reactions",
      handlerToken: "collab.handler.reactions.get",
      authRequired: true,
      tags: ["collab", "comments", "reactions"],
    });

    // Enhancement 2: Read Tracking Routes
    routes.add({
      method: "POST",
      path: "/api/collab/comments/:id/read",
      handlerToken: "collab.handler.read.mark",
      authRequired: true,
      tags: ["collab", "comments", "read-tracking"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/comments/mark-all-read",
      handlerToken: "collab.handler.read.markAll",
      authRequired: true,
      tags: ["collab", "comments", "read-tracking"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/comments/unread-count",
      handlerToken: "collab.handler.read.count",
      authRequired: true,
      tags: ["collab", "comments", "read-tracking"],
    });

    // Phase 6: Reply Routes (Threading)
    routes.add({
      method: "POST",
      path: "/api/collab/comments/:id/replies",
      handlerToken: "collab.handler.replies.create",
      authRequired: true,
      tags: ["collab", "comments", "replies"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/comments/:id/replies",
      handlerToken: "collab.handler.replies.list",
      authRequired: true,
      tags: ["collab", "comments", "replies"],
    });

    // Phase 3: Approval Comment Routes
    routes.add({
      method: "GET",
      path: "/api/collab/approval-comments/:instanceId",
      handlerToken: "collab.handler.approvalComments.list",
      authRequired: true,
      tags: ["collab", "approval-comments"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/approval-comments",
      handlerToken: "collab.handler.approvalComments.create",
      authRequired: true,
      tags: ["collab", "approval-comments"],
    });

    // Phase 7: Search Route
    routes.add({
      method: "GET",
      path: "/api/collab/search",
      handlerToken: "collab.handler.search",
      authRequired: true,
      tags: ["collab", "search"],
    });

    // Phase 3: Moderation Routes
    routes.add({
      method: "POST",
      path: "/api/collab/flags",
      handlerToken: "collab.handler.flags.create",
      authRequired: true,
      tags: ["collab", "moderation"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/moderation/flags",
      handlerToken: "collab.handler.flags.list",
      authRequired: true,
      tags: ["collab", "moderation"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/moderation/flags/:id/review",
      handlerToken: "collab.handler.flags.review",
      authRequired: true,
      tags: ["collab", "moderation"],
    });

    // Phase 3: SLA Routes
    routes.add({
      method: "GET",
      path: "/api/collab/sla/metrics",
      handlerToken: "collab.handler.sla.metrics",
      authRequired: true,
      tags: ["collab", "sla"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/sla/breaches",
      handlerToken: "collab.handler.sla.breaches",
      authRequired: true,
      tags: ["collab", "sla"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/sla/config",
      handlerToken: "collab.handler.sla.config",
      authRequired: true,
      tags: ["collab", "sla"],
    });

    // Phase 3: Analytics Routes
    routes.add({
      method: "GET",
      path: "/api/collab/analytics/summary",
      handlerToken: "collab.handler.analytics.summary",
      authRequired: true,
      tags: ["collab", "analytics"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/analytics/daily",
      handlerToken: "collab.handler.analytics.daily",
      authRequired: true,
      tags: ["collab", "analytics"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/analytics/leaderboard",
      handlerToken: "collab.handler.analytics.leaderboard",
      authRequired: true,
      tags: ["collab", "analytics"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/analytics/threads",
      handlerToken: "collab.handler.analytics.threads",
      authRequired: true,
      tags: ["collab", "analytics"],
    });

    // Phase 3: Retention Policy Routes
    routes.add({
      method: "GET",
      path: "/api/collab/retention/policies",
      handlerToken: "collab.handler.retention.policies.list",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/retention/policies",
      handlerToken: "collab.handler.retention.policies.create",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    routes.add({
      method: "PATCH",
      path: "/api/collab/retention/policies/:id",
      handlerToken: "collab.handler.retention.policies.update",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/collab/retention/policies/:id",
      handlerToken: "collab.handler.retention.policies.delete",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    routes.add({
      method: "GET",
      path: "/api/collab/retention/archived",
      handlerToken: "collab.handler.retention.archived.list",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    routes.add({
      method: "POST",
      path: "/api/collab/retention/archived/:id/restore",
      handlerToken: "collab.handler.retention.archived.restore",
      authRequired: true,
      tags: ["collab", "retention"],
    });

    // Enhancement 2: Register mention notification worker
    try {
      const jobQueue = await c.resolve(TOKENS.jobQueue);
      const mentionService = await c.resolve<MentionService>(TOKENS.collabMentionService);

      // Inject job queue into mention service
      mentionService.setJobQueue(jobQueue);

      // Register worker
      await registerMentionNotificationWorker(c);

      logger.info("[collab] Mention notification worker registered");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[collab] Job queue not available, mention notifications will be disabled"
      );
    }

    // Phase 3: Register analytics aggregation worker (scheduled job)
    try {
      await registerAnalyticsAggregationWorker(c);
      logger.info("[collab] Analytics aggregation worker registered");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[collab] Analytics aggregation worker registration failed (non-fatal)"
      );
    }

    // Phase 3: Register retention execution worker (scheduled job)
    try {
      await registerRetentionExecutionWorker(c);
      logger.info("[collab] Retention execution worker registered");
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "[collab] Retention execution worker registration failed (non-fatal)"
      );
    }

    logger.info("[collab] Collaboration module contributed");
  },
};

export const moduleCode = "COLLAB";
export const moduleName = "Activity & Commentary";
