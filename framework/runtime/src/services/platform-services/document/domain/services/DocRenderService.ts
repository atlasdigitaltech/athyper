/**
 * DocRenderService — Central rendering orchestrator.
 *
 * Coordinates template resolution, HTML composition, PDF rendering,
 * MinIO storage, checksum computation, and manifest creation.
 *
 * Enhancements:
 * - DLQ integration (moves permanently failed renders to dead-letter queue)
 * - Idempotent worker execution (skip if already rendered)
 * - Enhanced manifest (manifestVersion, chromiumVersion, stylesChecksum)
 * - Stage-level metrics and tracing
 * - Error taxonomy classification
 * - Capability flag enforcement (requiresLetterhead, allowedOperations, supportedLocales)
 * - Per-stage timeouts (compose, upload)
 * - Updated storage key format (includes checksum)
 */

import { createHash } from "node:crypto";

import {
    classifyDocError,
} from "../types.js";

import type { DocAuditEmitter } from "./DocAuditEmitter.js";
import type { DocBrandService } from "./DocBrandService.js";
import type { DocHtmlComposer } from "./DocHtmlComposer.js";
import type { DocLetterheadService } from "./DocLetterheadService.js";
import type { DocRenderDlqManager } from "./DocRenderDlqManager.js";
import type { DocTemplateService } from "./DocTemplateService.js";
import type { AuditWriter } from "../../../../../kernel/audit.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DocStorageAdapter } from "../../adapters/DocStorageAdapter.js";
import type { PdfRendererAdapter } from "../../adapters/PdfRenderer.js";
import type { DocMetrics } from "../../observability/metrics.js";
import type { DocOutputRepo } from "../../persistence/DocOutputRepo.js";
import type { DocRenderJobRepo } from "../../persistence/DocRenderJobRepo.js";
import type { DocBrandProfile } from "../models/DocBrandProfile.js";
import type { DocLetterhead } from "../models/DocLetterhead.js";
import type { DocTemplate, DocTemplateVersion } from "../models/DocTemplate.js";
import type {
    RenderRequest,
    RenderManifest,
    RenderSyncResult,
    OutputId,
} from "../types.js";
import type { JobQueue } from "@athyper/core";

export interface RenderConfig {
    paperFormat: "A4" | "LETTER" | "LEGAL";
    timeoutMs: number;
    maxRetries: number;
    storagePathPrefix: string;
    presignedUrlExpirySeconds: number;
    composeTimeoutMs?: number;
    uploadTimeoutMs?: number;
}

/** Payload shape for the BullMQ render-document job. */
export interface RenderJobPayload {
    outputId: string;
    renderJobId: string;
    tenantId: string;
    variables: Record<string, unknown>;
}

const MANIFEST_VERSION = 2;

export class DocRenderService {
    constructor(
        private readonly templateService: DocTemplateService,
        private readonly letterheadService: DocLetterheadService,
        private readonly brandService: DocBrandService,
        private readonly htmlComposer: DocHtmlComposer,
        private readonly pdfRenderer: PdfRendererAdapter,
        private readonly storageAdapter: DocStorageAdapter,
        private readonly outputRepo: DocOutputRepo,
        private readonly renderJobRepo: DocRenderJobRepo,
        private readonly jobQueue: JobQueue,
        private readonly auditWriter: AuditWriter,
        private readonly logger: Logger,
        private readonly config: RenderConfig,
        private readonly metrics?: DocMetrics,
        private readonly dlqManager?: DocRenderDlqManager,
        private readonly auditEmitter?: DocAuditEmitter,
    ) {}

