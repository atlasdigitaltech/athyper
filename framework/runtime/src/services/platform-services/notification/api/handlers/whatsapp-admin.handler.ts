/**
 * WhatsApp admin handlers — Sync/list templates + consent management.
 */

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { WhatsAppTemplateSync } from "../../adapters/whatsapp/WhatsAppTemplateSync.js";
import type { WhatsAppConsentRepo } from "../../persistence/WhatsAppConsentRepo.js";
import type { Request, Response } from "express";

const SYNC_TOKEN = "notify.whatsappSync";
const CONSENT_REPO_TOKEN = "notify.repo.whatsappConsent";

export class SyncWhatsAppTemplatesHandler implements RouteHandler {
  async handle(
    _req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const sync = await ctx.container.resolve<WhatsAppTemplateSync>(SYNC_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const result = await sync.syncTemplates(tenantId);

    res.status(200).json({
      success: true,
      data: {
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
  }
}

export class ListWhatsAppTemplatesHandler implements RouteHandler {
  async handle(
    _req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const sync = await ctx.container.resolve<WhatsAppTemplateSync>(SYNC_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const templates = await sync.listApproved(tenantId);

    res.status(200).json({
      success: true,
      data: templates,
    });
  }
}

export class ManageWhatsAppConsentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const consentRepo =
      await ctx.container.resolve<WhatsAppConsentRepo>(CONSENT_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const body = req.body as {
      phoneNumber?: string;
      principalId?: string;
      optedIn?: boolean;
      optInMethod?: string;
    };

    if (!body.phoneNumber || body.optedIn === undefined) {
      res.status(400).json({ error: "phoneNumber and optedIn are required" });
      return;
    }

    const consent = await consentRepo.upsertConsent({
      tenantId,
      phoneNumber: body.phoneNumber,
      principalId: body.principalId,
      optedIn: body.optedIn,
      optInMethod: body.optInMethod ?? "admin",
    });

    res.status(200).json({ success: true, data: consent });
  }
}

export class ListWhatsAppConsentsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const consentRepo =
      await ctx.container.resolve<WhatsAppConsentRepo>(CONSENT_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const optedInOnly = req.query.optedInOnly === "true";

    const consents = await consentRepo.list(tenantId, {
      limit,
      offset,
      optedInOnly,
    });

    res.status(200).json({ success: true, data: consents });
  }
}

export class CheckConversationWindowHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const consentRepo =
      await ctx.container.resolve<WhatsAppConsentRepo>(CONSENT_REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const phone = req.params.phone;

    if (!phone) {
      res.status(400).json({ error: "phone parameter is required" });
      return;
    }

    const consent = await consentRepo.getByPhone(tenantId, phone);
    if (!consent) {
      res
        .status(404)
        .json({ error: "No consent record found for this phone number" });
      return;
    }

    const inWindow = consent.conversationWindowEnd
      ? new Date() < consent.conversationWindowEnd
      : false;

    res.status(200).json({
      success: true,
      data: {
        phoneNumber: consent.phoneNumber,
        optedIn: consent.optedIn,
        inConversationWindow: inWindow,
        windowStart: consent.conversationWindowStart?.toISOString() ?? null,
        windowEnd: consent.conversationWindowEnd?.toISOString() ?? null,
      },
    });
  }
}
