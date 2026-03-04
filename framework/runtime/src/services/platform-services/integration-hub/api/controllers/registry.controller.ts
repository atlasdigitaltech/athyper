/**
 * Registry Controller — endpoint CRUD handlers.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { HttpConnectorClient } from "../../connectors/http/HttpConnectorClient.js";
import type { EndpointRepo } from "../../persistence/EndpointRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "int.repo.endpoint";
const CLIENT_TOKEN = "int.service.httpClient";

export class ListEndpointsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey!;
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
          ? false
          : undefined;
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const offset = parseInt((req.query.offset as string) ?? "0", 10);

    const endpoints = await repo.list(tenantId, { isActive, limit, offset });
    res.status(200).json({ success: true, data: endpoints });
  }
}

export class GetEndpointHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    const endpoint = await repo.getById(ctx.tenant.tenantKey!, req.params.id);
    if (!endpoint) {
      res.status(404).json({ success: false, error: "Endpoint not found" });
      return;
    }
    res.status(200).json({ success: true, data: endpoint });
  }
}

export class CreateEndpointHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    const endpoint = await repo.create({
      tenantId: ctx.tenant.tenantKey!,
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      url: req.body.url,
      httpMethod: req.body.httpMethod,
      authType: req.body.authType,
      authConfig: req.body.authConfig,
      defaultHeaders: req.body.defaultHeaders,
      timeoutMs: req.body.timeoutMs,
      retryPolicy: req.body.retryPolicy,
      rateLimitConfig: req.body.rateLimitConfig,
      createdBy: ctx.auth.userId ?? "system",
    });
    res.status(201).json({ success: true, data: endpoint });
  }
}

export class UpdateEndpointHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    await repo.update(ctx.tenant.tenantKey!, req.params.id, {
      ...req.body,
      updatedBy: ctx.auth.userId ?? "system",
    });
    res.status(200).json({ success: true });
  }
}

export class DeleteEndpointHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    await repo.delete(ctx.tenant.tenantKey!, req.params.id);
    res.status(204).end();
  }
}

export class TestEndpointHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<EndpointRepo>(REPO_TOKEN);
    const client =
      await ctx.container.resolve<HttpConnectorClient>(CLIENT_TOKEN);

    const endpoint = await repo.getById(ctx.tenant.tenantKey!, req.params.id);
    if (!endpoint) {
      res.status(404).json({ success: false, error: "Endpoint not found" });
      return;
    }

    const testBody = req.body.testPayload ?? {
      ping: true,
      timestamp: new Date().toISOString(),
    };
    const response = await client.execute(endpoint, { body: testBody });

    res.status(200).json({
      success: true,
      data: {
        statusCode: response.status,
        durationMs: response.durationMs,
        responseBody: response.body,
      },
    });
  }
}
