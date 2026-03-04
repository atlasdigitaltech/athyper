/**
 * Render job admin handlers — List, get, retry render jobs.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { DocRenderService } from "../../domain/services/DocRenderService.js";
import type { RenderJobId, RenderJobStatus } from "../../domain/types.js";
import type { DocOutputRepo } from "../../persistence/DocOutputRepo.js";
import type { DocRenderJobRepo } from "../../persistence/DocRenderJobRepo.js";
import type { Request, Response } from "express";


const RENDER_JOB_REPO_TOKEN = "doc.repo.renderJob";
const OUTPUT_REPO_TOKEN = "doc.repo.output";

export class ListRenderJobsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<DocRenderJobRepo>(RENDER_JOB_REPO_TOKEN);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const jobs = await repo.list(tenantId, {
            status: req.query.status as RenderJobStatus | undefined,
            limit: Number(req.query.limit) || 100,
            offset: Number(req.query.offset) || 0,
        });

        res.status(200).json({ success: true, data: jobs });
    }
}

export class GetRenderJobHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<DocRenderJobRepo>(RENDER_JOB_REPO_TOKEN);

        const job = await repo.getById(req.params.id as RenderJobId);
        if (!job) {
            res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Render job not found" } });
            return;
        }

        // Include associated output
        const outputRepo = await ctx.container.resolve<DocOutputRepo>(OUTPUT_REPO_TOKEN);
        const output = await outputRepo.getById(job.outputId);

        res.status(200).json({ success: true, data: { ...job, output } });
    }
}

export class RetryRenderJobHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<DocRenderJobRepo>(RENDER_JOB_REPO_TOKEN);
        const renderService = await ctx.container.resolve<DocRenderService>(TOKENS.documentRenderService);

        const job = await repo.getById(req.params.id as RenderJobId);
        if (!job) {
            res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Render job not found" } });
            return;
        }

        if (job.status !== "FAILED") {
            res.status(400).json({
                success: false,
                error: { code: "INVALID_STATUS", message: "Can only retry failed jobs" },
            });
            return;
        }

        // Reset job status and re-enqueue
        await repo.updateStatus(job.id, "RETRYING");

        // The output record needs to be reset too
        const outputRepo = await ctx.container.resolve<DocOutputRepo>(OUTPUT_REPO_TOKEN);
        await outputRepo.updateStatus(job.outputId, "QUEUED", { error_message: null });

        res.status(202).json({ success: true, message: "Render job retry enqueued" });
    }
}
