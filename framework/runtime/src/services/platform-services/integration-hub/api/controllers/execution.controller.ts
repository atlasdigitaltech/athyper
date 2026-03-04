/**
 * Execution Controller — flow CRUD and execution handlers.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { OrchestrationRuntime } from "../../domain/services/OrchestrationRuntime.js";
import type { FlowRepo } from "../../persistence/FlowRepo.js";
import type { JobLogRepo } from "../../persistence/JobLogRepo.js";
import type { Request, Response } from "express";

const FLOW_REPO_TOKEN = "int.repo.flow";
const JOB_LOG_REPO_TOKEN = "int.repo.jobLog";
const RUNTIME_TOKEN = "int.service.orchestrationRuntime";

export class ListFlowsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<FlowRepo>(FLOW_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey!;
    const triggerType = req.query.triggerType as string | undefined;
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
          ? false
          : undefined;
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const offset = parseInt((req.query.offset as string) ?? "0", 10);

    const flows = await repo.list(tenantId, {
      triggerType,
      isActive,
      limit,
      offset,
    });
    res.status(200).json({ success: true, data: flows });
  }
}

export class GetFlowHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<FlowRepo>(FLOW_REPO_TOKEN);
    const flow = await repo.getById(ctx.tenant.tenantKey!, req.params.id);
    if (!flow) {
      res.status(404).json({ success: false, error: "Flow not found" });
      return;
    }
    res.status(200).json({ success: true, data: flow });
  }
}

export class CreateFlowHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<FlowRepo>(FLOW_REPO_TOKEN);
    const flow = await repo.create({
      tenantId: ctx.tenant.tenantKey!,
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      steps: req.body.steps,
      triggerType: req.body.triggerType,
      triggerConfig: req.body.triggerConfig,
      createdBy: ctx.auth.userId ?? "system",
    });
    res.status(201).json({ success: true, data: flow });
  }
}

export class UpdateFlowHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<FlowRepo>(FLOW_REPO_TOKEN);
    await repo.update(ctx.tenant.tenantKey!, req.params.id, {
      ...req.body,
      updatedBy: ctx.auth.userId ?? "system",
    });
    // Increment version on structure changes
    if (req.body.steps) {
      await repo.incrementVersion(ctx.tenant.tenantKey!, req.params.id);
    }
    res.status(200).json({ success: true });
  }
}

export class ExecuteFlowHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const flowRepo = await ctx.container.resolve<FlowRepo>(FLOW_REPO_TOKEN);
    const runtime =
      await ctx.container.resolve<OrchestrationRuntime>(RUNTIME_TOKEN);

    const flow = await flowRepo.getById(ctx.tenant.tenantKey!, req.params.id);
    if (!flow) {
      res.status(404).json({ success: false, error: "Flow not found" });
      return;
    }
    if (!flow.isActive) {
      res.status(400).json({ success: false, error: "Flow is inactive" });
      return;
    }

    const input = req.body.input ?? {};
    const result = await runtime.executeFlow(
      flow,
      input,
      ctx.tenant.tenantKey!,
      ctx.auth.userId ?? "system",
    );

    res.status(200).json({ success: true, data: result });
  }
}

export class GetFlowRunLogsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const jobLogRepo =
      await ctx.container.resolve<JobLogRepo>(JOB_LOG_REPO_TOKEN);
    const logs = await jobLogRepo.listByRun(
      ctx.tenant.tenantKey!,
      req.params.id,
      req.params.runId,
    );
    res.status(200).json({ success: true, data: logs });
  }
}
