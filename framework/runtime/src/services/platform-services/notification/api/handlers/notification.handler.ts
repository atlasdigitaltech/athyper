/**
 * Notification inbox handler — User-facing: list, mark-read, dismiss.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { InAppNotificationRepo } from "../../persistence/InAppNotificationRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "notify.repo.inapp";

export class ListNotificationsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<InAppNotificationRepo>(REPO_TOKEN);
    const userId = ctx.auth.userId;
    const tenantId = ctx.tenant.tenantKey ?? "default";

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHENTICATED", message: "User ID required" },
      });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === "true";

    const items = await repo.listForRecipient(tenantId, userId, {
      unreadOnly,
      limit,
      offset,
    });

    res.status(200).json({ success: true, data: items });
  }
}

export class UnreadCountHandler implements RouteHandler {
  async handle(
    _req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<InAppNotificationRepo>(REPO_TOKEN);
    const userId = ctx.auth.userId;
    const tenantId = ctx.tenant.tenantKey ?? "default";

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHENTICATED", message: "User ID required" },
      });
      return;
    }

    const count = await repo.unreadCount(tenantId, userId);
    res.status(200).json({ success: true, data: { count } });
  }
}

export class MarkReadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<InAppNotificationRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const notificationId = req.params.id;

    if (!notificationId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Notification ID required" },
      });
      return;
    }

    await repo.markAsRead(tenantId, notificationId);
    res.status(200).json({ success: true });
  }
}

export class MarkAllReadHandler implements RouteHandler {
  async handle(
    _req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<InAppNotificationRepo>(REPO_TOKEN);
    const userId = ctx.auth.userId;
    const tenantId = ctx.tenant.tenantKey ?? "default";

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHENTICATED", message: "User ID required" },
      });
      return;
    }

    await repo.markAllAsRead(tenantId, userId);
    res.status(200).json({ success: true });
  }
}

export class DismissHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<InAppNotificationRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const notificationId = req.params.id;

    if (!notificationId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Notification ID required" },
      });
      return;
    }

    await repo.dismiss(tenantId, notificationId);
    res.status(200).json({ success: true });
  }
}
