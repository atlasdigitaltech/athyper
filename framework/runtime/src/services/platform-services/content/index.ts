/**
 * Content Management Module — Module Composition Root
 *
 * Registers all content services, repos, handlers, routes, and workers.
 * Follows the RuntimeModule pattern (register + contribute).
 *
 * Features:
 * - File upload/download with S3 presigned URLs
 * - Document versioning with history tracking
 * - Entity-document many-to-many linking
 * - Per-document ACL management
 * - Orphaned upload cleanup worker
 * - Comprehensive audit trail
 */

import { TOKENS } from "../../../kernel/tokens.js";

// Persistence
import {
  GetAccessHistoryHandler,
  GetAccessStatsHandler,
} from "./api/handlers/access-log.handler.js";
import {
  GrantPermissionHandler,
  RevokePermissionHandler,
  ListAclsHandler,
} from "./api/handlers/acl.handler.js";
import {
  ListCommentsHandler,
  CreateCommentHandler,
  UpdateCommentHandler,
  DeleteCommentHandler,
  ReplyToCommentHandler,
} from "./api/handlers/comment.handler.js";
import {
  SetExpirationHandler,
  ClearExpirationHandler,
} from "./api/handlers/expiry.handler.js";
import {
  LinkDocumentHandler,
  UnlinkDocumentHandler,
  GetLinkedEntitiesHandler,
} from "./api/handlers/link.handler.js";
import {
  InitiateMultipartHandler,
  GetPartUploadUrlsHandler,
  CompleteMultipartHandler,
  AbortMultipartHandler,
} from "./api/handlers/multipart.handler.js";
import {
  GetPreviewUrlHandler,
  GeneratePreviewHandler,
} from "./api/handlers/preview.handler.js";
import {
  InitiateUploadHandler,
  CompleteUploadHandler,
  GetDownloadUrlHandler,
  DeleteFileHandler,
  ListByEntityHandler,
  GetMetadataHandler,
} from "./api/handlers/upload.handler.js";
import {
  GetVersionsHandler,
  InitiateVersionHandler,
  CompleteVersionHandler,
  RestoreVersionHandler,
} from "./api/handlers/version.handler.js";
import { AccessLogService } from "./domain/services/AccessLogService.js";
import { AclService } from "./domain/services/AclService.js";
import { CommentService } from "./domain/services/CommentService.js";
import { ContentAuditEmitter } from "./domain/services/ContentAuditEmitter.js";
import { ContentService } from "./domain/services/ContentService.js";
import { ExpiryService } from "./domain/services/ExpiryService.js";
import { LinkService } from "./domain/services/LinkService.js";
import { MultipartUploadService } from "./domain/services/MultipartUploadService.js";
import { PreviewService } from "./domain/services/PreviewService.js";
import { VersionService } from "./domain/services/VersionService.js";
import { createCleanupOrphanedUploadsHandler } from "./jobs/workers/cleanupOrphanedUploads.worker.js";
import { AccessLogRepo } from "./persistence/AccessLogRepo.js";
import { AttachmentRepo } from "./persistence/AttachmentRepo.js";
import { CommentRepo } from "./persistence/CommentRepo.js";
import { DocumentAclRepo } from "./persistence/DocumentAclRepo.js";
import { EntityDocumentLinkRepo } from "./persistence/EntityDocumentLinkRepo.js";
import { MultipartUploadRepo } from "./persistence/MultipartUploadRepo.js";
import { createCleanupAccessLogsHandler } from "./workers/cleanup-access-logs.worker.js";
import { createCleanupExpiredFilesHandler } from "./workers/cleanup-expired-files.worker.js";
import { createCleanupStaleMultipartHandler } from "./workers/cleanup-stale-multipart.worker.js";
import { createGeneratePreviewsHandler } from "./workers/generate-previews.worker.js";

import type { AuditWriter } from "../../../kernel/audit.js";
import type { RuntimeConfig } from "../../../kernel/config.schema.js";
import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { JobRegistry } from "../../platform/foundation/registries/jobs.registry.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";
import type { DB } from "@athyper/adapter-db";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import type { Kysely } from "kysely";

// ============================================================================
// Repo Tokens (internal to this module)
// ============================================================================

const REPO_TOKENS = {
  attachment: "content.repo.attachment",
  entityDocumentLink: "content.repo.entityDocumentLink",
  documentAcl: "content.repo.documentAcl",
  accessLog: "content.repo.accessLog",
  comment: "content.repo.comment",
  multipartUpload: "content.repo.multipartUpload",
} as const;

