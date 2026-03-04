/**
 * IAM Routes Module
 *
 * REST API endpoints for Identity and Access Management.
 */

import { createMfaRoutes } from "../mfa/mfa.routes.js";
import { MfaService } from "../mfa/mfa.service.js";
import { DatabasePersonaCapabilityRepository } from "../persona-model/persona-capability.repository.js";
import {
  PersonaCapabilityService,
} from "../persona-model/persona-capability.service.js";


// Route creators
import { createCapabilitiesRoutes } from "./capabilities.routes.js";
import { createGroupsRoutes } from "./groups.routes.js";
import { createOusRoutes } from "./ous.routes.js";
import { createPrincipalsRoutes } from "./principals.routes.js";
import { createRoleBindingsRoutes } from "./role-bindings.routes.js";
import { createRolesRoutes } from "./roles.routes.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { Request, Router } from "express";
import type { Kysely } from "kysely";

export { createCapabilitiesRoutes } from "./capabilities.routes.js";
export type { CapabilitiesRoutesDependencies } from "./capabilities.routes.js";
export { createGroupsRoutes } from "./groups.routes.js";
export type { GroupsRoutesDependencies } from "./groups.routes.js";
export { createOusRoutes } from "./ous.routes.js";
export type { OusRoutesDependencies } from "./ous.routes.js";
export { createPrincipalsRoutes } from "./principals.routes.js";
export type { PrincipalsRoutesDependencies } from "./principals.routes.js";
export { createRoleBindingsRoutes } from "./role-bindings.routes.js";
export type { RoleBindingsRoutesDependencies } from "./role-bindings.routes.js";
export { createRolesRoutes } from "./roles.routes.js";
export type { RolesRoutesDependencies } from "./roles.routes.js";

// ============================================================================
// Combined IAM Routes
// ============================================================================

export interface IamRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
  getPrincipalId: (req: Request) => string;
}

/**
 * Register all IAM routes on a router
 *
 * This creates a combined IAM API under a single prefix.
 * Routes will be available at:
 * - /principals
 * - /groups
 * - /roles
 * - /role-bindings
 * - /ous
 * - /capabilities
 * - /mfa
 */
export function registerIamRoutes(
  router: Router,
  deps: IamRoutesDependencies
): Router {
  const { db, logger, getTenantId, getPrincipalId } = deps;

  // Initialize persona capability service
  const capabilityRepository = new DatabasePersonaCapabilityRepository(db);
  const capabilityService = new PersonaCapabilityService(capabilityRepository, logger);

  // Initialize MFA service
  const mfaService = new MfaService(db, logger);

  // Register all route handlers
  createPrincipalsRoutes(router, { db, logger, getTenantId });
  createGroupsRoutes(router, { db, logger, getTenantId });
  createRolesRoutes(router, { db, logger, getTenantId });
  createRoleBindingsRoutes(router, { db, logger, getTenantId });
  createOusRoutes(router, { db, logger, getTenantId });
  createCapabilitiesRoutes(router, { capabilityService, logger });
  createMfaRoutes(router, { mfaService, logger, getTenantId, getPrincipalId });

  return router;
}

// ============================================================================
// Route Metadata (for documentation/OpenAPI)
// ============================================================================

