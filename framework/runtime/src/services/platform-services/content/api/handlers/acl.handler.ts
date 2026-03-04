/**
 * ACL Handlers - Per-document access control
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { AclService } from "../../domain/services/AclService.js";
import type { Request, Response } from "express";


/**
 * POST /api/content/acl/grant
 * Grant or revoke permission
 */
export class GrantPermissionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const aclService = await ctx.container.resolve<AclService>(TOKENS.aclService);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      attachmentId: string;
      principalId?: string;
      roleId?: string;
      permission: "read" | "download" | "delete" | "share";
      granted: boolean;
      expiresAt?: string;
    };

    if (!body.attachmentId || !body.permission || body.granted === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "attachmentId, permission, and granted are required",
        },
      });
      return;
    }

    if (!body.principalId && !body.roleId) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Either principalId or roleId must be provided",
        },
      });
      return;
    }

    if (body.principalId && body.roleId) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Cannot specify both principalId and roleId",
        },
      });
      return;
    }

    try {
      const acl = await aclService.grantPermission({
        tenantId,
        attachmentId: body.attachmentId,
        principalId: body.principalId,
        roleId: body.roleId,
        permission: body.permission,
        granted: body.granted,
        grantedBy: actorId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });

      res.status(200).json({ success: true, data: acl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res.status(500).json({ success: false, error: { code: "ACL_GRANT_ERROR", message } });
      }
    }
  }
}

/**
 * POST /api/content/acl/revoke
 * Revoke all permissions for a principal
 */
export class RevokePermissionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const aclService = await ctx.container.resolve<AclService>(TOKENS.aclService);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      attachmentId: string;
      principalId: string;
    };

    if (!body.attachmentId || !body.principalId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "attachmentId and principalId are required" },
      });
      return;
    }

    try {
      await aclService.revokePermissions({
        tenantId,
        attachmentId: body.attachmentId,
        principalId: body.principalId,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: { attachmentId: body.attachmentId, principalId: body.principalId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: { code: "ACL_REVOKE_ERROR", message } });
    }
  }
}

/**
 * GET /api/content/acl/:id
 * List ACL entries for document
 */
export class ListAclsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const aclService = await ctx.container.resolve<AclService>(TOKENS.aclService);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const attachmentId = req.params.id;
    if (!attachmentId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Attachment ID is required" },
      });
      return;
    }

    const activeOnly = req.query.activeOnly !== "false";

    try {
      const acls = await aclService.listDocumentAcls(tenantId, attachmentId, activeOnly);

      res.status(200).json({ success: true, data: acls });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: { code: "ACL_LIST_ERROR", message } });
    }
  }
}