// ============================================================================
// Handler Tokens (internal to this module)
// ============================================================================

const HANDLER_TOKENS = {
  // Upload
  initiateUpload: "content.handler.initiateUpload",
  completeUpload: "content.handler.completeUpload",
  getDownloadUrl: "content.handler.getDownloadUrl",
  deleteFile: "content.handler.deleteFile",
  listByEntity: "content.handler.listByEntity",
  getMetadata: "content.handler.getMetadata",
  // Versions
  getVersions: "content.handler.getVersions",
  initiateVersion: "content.handler.initiateVersion",
  completeVersion: "content.handler.completeVersion",
  restoreVersion: "content.handler.restoreVersion",
  // Links
  linkDocument: "content.handler.linkDocument",
  unlinkDocument: "content.handler.unlinkDocument",
  getLinkedEntities: "content.handler.getLinkedEntities",
  // ACL
  grantPermission: "content.handler.grantPermission",
  revokePermission: "content.handler.revokePermission",
  listAcls: "content.handler.listAcls",
  // Preview
  getPreviewUrl: "content.handler.getPreviewUrl",
  generatePreview: "content.handler.generatePreview",
  // Multipart
  initiateMultipart: "content.handler.initiateMultipart",
  getPartUploadUrls: "content.handler.getPartUploadUrls",
  completeMultipart: "content.handler.completeMultipart",
  abortMultipart: "content.handler.abortMultipart",
  // Expiry
  setExpiration: "content.handler.setExpiration",
  clearExpiration: "content.handler.clearExpiration",
  // Comments
  listComments: "content.handler.listComments",
  createComment: "content.handler.createComment",
  updateComment: "content.handler.updateComment",
  deleteComment: "content.handler.deleteComment",
  replyToComment: "content.handler.replyToComment",
  // Access Logs
  getAccessHistory: "content.handler.getAccessHistory",
  getAccessStats: "content.handler.getAccessStats",
} as const;

// ============================================================================
// Logger Factory
// ============================================================================