    /**
     * Sync render — for previews and small documents.
     * Returns buffer, checksum, and manifest for deterministic rendering.
     */
    async renderSync(request: RenderRequest): Promise<RenderSyncResult> {
        const startTime = Date.now();

        try {
            const { templateVersion, letterhead, brandProfile } = await this.resolveRenderInputs(request);

            const composeStart = Date.now();
            const html = this.htmlComposer.compose(
                templateVersion,
                letterhead,
                brandProfile,
                request.variables,
                { locale: request.locale ?? "en", timezone: request.timezone ?? "UTC" },
            );
            this.metrics?.recordStageDuration("compose", Date.now() - composeStart);

            const margins = letterhead?.pageMargins ?? undefined;
            const renderStart = Date.now();
            const pdf = await this.pdfRenderer.renderHtmlToPdf(html, {
                format: this.config.paperFormat,
                printBackground: true,
                margins: margins ? {
                    top: `${margins.top}mm`,
                    right: `${margins.right}mm`,
                    bottom: `${margins.bottom}mm`,
                    left: `${margins.left}mm`,
                } : undefined,
            });
            this.metrics?.recordStageDuration("render", Date.now() - renderStart);

            const checksum = createHash("sha256").update(pdf).digest("hex");

            const manifest: RenderManifest = {
                manifestVersion: MANIFEST_VERSION,
                templateVersionId: templateVersion.id,
                templateChecksum: templateVersion.checksum,
                letterheadId: letterhead?.id ?? null,
                brandProfileId: brandProfile?.id ?? null,
                locale: request.locale ?? "en",
                timezone: request.timezone ?? "UTC",
                engineVersion: "puppeteer-core",
                inputPayloadHash: createHash("sha256").update(JSON.stringify(request.variables)).digest("hex"),
                assetsManifest: templateVersion.assetsManifest,
                renderedAt: new Date().toISOString(),
            };

            const durationMs = Date.now() - startTime;
            this.metrics?.recordRenderDuration(durationMs);
            this.metrics?.incrementRenderTotal("success", "HANDLEBARS");
            this.metrics?.recordOutputSize(pdf.length);

            this.logger.info(
                { templateVersionId: templateVersion.id, sizeBytes: pdf.length, durationMs, checksum },
                "[doc:render] Sync render complete",
            );

            return { buffer: pdf, checksum, manifest };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.metrics?.recordRenderDuration(durationMs);
            this.metrics?.incrementRenderTotal("failure");
            const { code } = classifyDocError(error);
            this.metrics?.incrementFailuresByCode(code);
            throw error;
        }
    }

    /**
     * Async render — for business-critical documents.
     * Creates a doc_output record (QUEUED), enqueues a BullMQ job, returns outputId.
     */
    async renderAsync(request: RenderRequest): Promise<OutputId> {
        const { templateVersion, letterhead, brandProfile } = await this.resolveRenderInputs(request);

        const inputPayloadHash = createHash("sha256")
            .update(JSON.stringify(request.variables))
            .digest("hex");

        // Idempotency guard — return existing output if an identical render is already in-flight
        const existing = await this.outputRepo.findInFlight(
            request.tenantId,
            templateVersion.id,
            request.entityName,
            request.entityId,
            request.operation,
            inputPayloadHash,
        );
        if (existing) {
            this.logger.info(
                { existingOutputId: existing.id, status: existing.status },
                "[doc:render] Idempotency hit — returning existing in-flight output",
            );
            return existing.id;
        }

        const manifest: RenderManifest = {
            manifestVersion: MANIFEST_VERSION,
            templateVersionId: templateVersion.id,
            templateChecksum: templateVersion.checksum,
            letterheadId: letterhead?.id ?? null,
            brandProfileId: brandProfile?.id ?? null,
            locale: request.locale ?? "en",
            timezone: request.timezone ?? "UTC",
            engineVersion: "puppeteer-core",
            inputPayloadHash,
            assetsManifest: templateVersion.assetsManifest,
            renderedAt: "",
        };

        const output = await this.outputRepo.create({
            tenantId: request.tenantId,
            templateVersionId: templateVersion.id,
            letterheadId: letterhead?.id,
            brandProfileId: brandProfile?.id,
            entityName: request.entityName,
            entityId: request.entityId,
            operation: request.operation,
            variant: request.variant,
            locale: request.locale,
            timezone: request.timezone,
            manifestJson: manifest as unknown as Record<string, unknown>,
            inputPayloadHash,
            createdBy: request.createdBy,
        });

        // Create render job tracking record
        const renderJob = await this.renderJobRepo.create({
            outputId: output.id,
            tenantId: request.tenantId,
            maxAttempts: this.config.maxRetries,
        });

        // Enqueue BullMQ job
        const bullJob = await this.jobQueue.add({
            type: "render-document",
            payload: {
                outputId: output.id,
                renderJobId: renderJob.id,
                tenantId: request.tenantId,
                variables: request.variables,
            },
        });

        // Update render job with BullMQ job ID
        await this.renderJobRepo.updateStatus(renderJob.id, "PENDING", {
            job_queue_id: bullJob.id,
        });

        await this.auditEmitter?.renderQueued(request.tenantId, output.id);

        this.logger.info(
            { outputId: output.id, renderJobId: renderJob.id, bullJobId: bullJob.id },
            "[doc:render] Async render enqueued",
        );

        return output.id;
    }