export const IAM_ROUTES_METADATA = {
  prefix: "/api/iam",
  description: "Identity and Access Management API",
  groups: [
    {
      name: "Principals",
      prefix: "/principals",
      description: "Manage principals (users, services, external identities)",
      endpoints: [
        { method: "GET", path: "/principals", description: "List principals" },
        { method: "GET", path: "/principals/:id", description: "Get principal by ID" },
        { method: "GET", path: "/principals/:id/entitlements", description: "Get effective entitlements" },
        { method: "GET", path: "/principals/:id/roles", description: "Get role bindings" },
        { method: "GET", path: "/principals/:id/groups", description: "Get group memberships" },
        { method: "POST", path: "/principals/:id/attributes", description: "Set ABAC attributes" },
      ],
    },
    {
      name: "Groups",
      prefix: "/groups",
      description: "Manage groups and group memberships",
      endpoints: [
        { method: "GET", path: "/groups", description: "List groups" },
        { method: "POST", path: "/groups", description: "Create local group" },
        { method: "GET", path: "/groups/:id", description: "Get group" },
        { method: "PATCH", path: "/groups/:id", description: "Update group" },
        { method: "DELETE", path: "/groups/:id", description: "Delete group" },
        { method: "GET", path: "/groups/:id/members", description: "List members" },
        { method: "POST", path: "/groups/:id/members", description: "Add member" },
        { method: "DELETE", path: "/groups/:id/members/:principalId", description: "Remove member" },
      ],
    },
    {
      name: "Roles",
      prefix: "/roles",
      description: "Manage roles (system personas and custom roles)",
      endpoints: [
        { method: "GET", path: "/roles", description: "List roles" },
        { method: "POST", path: "/roles", description: "Create custom role" },
        { method: "GET", path: "/roles/:id", description: "Get role" },
        { method: "PATCH", path: "/roles/:id", description: "Update role" },
        { method: "DELETE", path: "/roles/:id", description: "Delete role" },
        { method: "GET", path: "/roles/:id/capabilities", description: "Get role capabilities" },
      ],
    },
    {
      name: "Role Bindings",
      prefix: "/role-bindings",
      description: "Manage role assignments to principals",
      endpoints: [
        { method: "GET", path: "/role-bindings", description: "List bindings" },
        { method: "POST", path: "/role-bindings", description: "Create binding" },
        { method: "GET", path: "/role-bindings/:id", description: "Get binding" },
        { method: "DELETE", path: "/role-bindings/:id", description: "Remove binding" },
        { method: "POST", path: "/role-bindings/:id/extend", description: "Extend validity" },
        { method: "POST", path: "/role-bindings/:id/revoke", description: "Revoke binding" },
      ],
    },
    {
      name: "Organization Units",
      prefix: "/ous",
      description: "Manage OU hierarchy",
      endpoints: [
        { method: "GET", path: "/ous", description: "Get OU tree" },
        { method: "POST", path: "/ous", description: "Create OU node" },
        { method: "GET", path: "/ous/:id", description: "Get OU node" },
        { method: "PATCH", path: "/ous/:id", description: "Update OU node" },
        { method: "POST", path: "/ous/:id/move", description: "Move OU node" },
        { method: "DELETE", path: "/ous/:id", description: "Delete OU node" },
        { method: "GET", path: "/ous/:id/members", description: "List OU members" },
        { method: "POST", path: "/ous/:id/members", description: "Assign member to OU" },
        { method: "DELETE", path: "/ous/:id/members/:principalId", description: "Remove member from OU" },
      ],
    },
    {
      name: "Capabilities",
      prefix: "/capabilities",
      description: "View capability matrix and check permissions",
      endpoints: [
        { method: "GET", path: "/capabilities/matrix", description: "Get full capability matrix" },
        { method: "GET", path: "/capabilities/personas", description: "List personas" },
        { method: "GET", path: "/capabilities/operations", description: "List operations" },
        { method: "GET", path: "/capabilities/check", description: "Check capability" },
        { method: "GET", path: "/capabilities/persona/:code", description: "Get persona capabilities" },
        { method: "GET", path: "/capabilities/operation/:code/personas", description: "Get personas with operation" },
      ],
    },
    {
      name: "MFA",
      prefix: "/mfa",
      description: "Multi-Factor Authentication management",
      endpoints: [
        { method: "GET", path: "/mfa/status", description: "Get MFA status" },
        { method: "GET", path: "/mfa/required", description: "Check if MFA required" },
        { method: "POST", path: "/mfa/enroll", description: "Start MFA enrollment" },
        { method: "POST", path: "/mfa/enroll/verify", description: "Verify enrollment" },
        { method: "DELETE", path: "/mfa/enroll", description: "Cancel enrollment" },
        { method: "POST", path: "/mfa/challenge", description: "Create MFA challenge" },
        { method: "POST", path: "/mfa/verify", description: "Verify MFA challenge" },
        { method: "DELETE", path: "/mfa", description: "Disable MFA" },
        { method: "POST", path: "/mfa/backup-codes/regenerate", description: "Regenerate backup codes" },
        { method: "GET", path: "/mfa/devices", description: "List trusted devices" },
        { method: "DELETE", path: "/mfa/devices/:deviceId", description: "Revoke device" },
        { method: "DELETE", path: "/mfa/devices", description: "Revoke all devices" },
        { method: "POST", path: "/mfa/devices/check", description: "Check if device trusted" },
      ],
    },
  ],
};
