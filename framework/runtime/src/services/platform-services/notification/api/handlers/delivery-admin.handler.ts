/**
 * Delivery admin handler — Admin: delivery status, search.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type {
  MessageId,
  MessageStatus,
  DeliveryStatus,
} from "../../domain/types.js";
import type { NotificationDeliveryRepo } from "../../persistence/NotificationDeliveryRepo.js";
import type { NotificationMessageRepo } from "../../persistence/NotificationMessageRepo.js";
import type { Request, Response } from "express";

const MESSAGE_REPO_TOKEN = "notify.repo.message";
const DELIVERY_REPO_TOKEN = "notify.repo.delivery";

export class ListMessagesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<NotificationMessageRepo>(MESSAGE_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const messages = await repo.list(tenantId, {
      status: req.query.status as MessageStatus | undefined,
      eventCode: req.query.eventCode as string | undefined,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });

    res.status(200).json({ success: true, data: messages });
  }
}

export class GetMessageDeliveriesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<NotificationDeliveryRepo>(
        DELIVERY_REPO_TOKEN,
      );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const messageId = req.params.messageId as MessageId;

    const deliveries = await repo.listByMessageId(tenantId, messageId);
    res.status(200).json({ success: true, data: deliveries });
  }
}

export class ListDeliveriesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<NotificationDeliveryRepo>(
        DELIVERY_REPO_TOKEN,
      );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const deliveries = await repo.list(tenantId, {
      status: req.query.status as DeliveryStatus | undefined,
      channel: req.query.channel as string | undefined,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });

    res.status(200).json({ success: true, data: deliveries });
  }
}

export class MessageStatsHandler implements RouteHandler {
  async handle(
    _req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const messageRepo =
      await ctx.container.resolve<NotificationMessageRepo>(MESSAGE_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const counts = await messageRepo.countByStatus(tenantId);
    res.status(200).json({ success: true, data: counts });
  }
}