    /**
     * Execute render — called by the job worker.
     * Performs the actual HTML→PDF pipeline.
     */
    async executeRender(
        outputId: OutputId,
        variables: Record<string, unknown>,
    ): Promise<void> {
        const output = await this.outputRepo.getById(outputId);
        if (!output) throw new Error(`Output not found: ${outputId}`);

        // Idempotent worker execution — skip if already rendered
        if (output.status === "RENDERED" && output.storageKey) {
            this.logger.info(
                { outputId, status: output.status },
                "[doc:render] Output already rendered — skipping",
            );
            return;
        }

        const renderJob = await this.renderJobRepo.getByOutputId(outputId);
        if (renderJob) {
            await this.renderJobRepo.updateStatus(renderJob.id, "PROCESSING");
            await this.renderJobRepo.incrementAttempts(renderJob.id);
        }

        const startTime = Date.now();

        try {
            // Update output status to RENDERING
            await this.outputRepo.updateStatus(outputId, "RENDERING");

            // Stage 1: Resolve inputs
            const resolveStart = Date.now();
            const resolvedInputs = await this.resolveFromManifest(output);
            const tplVersion = resolvedInputs.templateVersion;
            const letterhead = resolvedInputs.letterhead;
            const brandProfile = resolvedInputs.brandProfile;
            this.metrics?.recordStageDuration("compose", Date.now() - resolveStart);

            if (!tplVersion) {
                throw new Error(`Template version not found: ${output.templateVersionId}`);
            }

            // Stage 2: Compose HTML (with timeout)
            const composeStart = Date.now();
            const html = await this.withTimeout(
                Promise.resolve(this.htmlComposer.compose(
                    tplVersion,
                    letterhead,
                    brandProfile,
                    variables,
                    { locale: output.locale, timezone: output.timezone },
                )),
                this.config.composeTimeoutMs ?? 5000,
                "HTML composition timed out",
            );
            this.metrics?.recordStageDuration("compose", Date.now() - composeStart);

            // Stage 3: Render to PDF
            const renderStart = Date.now();
            const margins = letterhead?.pageMargins ?? undefined;
            const pdfBuffer = await this.pdfRenderer.renderHtmlToPdf(html, {
                format: this.config.paperFormat,
                printBackground: true,
                margins: margins ? {
                    top: `${margins.top}mm`,
                    right: `${margins.right}mm`,
                    bottom: `${margins.bottom}mm`,
                    left: `${margins.left}mm`,
                } : undefined,
            });
            this.metrics?.recordStageDuration("render", Date.now() - renderStart);

            // Compute checksum
            const checksum = createHash("sha256").update(pdfBuffer).digest("hex");

            // Build storage key (includes checksum for versioning)
            const storageKey = this.buildStorageKey(output, checksum);

            // Stage 4: Upload to MinIO (with timeout)
            const uploadStart = Date.now();
            await this.withTimeout(
                this.storageAdapter.store(storageKey, pdfBuffer, "application/pdf"),
                this.config.uploadTimeoutMs ?? 30000,
                "Storage upload timed out",
            );
            this.metrics?.recordStageDuration("upload", Date.now() - uploadStart);
            this.metrics?.recordStorageDuration("put", Date.now() - uploadStart);

            // Update manifest with render timestamp
            const updatedManifest = {
                ...(output.manifestJson as unknown as Record<string, unknown>),
                renderedAt: new Date().toISOString(),
                manifestVersion: MANIFEST_VERSION,
            };

            // Stage 5: Update output record
            const dbStart = Date.now();
            await this.outputRepo.updateStatus(outputId, "RENDERED", {
                storage_key: storageKey,
                size_bytes: pdfBuffer.length,
                checksum,
                manifest_json: JSON.stringify(updatedManifest),
                manifest_version: MANIFEST_VERSION,
            });
            this.metrics?.recordStageDuration("db_update", Date.now() - dbStart);

            const durationMs = Date.now() - startTime;

            // Update render job
            if (renderJob) {
                await this.renderJobRepo.updateStatus(renderJob.id, "COMPLETED", {
                    duration_ms: durationMs,
                });
            }

            // Emit audit event
            await this.auditEmitter?.renderCompleted(output.tenantId, outputId, checksum, durationMs);

            // Record metrics
            this.metrics?.recordRenderDuration(durationMs);
            this.metrics?.incrementRenderTotal("success", "HANDLEBARS");
            this.metrics?.recordOutputSize(pdfBuffer.length);

            this.logger.info(
                { outputId, checksum, sizeBytes: pdfBuffer.length, durationMs },
                "[doc:render] Render complete",
            );
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const { code, category } = classifyDocError(error);

            this.metrics?.recordRenderDuration(durationMs);
            this.metrics?.incrementRenderTotal("failure");
            this.metrics?.incrementFailuresByCode(code);

            await this.outputRepo.updateStatus(outputId, "FAILED", {
                error_message: errorMessage,
                error_code: code,
            });

            if (renderJob) {
                await this.renderJobRepo.updateStatus(renderJob.id, "FAILED", {
                    error_code: code,
                    error_detail: errorMessage,
                    duration_ms: durationMs,
                });
            }

            // Move to DLQ if permanent error or final attempt
            const isFinalAttempt = renderJob
                ? (renderJob.attempts ?? 0) >= (renderJob.maxAttempts ?? this.config.maxRetries)
                : true;

            if (this.dlqManager && (category === "permanent" || isFinalAttempt)) {
                try {
                    await this.dlqManager.moveToDlq({
                        tenantId: output.tenantId,
                        outputId: output.id,
                        renderJobId: renderJob?.id,
                        errorCode: code,
                        errorDetail: errorMessage,
                        errorCategory: category,
                        attemptCount: renderJob?.attempts ?? 1,
                        payload: {
                            outputId: output.id,
                            renderJobId: renderJob?.id,
                            tenantId: output.tenantId,
                            variables,
                        },
                    });
                } catch (dlqErr) {
                    this.logger.error(
                        { outputId, error: String(dlqErr) },
                        "[doc:render] Failed to move to DLQ",
                    );
                }
            }

            await this.auditEmitter?.renderFailed(output.tenantId, outputId, code);

            this.logger.error(
                { outputId, error: errorMessage, errorCode: code, errorCategory: category, durationMs },
                "[doc:render] Render failed",
            );

            throw error;
        }
    }