function createContentLogger(baseLogger: Logger, context: string): Logger {
  return {
    debug: (obj: any, msg?: string) =>
      baseLogger.debug({ ...obj, context: `content:${context}` }, msg ?? ""),
    info: (obj: any, msg?: string) =>
      baseLogger.info({ ...obj, context: `content:${context}` }, msg ?? ""),
    warn: (obj: any, msg?: string) =>
      baseLogger.warn({ ...obj, context: `content:${context}` }, msg ?? ""),
    error: (obj: any, msg?: string) =>
      baseLogger.error({ ...obj, context: `content:${context}` }, msg ?? ""),
  } as Logger;
}

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
  name: "platform-services.content",

  async register(c: Container) {
    const db = await c.resolve<Kysely<DB>>(TOKENS.db);
    const baseLogger = await c.resolve<Logger>(TOKENS.logger);
    const logger = createContentLogger(baseLogger, "lifecycle");

    logger.info("Registering content module");

    // ── Persistence ─────────────────────────────────────────────────
    c.register(
      REPO_TOKENS.attachment,
      async () => new AttachmentRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.entityDocumentLink,
      async () => new EntityDocumentLinkRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.documentAcl,
      async () => new DocumentAclRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.accessLog,
      async () => new AccessLogRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.comment,
      async () => new CommentRepo(db),
      "singleton",
    );
    c.register(
      REPO_TOKENS.multipartUpload,
      async () => new MultipartUploadRepo(db),
      "singleton",
    );

    // ── Audit Emitter ───────────────────────────────────────────────
    c.register(
      TOKENS.contentAuditEmitter,
      async () => {
        const auditWriter = await c.resolve<AuditWriter>(TOKENS.auditWriter);
        return new ContentAuditEmitter(
          auditWriter,
          createContentLogger(baseLogger, "audit"),
        );
      },
      "singleton",
    );

    // ── Content Service ─────────────────────────────────────────────
    c.register(
      TOKENS.contentService,
      async () => {
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const storage = await c.resolve<ObjectStorageAdapter>(
          TOKENS.objectStorage,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new ContentService(
          attachmentRepo,
          storage,
          audit,
          createContentLogger(baseLogger, "service"),
          {
            bucket: (config as any).objectStorage?.defaultBucket ?? "athyper",
            presignedUrlExpiry:
              (config as any).content?.presignedUrlExpiry ?? 3600,
          },
        );
      },
      "singleton",
    );

    // ── Version Service ─────────────────────────────────────────────
    c.register(
      TOKENS.versionService,
      async () => {
        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const storage = await c.resolve<ObjectStorageAdapter>(
          TOKENS.objectStorage,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new VersionService(
          attachmentRepo,
          storage,
          audit,
          createContentLogger(baseLogger, "version"),
          {
            bucket: (config as any).objectStorage?.defaultBucket ?? "athyper",
            presignedUrlExpiry:
              (config as any).content?.presignedUrlExpiry ?? 3600,
          },
        );
      },
      "singleton",
    );

    // ── Link Service ────────────────────────────────────────────────
    c.register(
      TOKENS.linkService,
      async () => {
        const linkRepo = await c.resolve<EntityDocumentLinkRepo>(
          REPO_TOKENS.entityDocumentLink,
        );
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new LinkService(
          linkRepo,
          attachmentRepo,
          audit,
          createContentLogger(baseLogger, "link"),
        );
      },
      "singleton",
    );

    // ── ACL Service ─────────────────────────────────────────────────
    c.register(
      TOKENS.aclService,
      async () => {
        const aclRepo = await c.resolve<DocumentAclRepo>(
          REPO_TOKENS.documentAcl,
        );
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new AclService(
          aclRepo,
          attachmentRepo,
          audit,
          createContentLogger(baseLogger, "acl"),
        );
      },
      "singleton",
    );

    // ── Access Log Service ──────────────────────────────────────────
    c.register(
      TOKENS.accessLogService,
      async () => {
        const accessLogRepo = await c.resolve<AccessLogRepo>(
          REPO_TOKENS.accessLog,
        );

        return new AccessLogService(
          accessLogRepo,
          createContentLogger(baseLogger, "access-log"),
        );
      },
      "singleton",
    );

    // ── Comment Service ─────────────────────────────────────────────
    c.register(
      TOKENS.commentService,
      async () => {
        const commentRepo = await c.resolve<CommentRepo>(REPO_TOKENS.comment);
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new CommentService(
          commentRepo,
          attachmentRepo,
          audit,
          createContentLogger(baseLogger, "comment"),
        );
      },
      "singleton",
    );

    // ── Multipart Upload Service ────────────────────────────────────
    c.register(
      TOKENS.multipartUploadService,
      async () => {
        const multipartRepo = await c.resolve<MultipartUploadRepo>(
          REPO_TOKENS.multipartUpload,
        );
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const storage = await c.resolve<ObjectStorageAdapter>(
          TOKENS.objectStorage,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new MultipartUploadService(
          multipartRepo,
          attachmentRepo,
          storage,
          audit,
          createContentLogger(baseLogger, "multipart"),
        );
      },
      "singleton",
    );

    // ── Preview Service ─────────────────────────────────────────────
    c.register(
      TOKENS.previewService,
      async () => {
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const storage = await c.resolve<ObjectStorageAdapter>(
          TOKENS.objectStorage,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new PreviewService(
          attachmentRepo,
          storage,
          audit,
          createContentLogger(baseLogger, "preview"),
        );
      },
      "singleton",
    );

    // ── Expiry Service ──────────────────────────────────────────────
    c.register(
      TOKENS.expiryService,
      async () => {
        const attachmentRepo = await c.resolve<AttachmentRepo>(
          REPO_TOKENS.attachment,
        );
        const storage = await c.resolve<ObjectStorageAdapter>(
          TOKENS.objectStorage,
        );
        const audit = await c.resolve<ContentAuditEmitter>(
          TOKENS.contentAuditEmitter,
        );

        return new ExpiryService(
          attachmentRepo,
          storage,
          audit,
          createContentLogger(baseLogger, "expiry"),
        );
      },
      "singleton",
    );

    // ── HTTP Handlers ───────────────────────────────────────────────

    // Upload handlers
    c.register(
      HANDLER_TOKENS.initiateUpload,
      async () => new InitiateUploadHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.completeUpload,
      async () => new CompleteUploadHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getDownloadUrl,
      async () => new GetDownloadUrlHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.deleteFile,
      async () => new DeleteFileHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listByEntity,
      async () => new ListByEntityHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getMetadata,
      async () => new GetMetadataHandler(),
      "singleton",
    );

    // Version handlers
    c.register(
      HANDLER_TOKENS.getVersions,
      async () => new GetVersionsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.initiateVersion,
      async () => new InitiateVersionHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.completeVersion,
      async () => new CompleteVersionHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.restoreVersion,
      async () => new RestoreVersionHandler(),
      "singleton",
    );

    // Link handlers
    c.register(
      HANDLER_TOKENS.linkDocument,
      async () => new LinkDocumentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.unlinkDocument,
      async () => new UnlinkDocumentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getLinkedEntities,
      async () => new GetLinkedEntitiesHandler(),
      "singleton",
    );

    // ACL handlers
    c.register(
      HANDLER_TOKENS.grantPermission,
      async () => new GrantPermissionHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.revokePermission,
      async () => new RevokePermissionHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.listAcls,
      async () => new ListAclsHandler(),
      "singleton",
    );

    // Preview handlers
    c.register(
      HANDLER_TOKENS.getPreviewUrl,
      async () => new GetPreviewUrlHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.generatePreview,
      async () => new GeneratePreviewHandler(),
      "singleton",
    );

    // Multipart handlers
    c.register(
      HANDLER_TOKENS.initiateMultipart,
      async () => new InitiateMultipartHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getPartUploadUrls,
      async () => new GetPartUploadUrlsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.completeMultipart,
      async () => new CompleteMultipartHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.abortMultipart,
      async () => new AbortMultipartHandler(),
      "singleton",
    );

    // Expiry handlers
    c.register(
      HANDLER_TOKENS.setExpiration,
      async () => new SetExpirationHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.clearExpiration,
      async () => new ClearExpirationHandler(),
      "singleton",
    );

    // Comment handlers
    c.register(
      HANDLER_TOKENS.listComments,
      async () => new ListCommentsHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.createComment,
      async () => new CreateCommentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.updateComment,
      async () => new UpdateCommentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.deleteComment,
      async () => new DeleteCommentHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.replyToComment,
      async () => new ReplyToCommentHandler(),
      "singleton",
    );

    // Access log handlers
    c.register(
      HANDLER_TOKENS.getAccessHistory,
      async () => new GetAccessHistoryHandler(),
      "singleton",
    );
    c.register(
      HANDLER_TOKENS.getAccessStats,
      async () => new GetAccessStatsHandler(),
      "singleton",
    );
  },

  async contribute(c: Container) {
    const baseLogger = await c.resolve<Logger>(TOKENS.logger);
    const logger = createContentLogger(baseLogger, "lifecycle");
    const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);
    const config = await c.resolve<RuntimeConfig>(TOKENS.config);

    // ================================================================
    // Routes: Upload & Download
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/content/initiate",
      handlerToken: HANDLER_TOKENS.initiateUpload,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/complete",
      handlerToken: HANDLER_TOKENS.completeUpload,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/download/:id",
      handlerToken: HANDLER_TOKENS.getDownloadUrl,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/content/delete/:id",
      handlerToken: HANDLER_TOKENS.deleteFile,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/by-entity",
      handlerToken: HANDLER_TOKENS.listByEntity,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/meta/:id",
      handlerToken: HANDLER_TOKENS.getMetadata,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Versioning
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/content/versions/:id",
      handlerToken: HANDLER_TOKENS.getVersions,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/version/initiate",
      handlerToken: HANDLER_TOKENS.initiateVersion,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/version/complete",
      handlerToken: HANDLER_TOKENS.completeVersion,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/version/restore",
      handlerToken: HANDLER_TOKENS.restoreVersion,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Entity Linking
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/content/link",
      handlerToken: HANDLER_TOKENS.linkDocument,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/content/unlink/:id",
      handlerToken: HANDLER_TOKENS.unlinkDocument,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/links/:id",
      handlerToken: HANDLER_TOKENS.getLinkedEntities,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: ACL Management
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/content/acl/grant",
      handlerToken: HANDLER_TOKENS.grantPermission,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/acl/revoke",
      handlerToken: HANDLER_TOKENS.revokePermission,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/acl/:id",
      handlerToken: HANDLER_TOKENS.listAcls,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Preview & Thumbnail
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/content/preview/:attachmentId",
      handlerToken: HANDLER_TOKENS.getPreviewUrl,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/preview/generate",
      handlerToken: HANDLER_TOKENS.generatePreview,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Multipart Upload
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/content/multipart/initiate",
      handlerToken: HANDLER_TOKENS.initiateMultipart,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/multipart/parts",
      handlerToken: HANDLER_TOKENS.getPartUploadUrls,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/multipart/complete",
      handlerToken: HANDLER_TOKENS.completeMultipart,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/multipart/abort",
      handlerToken: HANDLER_TOKENS.abortMultipart,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Expiry Management
    // ================================================================

    routes.add({
      method: "POST",
      path: "/api/content/expiry/set",
      handlerToken: HANDLER_TOKENS.setExpiration,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/expiry/clear",
      handlerToken: HANDLER_TOKENS.clearExpiration,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Comments & Annotations
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/content/comments/:attachmentId",
      handlerToken: HANDLER_TOKENS.listComments,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/comments",
      handlerToken: HANDLER_TOKENS.createComment,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "PUT",
      path: "/api/content/comments/:id",
      handlerToken: HANDLER_TOKENS.updateComment,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "DELETE",
      path: "/api/content/comments/:id",
      handlerToken: HANDLER_TOKENS.deleteComment,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "POST",
      path: "/api/content/comments/:id/reply",
      handlerToken: HANDLER_TOKENS.replyToComment,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Routes: Access Logs & Analytics
    // ================================================================

    routes.add({
      method: "GET",
      path: "/api/content/access/:attachmentId",
      handlerToken: HANDLER_TOKENS.getAccessHistory,
      authRequired: true,
      tags: ["content"],
    });

    routes.add({
      method: "GET",
      path: "/api/content/access/:attachmentId/stats",
      handlerToken: HANDLER_TOKENS.getAccessStats,
      authRequired: true,
      tags: ["content"],
    });

    // ================================================================
    // Register Job Workers
    // ================================================================

    const db = await c.resolve<Kysely<DB>>(TOKENS.db);
    const storage = await c.resolve<ObjectStorageAdapter>(TOKENS.objectStorage);
    const jobQueue = await c.resolve<any>(TOKENS.jobQueue);

    // Cleanup orphaned uploads worker
    if (jobQueue && jobQueue.process) {
      await jobQueue.process(
        "cleanup-orphaned-uploads",
        1, // concurrency
        createCleanupOrphanedUploadsHandler(
          db,
          storage,
          {
            orphanedThresholdHours:
              (config as any).content?.cleanup?.orphanedThresholdHours ?? 24,
            maxCleanupPerRun:
              (config as any).content?.cleanup?.maxCleanupPerRun ?? 100,
            deleteFromStorage:
              (config as any).content?.cleanup?.deleteFromStorage ?? true,
          },
          createContentLogger(baseLogger, "cleanup"),
        ),
      );

      // Generate previews worker
      await jobQueue.process(
        "generate-previews",
        1, // concurrency
        createGeneratePreviewsHandler(c),
      );

      // Cleanup expired files worker
      await jobQueue.process(
        "cleanup-expired-files",
        1, // concurrency
        createCleanupExpiredFilesHandler(c),
      );

      // Cleanup stale multipart uploads worker
      await jobQueue.process(
        "cleanup-stale-multipart",
        1, // concurrency
        createCleanupStaleMultipartHandler(c),
      );

      // Cleanup access logs worker
      await jobQueue.process(
        "cleanup-access-logs",
        1, // concurrency
        createCleanupAccessLogsHandler(c),
      );
    }

    // ================================================================
    // Schedule Contributions (for CronScheduler)
    // ================================================================

    const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

    jobRegistry.addSchedule({
      name: "cleanup-orphaned-uploads",
      cron: "0 * * * *", // Every hour at :00
      jobName: "cleanup-orphaned-uploads",
    });

    jobRegistry.addSchedule({
      name: "generate-previews",
      cron: "*/5 * * * *", // Every 5 minutes
      jobName: "generate-previews",
    });

    jobRegistry.addSchedule({
      name: "cleanup-expired-files",
      cron: "0 2 * * *", // Daily at 2 AM
      jobName: "cleanup-expired-files",
    });

    jobRegistry.addSchedule({
      name: "cleanup-stale-multipart",
      cron: "0 3 * * *", // Daily at 3 AM
      jobName: "cleanup-stale-multipart",
    });

    jobRegistry.addSchedule({
      name: "cleanup-access-logs",
      cron: "0 1 * * 0", // Weekly on Sunday at 1 AM
      jobName: "cleanup-access-logs",
    });

    logger.info(
      "Content module contributed — routes, workers, schedules registered",
    );
  },
};

export const moduleCode = "CONTENT";
export const moduleName = "Content Management";
