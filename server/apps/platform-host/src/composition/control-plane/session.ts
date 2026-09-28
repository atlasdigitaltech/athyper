import type { Application } from "express";
import type { Authenticator } from "@athyper/server-contract-auth";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import { defineRouteContract, registerContractRoute, HttpError } from "@athyper/server-runtime-http";
import { assertPlatformAuthority, type PlatformAuthority } from "../shared/identity/platform-authority.js";

/** Read-only verification before cutover; does not grant or simulate authority. */
export function registerControlSession(app: Application, authenticator: Authenticator, authority: PlatformAuthority) {
  registerContractRoute(app, defineRouteContract({ method: "get", path: "/api/platform-control/session",
    operationId: "platform.control.session", summary: "Verify the current control-plane identity and MFA", authenticated: true,
    responses: { 200: { description: "Verified identity", body: { type: "object", additionalProperties: true } },
      403: { description: "Control authority or MFA missing" } },
  }), createIamAuthenticationMiddleware(authenticator), (_request, response, next) => {
    try {
      const context = readVerifiedRequestContext(response);
      assertPlatformAuthority(context, authority);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ principalId: context.principalId, tenantId: context.tenantId, plane: context.planeKey,
        realm: context.realmKey, assurance: context.assurance, authenticationMethods: context.authenticationMethods ?? [],
        allowedPermissions: context.permissions.allowed });
    } catch { next(new HttpError(403, "PLATFORM_AUTHORITY_DENIED", "Control identity and MFA are required")); }
  });
}