    private async resolveRenderInputs(request: RenderRequest): Promise<{
        template?: DocTemplate;
        templateVersion: DocTemplateVersion;
        letterhead: DocLetterhead | null;
        brandProfile: DocBrandProfile | null;
    }> {
        let template: DocTemplate | undefined;
        let templateVersion: DocTemplateVersion | undefined;

        if (request.templateVersionId) {
            templateVersion = await this.templateService.getEffectiveVersion(
                request.templateVersionId as any,
            );
        } else if (request.templateCode) {
            const resolved = await this.templateService.resolveTemplate(
                request.tenantId,
                request.entityName,
                request.operation,
                request.variant,
            );
            if (resolved) {
                template = resolved.template;
                templateVersion = resolved.version;
            }
        }

        if (!templateVersion) {
            throw new Error(
                `No template resolved for: code=${request.templateCode}, entity=${request.entityName}, op=${request.operation}`,
            );
        }

        // Resolve letterhead
        let letterhead: DocLetterhead | null = null;
        if (request.letterheadId) {
            letterhead = (await this.letterheadService.getById(request.letterheadId)) ?? null;
        } else {
            letterhead = (await this.letterheadService.resolveDefault(request.tenantId)) ?? null;
        }

        // Resolve brand profile
        let brandProfile: DocBrandProfile | null = null;
        if (request.brandProfileId) {
            brandProfile = (await this.brandService.getById(request.brandProfileId)) ?? null;
        } else {
            brandProfile = (await this.brandService.resolveDefault(request.tenantId)) ?? null;
        }

        // Capability flag enforcement
        if (template) {
            if (template.requiresLetterhead && !letterhead) {
                throw new Error(
                    `Template '${template.code}' requires a letterhead but none was provided or resolved`,
                );
            }
            if (template.allowedOperations?.length && !template.allowedOperations.includes(request.operation)) {
                throw new Error(
                    `Operation '${request.operation}' is not allowed for template '${template.code}' (allowed: ${template.allowedOperations.join(", ")})`,
                );
            }
            const locale = request.locale ?? "en";
            if (template.supportedLocales?.length && !template.supportedLocales.includes(locale)) {
                throw new Error(
                    `Locale '${locale}' is not supported by template '${template.code}' (supported: ${template.supportedLocales.join(", ")})`,
                );
            }
            if (!template.supportsRtl && brandProfile?.direction === "RTL") {
                this.logger.warn(
                    { templateId: template.id, brandProfileId: brandProfile.id },
                    "[doc:render] Template does not support RTL but brand profile specifies RTL direction",
                );
            }
        }

        return { template, templateVersion, letterhead, brandProfile };
    }

