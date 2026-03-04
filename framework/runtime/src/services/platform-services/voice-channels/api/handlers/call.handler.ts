/**
 * Call Handlers — CRUD + actions for call sessions.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { CallService } from "../../domain/services/CallService.js";
import type { CrmLinkageService } from "../../domain/services/CrmLinkageService.js";
import type { RecordingService } from "../../domain/services/RecordingService.js";
import type { Request, Response } from "express";

const CALL_SERVICE_TOKEN = "tel.callService";
const RECORDING_SERVICE_TOKEN = "tel.recordingService";
const CRM_SERVICE_TOKEN = "tel.crmLinkageService";

export class ListCallSessionsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service =
      await ctx.container.resolve<CallService>(CALL_SERVICE_TOKEN);
    const status = req.query.status as string | undefined;
    const direction = req.query.direction as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const offset = parseInt((req.query.offset as string) ?? "0", 10);

    const sessions = await service.listSessions(ctx.tenant.tenantKey!, {
      status,
      direction,
      limit,
      offset,
    });
    res.status(200).json({ success: true, data: sessions });
  }
}

export class GetCallSessionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service =
      await ctx.container.resolve<CallService>(CALL_SERVICE_TOKEN);
    const session = await service.getSession(
      ctx.tenant.tenantKey!,
      req.params.id,
    );
    if (!session) {
      res.status(404).json({ success: false, error: "Call session not found" });
      return;
    }
    res.status(200).json({ success: true, data: session });
  }
}

export class InitiateCallHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service =
      await ctx.container.resolve<CallService>(CALL_SERVICE_TOKEN);
    const session = await service.initiateOutbound(
      ctx.tenant.tenantKey!,
      req.body.from,
      req.body.to,
      ctx.auth.userId ?? "system",
      req.body.callbackUrl,
    );
    res.status(201).json({ success: true, data: session });
  }
}

export class EndCallHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service =
      await ctx.container.resolve<CallService>(CALL_SERVICE_TOKEN);
    await service.endCall(
      ctx.tenant.tenantKey!,
      req.params.id,
      ctx.auth.userId ?? "system",
    );
    res.status(200).json({ success: true });
  }
}

export class LinkCallToCrmHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const crmService =
      await ctx.container.resolve<CrmLinkageService>(CRM_SERVICE_TOKEN);
    await crmService.linkCallToEntity(
      ctx.tenant.tenantKey!,
      req.params.id,
      req.body.entityType,
      req.body.entityId,
      ctx.auth.userId ?? "system",
    );
    res.status(200).json({ success: true });
  }
}

export class ListCallRecordingsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const recordingService = await ctx.container.resolve<RecordingService>(
      RECORDING_SERVICE_TOKEN,
    );
    const recordings = await recordingService.listBySession(
      ctx.tenant.tenantKey!,
      req.params.id,
    );
    res.status(200).json({ success: true, data: recordings });
  }
}

export class GetRecordingUrlHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const recordingService = await ctx.container.resolve<RecordingService>(
      RECORDING_SERVICE_TOKEN,
    );
    const url = await recordingService.getPresignedUrl(
      ctx.tenant.tenantKey!,
      req.params.recordingId,
    );
    res.status(200).json({ success: true, data: { url } });
  }
}
