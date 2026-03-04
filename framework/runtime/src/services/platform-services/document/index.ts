/**
 * Document Services (DOC) — Module Composition Root
 *
 * Registers all document services, repos, adapters, handlers, and routes.
 * Follows the RuntimeModule pattern (register + contribute).
 *
 * Robustness enhancements:
 * - DLQ manager + repo for permanently failed renders
 * - Audit emitter for comprehensive lifecycle events
 * - Stuck job recovery worker
 * - Resolve endpoint for template debugging
 * - DLQ admin endpoints
 */

import { TOKENS } from "../../../kernel/tokens.js";

import { DefaultDocStorageAdapter } from "./adapters/DocStorageAdapter.js";
import { PuppeteerPdfRenderer } from "./adapters/PdfRenderer.js";
import {
    ListBrandProfilesHandler,
    CreateBrandProfileHandler,
    UpdateBrandProfileHandler,
} from "./api/handlers/brand-admin.handler.js";
import {
    ListDlqEntriesHandler,
    InspectDlqEntryHandler,
    RetryDlqEntryHandler,
    BulkReplayDlqHandler,
} from "./api/handlers/dlq-admin.handler.js";
import {
    ListLetterheadsHandler,
    CreateLetterheadHandler,
    GetLetterheadHandler,
    UpdateLetterheadHandler,
} from "./api/handlers/letterhead-admin.handler.js";
import {
    ListOutputsHandler,
    GetOutputHandler,
    DownloadOutputHandler,
    MarkDeliveredHandler,
    RevokeOutputHandler,
    VerifyOutputHandler,
} from "./api/handlers/output.handler.js";
import {
    ListRenderJobsHandler,
    GetRenderJobHandler,
    RetryRenderJobHandler,
} from "./api/handlers/render-job-admin.handler.js";
import {
    RenderDocumentHandler,
    RenderSyncHandler,
} from "./api/handlers/render.handler.js";
import {
    ListTemplatesHandler,
    CreateTemplateHandler,
    GetTemplateHandler,
    UpdateTemplateHandler,
    CreateVersionHandler,
    PublishTemplateHandler,
    RetireTemplateHandler,
    PreviewTemplateHandler,
    ResolveTemplateHandler,
} from "./api/handlers/template-admin.handler.js";
import { DocAuditEmitter } from "./domain/services/DocAuditEmitter.js";
import { DocBrandService } from "./domain/services/DocBrandService.js";
import { DocHtmlComposer } from "./domain/services/DocHtmlComposer.js";
import { DocLetterheadService } from "./domain/services/DocLetterheadService.js";
import { DocOutputService } from "./domain/services/DocOutputService.js";
import { DocRenderDlqManager } from "./domain/services/DocRenderDlqManager.js";
import { DocRenderService } from "./domain/services/DocRenderService.js";
import { DocTemplateService } from "./domain/services/DocTemplateService.js";
import { createCleanupOutputsHandler } from "./jobs/workers/cleanupOutputs.worker.js";
import { createRecoverStuckJobsHandler } from "./jobs/workers/recoverStuckJobs.worker.js";
import { createRenderDocumentHandler } from "./jobs/workers/renderDocument.worker.js";
import { createDocLogger } from "./observability/logger.js";
import { DocMetrics } from "./observability/metrics.js";
import { DocBrandProfileRepo } from "./persistence/DocBrandProfileRepo.js";
import { DocLetterheadRepo } from "./persistence/DocLetterheadRepo.js";
import { DocOutputRepo } from "./persistence/DocOutputRepo.js";
import { DocRenderDlqRepo } from "./persistence/DocRenderDlqRepo.js";
import { DocRenderJobRepo } from "./persistence/DocRenderJobRepo.js";
import { DocTemplateBindingRepo } from "./persistence/DocTemplateBindingRepo.js";
import { DocTemplateRepo } from "./persistence/DocTemplateRepo.js";
import { DocTemplateVersionRepo } from "./persistence/DocTemplateVersionRepo.js";

import type { AuditWriter } from "../../../kernel/audit.js";
import type { RuntimeConfig } from "../../../kernel/config.schema.js";
import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { JobRegistry } from "../../platform/foundation/registries/jobs.registry.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";
import type { DB } from "@athyper/adapter-db";
import type { JobQueue, MetricsRegistry } from "@athyper/core";
import type { Kysely } from "kysely";