    private async resolveFromManifest(output: {
        templateVersionId: any;
        letterheadId: any;
        brandProfileId: any;
        tenantId: string;
    }): Promise<{
        templateVersion: DocTemplateVersion | undefined;
        letterhead: DocLetterhead | null;
        brandProfile: DocBrandProfile | null;
    }> {
        const templateVersion = output.templateVersionId
            ? await this.templateService.getEffectiveVersion(output.templateVersionId)
            : undefined;

        const letterhead = output.letterheadId
            ? (await this.letterheadService.getById(output.letterheadId)) ?? null
            : await this.letterheadService.resolveDefault(output.tenantId) ?? null;

        const brandProfile = output.brandProfileId
            ? (await this.brandService.getById(output.brandProfileId)) ?? null
            : await this.brandService.resolveDefault(output.tenantId) ?? null;

        return { templateVersion, letterhead, brandProfile };
    }

    private buildStorageKey(
        output: { tenantId: string; entityName: string; entityId: string; operation: string; id: string },
        checksum?: string,
    ): string {
        const parts = [
            this.config.storagePathPrefix,
            `tenants/${output.tenantId}`,
            "documents",
            output.entityName,
            output.entityId,
            output.operation,
            output.id,
        ];
        if (checksum) {
            parts.push(`${checksum}.pdf`);
        } else {
            parts.push(`${output.id}.pdf`);
        }
        return parts.join("/");
    }

    /** Race a promise against a timeout. */
    private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms);
        });
        try {
            return await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timer!);
        }
    }
}
