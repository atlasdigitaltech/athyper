/**
 * Webhook Controller — subscription CRUD + inbound webhook receiver.
 */

import { WebhookService } from "../../domain/services/WebhookService.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { WebhookEventRepo } from "../../persistence/WebhookEventRepo.js";
import type { WebhookSubscriptionRepo } from "../../persistence/WebhookSubscriptionRepo.js";
import type { Request, Response } from "express";

const SUB_REPO_TOKEN = "int.repo.webhookSubscription";
const EVENT_REPO_TOKEN = "int.repo.webhookEvent";
const WEBHOOK_SERVICE_TOKEN = "int.service.webhookService";

export class ListWebhookSubscriptionsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<WebhookSubscriptionRepo>(SUB_REPO_TOKEN);
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
          ? false
          : undefined;
    const subs = await repo.list(ctx.tenant.tenantKey!, { isActive });
    res.status(200).json({ success: true, data: subs });
  }
}

export class CreateWebhookSubscriptionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<WebhookService>(
      WEBHOOK_SERVICE_TOKEN,
    );
    const sub = await service.createSubscription({
      tenantId: ctx.tenant.tenantKey!,
      code: req.body.code,
      name: req.body.name,
      endpointUrl: req.body.endpointUrl,
      secret: req.body.secret,
      eventTypes: req.body.eventTypes,
      metadata: req.body.metadata,
      createdBy: ctx.auth.userId ?? "system",
    });
    res.status(201).json({ success: true, data: sub });
  }
}

export class UpdateWebhookSubscriptionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<WebhookService>(
      WEBHOOK_SERVICE_TOKEN,
    );
    await service.updateSubscription(ctx.tenant.tenantKey!, req.params.id, {
      ...req.body,
      updatedBy: ctx.auth.userId ?? "system",
    });
    res.status(200).json({ success: true });
  }
}

export class DeleteWebhookSubscriptionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<WebhookService>(
      WEBHOOK_SERVICE_TOKEN,
    );
    await service.deleteSubscription(ctx.tenant.tenantKey!, req.params.id);
    res.status(204).end();
  }
}

export class RotateWebhookSecretHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<WebhookService>(
      WEBHOOK_SERVICE_TOKEN,
    );
    const result = await service.rotateSecret(
      ctx.tenant.tenantKey!,
      req.params.id,
    );
    res
      .status(200)
      .json({ success: true, data: { newSecret: result.newSecret } });
  }
}

export class InboundWebhookHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const subRepo =
      await ctx.container.resolve<WebhookSubscriptionRepo>(SUB_REPO_TOKEN);
    const eventRepo =
      await ctx.container.resolve<WebhookEventRepo>(EVENT_REPO_TOKEN);

    // Look up subscription by code from URL param
    const subscriptionCode = req.params.subscriptionCode;
    const sub = await subRepo.getByCode(
      ctx.tenant.tenantKey!,
      subscriptionCode,
    );

    if (!sub || !sub.isActive) {
      res
        .status(404)
        .json({ success: false, error: "Subscription not found or inactive" });
      return;
    }

    // Verify HMAC signature
    const signatureHeader = (req.headers["x-webhook-signature-256"] ??
      req.headers["x-signature-256"]) as string | undefined;
    if (signatureHeader) {
      const bodyStr = JSON.stringify(req.body);
      const isValid = WebhookService.verifySignature(
        bodyStr,
        signatureHeader,
        sub.secretHash,
      );
      if (!isValid) {
        res
          .status(401)
          .json({ success: false, error: "Invalid webhook signature" });
        return;
      }
    }

    // Create event record
    const eventType =
      (req.headers["x-webhook-event"] as string) ??
      req.body.eventType ??
      "unknown";
    await eventRepo.create(ctx.tenant.tenantKey!, {
      subscriptionId: sub.id,
      eventType,
      payload: req.body,
    });

    // Return 202 Accepted — processing happens async via worker
    res.status(202).json({ success: true, message: "Event accepted" });
  }
}