// ============================================================================
// Repo Tokens (internal to this module)
// ============================================================================

const REPO_TOKENS = {
    template: "doc.repo.template",
    templateVersion: "doc.repo.templateVersion",
    templateBinding: "doc.repo.templateBinding",
    letterhead: "doc.repo.letterhead",
    brandProfile: "doc.repo.brandProfile",
    output: "doc.repo.output",
    renderJob: "doc.repo.renderJob",
    renderDlq: "doc.repo.renderDlq",
} as const;

// ============================================================================
// Handler Tokens (internal to this module)
// ============================================================================

const HANDLER_TOKENS = {
    // Templates
    listTemplates: "doc.handler.listTemplates",
    createTemplate: "doc.handler.createTemplate",
    getTemplate: "doc.handler.getTemplate",
    updateTemplate: "doc.handler.updateTemplate",
    createVersion: "doc.handler.createVersion",
    publishTemplate: "doc.handler.publishTemplate",
    retireTemplate: "doc.handler.retireTemplate",
    previewTemplate: "doc.handler.previewTemplate",
    resolveTemplate: "doc.handler.resolveTemplate",
    // Letterheads
    listLetterheads: "doc.handler.listLetterheads",
    createLetterhead: "doc.handler.createLetterhead",
    getLetterhead: "doc.handler.getLetterhead",
    updateLetterhead: "doc.handler.updateLetterhead",
    // Brand profiles
    listBrandProfiles: "doc.handler.listBrandProfiles",
    createBrandProfile: "doc.handler.createBrandProfile",
    updateBrandProfile: "doc.handler.updateBrandProfile",
    // Render
    renderDocument: "doc.handler.renderDocument",
    renderSync: "doc.handler.renderSync",
    // Outputs
    listOutputs: "doc.handler.listOutputs",
    getOutput: "doc.handler.getOutput",
    downloadOutput: "doc.handler.downloadOutput",
    markDelivered: "doc.handler.markDelivered",
    revokeOutput: "doc.handler.revokeOutput",
    verifyOutput: "doc.handler.verifyOutput",
    // Render jobs
    listRenderJobs: "doc.handler.listRenderJobs",
    getRenderJob: "doc.handler.getRenderJob",
    retryRenderJob: "doc.handler.retryRenderJob",
    // DLQ
    listDlqEntries: "doc.handler.listDlqEntries",
    inspectDlqEntry: "doc.handler.inspectDlqEntry",
    retryDlqEntry: "doc.handler.retryDlqEntry",
    bulkReplayDlq: "doc.handler.bulkReplayDlq",
} as const;

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
    name: "platform-services.document",

    async register(c: Container) {
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const baseLogger = await c.resolve<Logger>(TOKENS.logger);
        const logger = createDocLogger(baseLogger, "lifecycle");

        logger.info("Registering document module");

        // ── Persistence ─────────────────────────────────────────────────
        c.register(REPO_TOKENS.template, async () => new DocTemplateRepo(db), "singleton");
        c.register(REPO_TOKENS.templateVersion, async () => new DocTemplateVersionRepo(db), "singleton");
        c.register(REPO_TOKENS.templateBinding, async () => new DocTemplateBindingRepo(db), "singleton");
        c.register(REPO_TOKENS.letterhead, async () => new DocLetterheadRepo(db), "singleton");
        c.register(REPO_TOKENS.brandProfile, async () => new DocBrandProfileRepo(db), "singleton");
        c.register(REPO_TOKENS.output, async () => new DocOutputRepo(db), "singleton");
        c.register(REPO_TOKENS.renderJob, async () => new DocRenderJobRepo(db), "singleton");
        c.register(REPO_TOKENS.renderDlq, async () => new DocRenderDlqRepo(db), "singleton");

        // ── PDF Renderer Adapter ────────────────────────────────────────
        c.register(TOKENS.documentPdfRenderer, async () => {
            const config = await c.resolve<RuntimeConfig>(TOKENS.config);
            const engine = config.document?.rendering?.engine ?? "puppeteer";
            if (engine !== "puppeteer") {
                logger.warn(
                    { configuredEngine: engine },
                    `Document rendering engine "${engine}" is not yet implemented — falling back to puppeteer`,
                );
            }
            return new PuppeteerPdfRenderer({
                chromiumPath: config.document?.rendering?.chromiumPath,
                timeoutMs: config.document?.rendering?.timeoutMs ?? 30000,
                maxConcurrentPages: config.document?.rendering?.concurrency ?? 3,
                trustedDomains: config.document?.rendering?.trustedDomains ?? [],
                allowedHosts: config.document?.rendering?.allowedHosts ?? [],
            });
        }, "singleton");

        // ── HTML Composer ───────────────────────────────────────────────
        c.register(TOKENS.documentHtmlComposer, async () => {
            return new DocHtmlComposer(createDocLogger(baseLogger, "composer"));
        }, "singleton");

        // ── Audit Emitter ───────────────────────────────────────────────
        c.register(TOKENS.documentAuditEmitter, async () => {
            const auditWriter = await c.resolve<AuditWriter>(TOKENS.auditWriter);
            return new DocAuditEmitter(auditWriter, createDocLogger(baseLogger, "audit"));
        }, "singleton");

        // ── Letterhead Service ──────────────────────────────────────────
        c.register(TOKENS.documentLetterheadService, async () => {
            const repo = await c.resolve<DocLetterheadRepo>(REPO_TOKENS.letterhead);
            return new DocLetterheadService(repo, createDocLogger(baseLogger, "letterhead"));
        }, "singleton");

        // ── Brand Service ───────────────────────────────────────────────
        c.register(TOKENS.documentBrandService, async () => {
            const repo = await c.resolve<DocBrandProfileRepo>(REPO_TOKENS.brandProfile);
            return new DocBrandService(repo, createDocLogger(baseLogger, "brand"));
        }, "singleton");

        // ── Template Service ────────────────────────────────────────────
        c.register(TOKENS.documentTemplateService, async () => {
            const templateRepo = await c.resolve<DocTemplateRepo>(REPO_TOKENS.template);
            const versionRepo = await c.resolve<DocTemplateVersionRepo>(REPO_TOKENS.templateVersion);
            const bindingRepo = await c.resolve<DocTemplateBindingRepo>(REPO_TOKENS.templateBinding);
            const auditEmitter = await c.resolve<DocAuditEmitter>(TOKENS.documentAuditEmitter);
            return new DocTemplateService(
                templateRepo,
                versionRepo,
                bindingRepo,
                createDocLogger(baseLogger, "template"),
                auditEmitter,
            );
        }, "singleton");

        // ── Output Service ──────────────────────────────────────────────
        c.register(TOKENS.documentOutputService, async () => {
            const config = await c.resolve<RuntimeConfig>(TOKENS.config);
            const outputRepo = await c.resolve<DocOutputRepo>(REPO_TOKENS.output);
            const objectStorage = await c.resolve<any>(TOKENS.objectStorage);
            const storageAdapter = new DefaultDocStorageAdapter(
                objectStorage,
                config.document?.storage?.presignedUrlExpirySeconds ?? 3600,
            );
            return new DocOutputService(
                outputRepo,
                storageAdapter,
                createDocLogger(baseLogger, "output"),
            );
        }, "singleton");

        // ── DLQ Manager ─────────────────────────────────────────────────
        c.register(TOKENS.documentDlqManager, async () => {
            const dlqRepo = await c.resolve<DocRenderDlqRepo>(REPO_TOKENS.renderDlq);
            const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
            return new DocRenderDlqManager(
                dlqRepo,
                jobQueue,
                createDocLogger(baseLogger, "dlq"),
            );
        }, "singleton");

        // ── Observability ───────────────────────────────────────────────
        c.register(TOKENS.documentMetrics, async () => {
            const metricsRegistry = await c.resolve<MetricsRegistry>(TOKENS.metricsRegistry);
            return new DocMetrics(metricsRegistry);
        }, "singleton");

        // ── Render Service (central orchestrator) ───────────────────────
        c.register(TOKENS.documentRenderService, async () => {
            const config = await c.resolve<RuntimeConfig>(TOKENS.config);
            const templateService = await c.resolve<DocTemplateService>(TOKENS.documentTemplateService);
            const letterheadService = await c.resolve<DocLetterheadService>(TOKENS.documentLetterheadService);
            const brandService = await c.resolve<DocBrandService>(TOKENS.documentBrandService);
            const htmlComposer = await c.resolve<DocHtmlComposer>(TOKENS.documentHtmlComposer);
            const pdfRenderer = await c.resolve<PuppeteerPdfRenderer>(TOKENS.documentPdfRenderer);
            const objectStorage = await c.resolve<any>(TOKENS.objectStorage);
            const storageAdapter = new DefaultDocStorageAdapter(
                objectStorage,
                config.document?.storage?.presignedUrlExpirySeconds ?? 3600,
            );
            const outputRepo = await c.resolve<DocOutputRepo>(REPO_TOKENS.output);
            const renderJobRepo = await c.resolve<DocRenderJobRepo>(REPO_TOKENS.renderJob);
            const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
            const auditWriter = await c.resolve<AuditWriter>(TOKENS.auditWriter);
            const docMetrics = await c.resolve<DocMetrics>(TOKENS.documentMetrics);
            const dlqManager = await c.resolve<DocRenderDlqManager>(TOKENS.documentDlqManager);
            const auditEmitter = await c.resolve<DocAuditEmitter>(TOKENS.documentAuditEmitter);

            return new DocRenderService(
                templateService,
                letterheadService,
                brandService,
                htmlComposer,
                pdfRenderer,
                storageAdapter,
                outputRepo,
                renderJobRepo,
                jobQueue,
                auditWriter,
                createDocLogger(baseLogger, "render"),
                {
                    paperFormat: (config.document?.rendering?.paperFormat ?? "A4") as any,
                    timeoutMs: config.document?.rendering?.timeoutMs ?? 30000,
                    maxRetries: config.document?.rendering?.maxRetries ?? 3,
                    storagePathPrefix: config.document?.storage?.pathPrefix ?? "documents",
                    presignedUrlExpirySeconds: config.document?.storage?.presignedUrlExpirySeconds ?? 3600,
                    composeTimeoutMs: config.document?.rendering?.composeTimeoutMs ?? 5000,
                    uploadTimeoutMs: config.document?.rendering?.uploadTimeoutMs ?? 30000,
                },
                docMetrics,
                dlqManager,
                auditEmitter,
            );
        }, "singleton");

        // ── HTTP Handlers ───────────────────────────────────────────────

        // Templates
        c.register(HANDLER_TOKENS.listTemplates, async () => new ListTemplatesHandler(), "singleton");
        c.register(HANDLER_TOKENS.createTemplate, async () => new CreateTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.getTemplate, async () => new GetTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateTemplate, async () => new UpdateTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.createVersion, async () => new CreateVersionHandler(), "singleton");
        c.register(HANDLER_TOKENS.publishTemplate, async () => new PublishTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.retireTemplate, async () => new RetireTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.previewTemplate, async () => new PreviewTemplateHandler(), "singleton");
        c.register(HANDLER_TOKENS.resolveTemplate, async () => new ResolveTemplateHandler(), "singleton");

        // Letterheads
        c.register(HANDLER_TOKENS.listLetterheads, async () => new ListLetterheadsHandler(), "singleton");
        c.register(HANDLER_TOKENS.createLetterhead, async () => new CreateLetterheadHandler(), "singleton");
        c.register(HANDLER_TOKENS.getLetterhead, async () => new GetLetterheadHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateLetterhead, async () => new UpdateLetterheadHandler(), "singleton");

        // Brand profiles
        c.register(HANDLER_TOKENS.listBrandProfiles, async () => new ListBrandProfilesHandler(), "singleton");
        c.register(HANDLER_TOKENS.createBrandProfile, async () => new CreateBrandProfileHandler(), "singleton");
        c.register(HANDLER_TOKENS.updateBrandProfile, async () => new UpdateBrandProfileHandler(), "singleton");

        // Render
        c.register(HANDLER_TOKENS.renderDocument, async () => new RenderDocumentHandler(), "singleton");
        c.register(HANDLER_TOKENS.renderSync, async () => new RenderSyncHandler(), "singleton");

        // Outputs
        c.register(HANDLER_TOKENS.listOutputs, async () => new ListOutputsHandler(), "singleton");
        c.register(HANDLER_TOKENS.getOutput, async () => new GetOutputHandler(), "singleton");
        c.register(HANDLER_TOKENS.downloadOutput, async () => new DownloadOutputHandler(), "singleton");
        c.register(HANDLER_TOKENS.markDelivered, async () => new MarkDeliveredHandler(), "singleton");
        c.register(HANDLER_TOKENS.revokeOutput, async () => new RevokeOutputHandler(), "singleton");
        c.register(HANDLER_TOKENS.verifyOutput, async () => new VerifyOutputHandler(), "singleton");

        // Render jobs
        c.register(HANDLER_TOKENS.listRenderJobs, async () => new ListRenderJobsHandler(), "singleton");
        c.register(HANDLER_TOKENS.getRenderJob, async () => new GetRenderJobHandler(), "singleton");
        c.register(HANDLER_TOKENS.retryRenderJob, async () => new RetryRenderJobHandler(), "singleton");

        // DLQ admin
        c.register(HANDLER_TOKENS.listDlqEntries, async () => new ListDlqEntriesHandler(), "singleton");
        c.register(HANDLER_TOKENS.inspectDlqEntry, async () => new InspectDlqEntryHandler(), "singleton");
        c.register(HANDLER_TOKENS.retryDlqEntry, async () => new RetryDlqEntryHandler(), "singleton");
        c.register(HANDLER_TOKENS.bulkReplayDlq, async () => new BulkReplayDlqHandler(), "singleton");
    },

    async contribute(c: Container) {
        const baseLogger = await c.resolve<Logger>(TOKENS.logger);
        const logger = createDocLogger(baseLogger, "lifecycle");
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        // ================================================================
        // Admin: Templates
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/documents/templates",
            handlerToken: HANDLER_TOKENS.listTemplates,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/templates",
            handlerToken: HANDLER_TOKENS.createTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/documents/templates/:id",
            handlerToken: HANDLER_TOKENS.getTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/documents/templates/:id",
            handlerToken: HANDLER_TOKENS.updateTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/templates/:id/versions",
            handlerToken: HANDLER_TOKENS.createVersion,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/templates/:id/publish",
            handlerToken: HANDLER_TOKENS.publishTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/templates/:id/retire",
            handlerToken: HANDLER_TOKENS.retireTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/templates/:id/preview",
            handlerToken: HANDLER_TOKENS.previewTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/documents/resolve",
            handlerToken: HANDLER_TOKENS.resolveTemplate,
            authRequired: true,
            tags: ["doc", "admin"],
        });

        // ================================================================
        // Admin: Letterheads
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/documents/letterheads",
            handlerToken: HANDLER_TOKENS.listLetterheads,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/letterheads",
            handlerToken: HANDLER_TOKENS.createLetterhead,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/documents/letterheads/:id",
            handlerToken: HANDLER_TOKENS.getLetterhead,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/documents/letterheads/:id",
            handlerToken: HANDLER_TOKENS.updateLetterhead,
            authRequired: true,
            tags: ["doc", "admin"],
        });

        // ================================================================
        // Admin: Brand Profiles
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/documents/brand-profiles",
            handlerToken: HANDLER_TOKENS.listBrandProfiles,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/brand-profiles",
            handlerToken: HANDLER_TOKENS.createBrandProfile,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "PUT",
            path: "/api/admin/documents/brand-profiles/:id",
            handlerToken: HANDLER_TOKENS.updateBrandProfile,
            authRequired: true,
            tags: ["doc", "admin"],
        });

        // ================================================================
        // User-facing: Render
        // ================================================================

        routes.add({
            method: "POST",
            path: "/api/documents/render",
            handlerToken: HANDLER_TOKENS.renderDocument,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "POST",
            path: "/api/documents/render/sync",
            handlerToken: HANDLER_TOKENS.renderSync,
            authRequired: true,
            tags: ["doc"],
        });

        // ================================================================
        // User-facing: Outputs
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/documents/outputs",
            handlerToken: HANDLER_TOKENS.listOutputs,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "GET",
            path: "/api/documents/outputs/:id",
            handlerToken: HANDLER_TOKENS.getOutput,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "GET",
            path: "/api/documents/outputs/:id/download",
            handlerToken: HANDLER_TOKENS.downloadOutput,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "POST",
            path: "/api/documents/outputs/:id/deliver",
            handlerToken: HANDLER_TOKENS.markDelivered,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "POST",
            path: "/api/documents/outputs/:id/revoke",
            handlerToken: HANDLER_TOKENS.revokeOutput,
            authRequired: true,
            tags: ["doc"],
        });
        routes.add({
            method: "GET",
            path: "/api/documents/outputs/:id/verify",
            handlerToken: HANDLER_TOKENS.verifyOutput,
            authRequired: true,
            tags: ["doc"],
        });

        // ================================================================
        // Admin: Render Jobs
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/documents/render-jobs",
            handlerToken: HANDLER_TOKENS.listRenderJobs,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/documents/render-jobs/:id",
            handlerToken: HANDLER_TOKENS.getRenderJob,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/render-jobs/:id/retry",
            handlerToken: HANDLER_TOKENS.retryRenderJob,
            authRequired: true,
            tags: ["doc", "admin"],
        });

        // ================================================================
        // Admin: DLQ
        // ================================================================

        routes.add({
            method: "GET",
            path: "/api/admin/documents/dlq",
            handlerToken: HANDLER_TOKENS.listDlqEntries,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "GET",
            path: "/api/admin/documents/dlq/:id",
            handlerToken: HANDLER_TOKENS.inspectDlqEntry,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/dlq/:id/retry",
            handlerToken: HANDLER_TOKENS.retryDlqEntry,
            authRequired: true,
            tags: ["doc", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/documents/dlq/bulk-replay",
            handlerToken: HANDLER_TOKENS.bulkReplayDlq,
            authRequired: true,
            tags: ["doc", "admin"],
        });

        // ================================================================
        // Register Job Workers
        // ================================================================

        const config = await c.resolve<RuntimeConfig>(TOKENS.config);
        const jobQueue = await c.resolve<JobQueue>(TOKENS.jobQueue);
        const renderService = await c.resolve<DocRenderService>(TOKENS.documentRenderService);
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const workerLogger = createDocLogger(baseLogger, "render");
        const concurrency = config.document?.rendering?.concurrency ?? 3;

        const leaseSeconds = config.document?.jobs?.leaseSeconds ?? 300;
        const heartbeatSeconds = config.document?.jobs?.heartbeatSeconds ?? 30;
        await jobQueue.process(
            "render-document",
            concurrency,
            createRenderDocumentHandler(renderService, workerLogger),
            {
                lockDuration: leaseSeconds * 1000,
                lockRenewTime: heartbeatSeconds * 1000,
            },
        );

        await jobQueue.process(
            "cleanup-doc-outputs",
            1,
            createCleanupOutputsHandler(db, {
                archiveAfterDays: config.document?.retention?.archiveAfterDays ?? 365,
                defaultRetentionDays: config.document?.retention?.defaultDays ?? 2555,
            }, createDocLogger(baseLogger, "lifecycle")),
        );

        // Stuck job recovery worker
        const outputRepo = await c.resolve<DocOutputRepo>(REPO_TOKENS.output);
        const renderJobRepo = await c.resolve<DocRenderJobRepo>(REPO_TOKENS.renderJob);
        const docMetrics = await c.resolve<DocMetrics>(TOKENS.documentMetrics);

        await jobQueue.process(
            "recover-stuck-doc-renders",
            1,
            createRecoverStuckJobsHandler(
                outputRepo,
                renderJobRepo,
                { renderTimeoutMs: config.document?.rendering?.timeoutMs ?? 30000 },
                createDocLogger(baseLogger, "recovery"),
                docMetrics,
            ),
        );

        // ================================================================
        // Health Check Registration
        // ================================================================

        const healthRegistry = await c.resolve<any>(TOKENS.healthRegistry);
        const pdfRenderer = await c.resolve<PuppeteerPdfRenderer>(TOKENS.documentPdfRenderer);

        healthRegistry.register(
            "document-pdf-renderer",
            async () => {
                const result = await pdfRenderer.healthCheck();
                return {
                    status: result.healthy ? "healthy" : "unhealthy",
                    message: result.message,
                    timestamp: new Date(),
                };
            },
            { type: "service", required: false },
        );

        // ================================================================
        // Graceful Shutdown
        // ================================================================

        const shutdownHandler = async () => {
            logger.info("Shutting down document module — closing PDF renderer");
            await pdfRenderer.close();
        };

        process.on("SIGTERM", shutdownHandler);
        process.on("SIGINT", shutdownHandler);

        // ================================================================
        // Schedule Contributions (for CronScheduler)
        // ================================================================

        const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);

        jobRegistry.addSchedule({
            name: "cleanup-doc-outputs",
            cron: "0 3 * * *",       // daily at 3 AM
            jobName: "cleanup-doc-outputs",
        });
        jobRegistry.addSchedule({
            name: "recover-stuck-doc-renders",
            cron: "*/10 * * * *",     // every 10 minutes
            jobName: "recover-stuck-doc-renders",
        });

        logger.info("Document module contributed — routes, workers, schedules, DLQ, health checks registered");
    },
};

export const moduleCode = "DOC";
export const moduleName = "Document Services";
