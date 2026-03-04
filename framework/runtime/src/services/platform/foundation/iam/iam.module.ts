/**
 * IAM (Identity & Access Management) — Module Composition Root
 *
 * Registers IAM services, handlers, and routes into the DI container.
 * Follows the RuntimeModule pattern (register + contribute).
 *
 * Services provided:
 * - PersonaCapabilityService: user → persona(s), capability matrix evaluation
 * - MfaService: multi-factor authentication (TOTP, backup codes, trusted devices)
 * - SessionInvalidationService: destroy sessions on IAM changes
 * - TenantIAMProfile: per-tenant security profile (password policy, MFA requirements)
 */

import { TOKENS } from "../../../../kernel/tokens.js";
import { createPolicyGate } from "../../policy-rules/policy-gate.service.js";
import { DatabaseFieldSecurityRepository, FieldAccessService, MaskingService, FieldProjectionBuilder } from "../security/field-security/index.js";

import { ListPlatformTenantsHandler } from "./api/platform-tenants.handler.js";
import { MfaService } from "./mfa/mfa.service.js";
import { DatabasePersonaCapabilityRepository } from "./persona-model/persona-capability.repository.js";
import { PersonaCapabilityService } from "./persona-model/persona-capability.service.js";
import { PersonaRegistryService } from "./persona-model/persona-registry.service.js";
import { SessionInvalidationService } from "./session-invalidation.js";
import { loadTenantIAMProfile, validateTenantIAMProfile } from "./tenant-iam-profile.js";

import type { TenantIAMProfile } from "./tenant-iam-profile.js";
import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Container } from "../../../../kernel/container.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { RuntimeModule } from "../../../types.js";
import type { RouteHandler, HttpHandlerContext } from "../http/types.js";
import type { RouteRegistry } from "../registries/routes.registry.js";
import type { IPersonaCapabilityService } from "./persona-model/persona-capability.service.js";
import type { DB } from "@athyper/adapter-db";
import type { Request, Response } from "express";
import type { Kysely } from "kysely";


// ============================================================================
// Handler Tokens (internal to this module)
// ============================================================================

const IAM_HANDLER_TOKENS = {
    // Principals
    listPrincipals: "iam.handler.listPrincipals",
    getPrincipal: "iam.handler.getPrincipal",
    getPrincipalEntitlements: "iam.handler.getPrincipalEntitlements",
    getPrincipalRoles: "iam.handler.getPrincipalRoles",
    getPrincipalGroups: "iam.handler.getPrincipalGroups",
    // Groups
    listGroups: "iam.handler.listGroups",
    createGroup: "iam.handler.createGroup",
    getGroup: "iam.handler.getGroup",
    updateGroup: "iam.handler.updateGroup",
    deleteGroup: "iam.handler.deleteGroup",
    listGroupMembers: "iam.handler.listGroupMembers",
    addGroupMember: "iam.handler.addGroupMember",
    removeGroupMember: "iam.handler.removeGroupMember",
    // Roles
    listRoles: "iam.handler.listRoles",
    createRole: "iam.handler.createRole",
    getRole: "iam.handler.getRole",
    updateRole: "iam.handler.updateRole",
    deleteRole: "iam.handler.deleteRole",
    // Role Bindings
    listRoleBindings: "iam.handler.listRoleBindings",
    createRoleBinding: "iam.handler.createRoleBinding",
    getRoleBinding: "iam.handler.getRoleBinding",
    deleteRoleBinding: "iam.handler.deleteRoleBinding",
    // OUs
    getOuTree: "iam.handler.getOuTree",
    createOu: "iam.handler.createOu",
    getOu: "iam.handler.getOu",
    updateOu: "iam.handler.updateOu",
    deleteOu: "iam.handler.deleteOu",
    // Capabilities
    capabilityMatrix: "iam.handler.capabilityMatrix",
    listPersonas: "iam.handler.listPersonas",
    checkCapability: "iam.handler.checkCapability",
    getPersonaCapabilities: "iam.handler.getPersonaCapabilities",
    // MFA
    mfaStatus: "iam.handler.mfaStatus",
    mfaRequired: "iam.handler.mfaRequired",
    mfaEnroll: "iam.handler.mfaEnroll",
    mfaEnrollVerify: "iam.handler.mfaEnrollVerify",
    mfaCancelEnroll: "iam.handler.mfaCancelEnroll",
    mfaChallenge: "iam.handler.mfaChallenge",
    mfaVerify: "iam.handler.mfaVerify",
    mfaDisable: "iam.handler.mfaDisable",
    mfaBackupCodes: "iam.handler.mfaBackupCodes",
    mfaDevices: "iam.handler.mfaDevices",
    mfaRevokeDevice: "iam.handler.mfaRevokeDevice",
    mfaRevokeAllDevices: "iam.handler.mfaRevokeAllDevices",
    mfaCheckDevice: "iam.handler.mfaCheckDevice",
    // Field Security Policies
    listFieldPolicies: "iam.handler.listFieldPolicies",
    createFieldPolicy: "iam.handler.createFieldPolicy",
    getFieldPolicy: "iam.handler.getFieldPolicy",
    updateFieldPolicy: "iam.handler.updateFieldPolicy",
    deleteFieldPolicy: "iam.handler.deleteFieldPolicy",
    // Platform Control
    listPlatformTenants: "iam.handler.listPlatformTenants",
} as const;

// ============================================================================
// Handler Implementations
// ============================================================================

class ListPrincipalsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        let qb = db.selectFrom("core.principal as p")
            .select(["p.id", "p.external_id", "p.principal_type", "p.display_name", "p.email", "p.is_active", "p.created_at"])
            .where("p.tenant_id", "=", tenantId)
            .orderBy("p.created_at", "desc")
            .limit(limit)
            .offset(offset);

        if (req.query.type) {
            qb = qb.where("p.principal_type", "=", req.query.type as string);
        }
        if (req.query.search) {
            const search = `%${req.query.search}%`;
            qb = qb.where((eb) =>
                eb.or([
                    eb("p.display_name", "ilike", search),
                    eb("p.email", "ilike", search),
                ]),
            );
        }

        const principals = await qb.execute();
        res.status(200).json({ success: true, data: principals });
    }
}

class GetPrincipalHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const principal = await db.selectFrom("core.principal")
            .selectAll()
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!principal) {
            res.status(404).json({ success: false, error: "Principal not found" });
            return;
        }
        res.status(200).json({ success: true, data: principal });
    }
}

class GetPrincipalEntitlementsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const capService = await ctx.container.resolve<IPersonaCapabilityService>(TOKENS.iamCapabilityService);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const principalId = req.params.id;

        // Get roles
        const roles = await db.selectFrom("core.principal_role")
            .innerJoin("core.role", "core.role.id", "core.principal_role.role_id")
            .select([
                "core.role.id", "core.role.name", "core.role.code",
                "core.principal_role.assigned_at", "core.principal_role.expires_at",
            ])
            .where("core.principal_role.principal_id", "=", principalId)
            .where("core.principal_role.tenant_id", "=", tenantId)
            .execute();

        // Get groups
        const groups = await db.selectFrom("core.group_member")
            .innerJoin("core.principal_group", "core.principal_group.id", "core.group_member.group_id")
            .select(["core.principal_group.id", "core.principal_group.name", "core.principal_group.code"])
            .where("core.group_member.principal_id", "=", principalId)
            .where("core.principal_group.tenant_id", "=", tenantId)
            .execute();

        // Resolve effective persona from roles
        const roleCodes = roles.map((r) => r.code);
        const effectivePersona = await capService.resolveEffectivePersona(roleCodes);

        res.status(200).json({
            success: true,
            data: { principalId, roles, groups, effectivePersona },
        });
    }
}

class GetPrincipalRolesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const roles = await db.selectFrom("core.principal_role")
            .innerJoin("core.role", "core.role.id", "core.principal_role.role_id")
            .select([
                "core.role.id", "core.role.name", "core.role.code",
                "core.principal_role.assigned_at", "core.principal_role.expires_at",
            ])
            .where("core.principal_role.principal_id", "=", req.params.id)
            .where("core.principal_role.tenant_id", "=", tenantId)
            .execute();

        res.status(200).json({ success: true, data: roles });
    }
}

class GetPrincipalGroupsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const groups = await db.selectFrom("core.group_member")
            .innerJoin("core.principal_group", "core.principal_group.id", "core.group_member.group_id")
            .select([
                "core.principal_group.id", "core.principal_group.name",
                "core.principal_group.code", "core.group_member.joined_at",
            ])
            .where("core.group_member.principal_id", "=", req.params.id)
            .where("core.principal_group.tenant_id", "=", tenantId)
            .execute();

        res.status(200).json({ success: true, data: groups });
    }
}

class CapabilityMatrixHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const capService = await ctx.container.resolve<IPersonaCapabilityService>(TOKENS.iamCapabilityService);
        const rows = await capService.getCapabilityMatrixRows();
        res.status(200).json({ success: true, data: rows });
    }
}

class ListPersonasHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const personas = await db.selectFrom("core.persona")
            .selectAll()
            .orderBy("priority", "asc")
            .execute();
        res.status(200).json({ success: true, data: personas });
    }
}

class CheckCapabilityHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const capService = await ctx.container.resolve<IPersonaCapabilityService>(TOKENS.iamCapabilityService);
        const persona = req.query.persona as string;
        const operation = req.query.operation as string;

        if (!persona || !operation) {
            res.status(400).json({ success: false, error: "persona and operation query params required" });
            return;
        }

        const result = await capService.hasCapability(persona as any, operation);
        res.status(200).json({ success: true, data: result });
    }
}

class GetPersonaCapabilitiesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const capService = await ctx.container.resolve<IPersonaCapabilityService>(TOKENS.iamCapabilityService);
        const capabilities = await capService.getPersonaCapabilities(req.params.code as any);
        res.status(200).json({ success: true, data: capabilities });
    }
}

// Stub handler for admin CRUD routes — returns 501 until full handler extraction
class StubHandler implements RouteHandler {
    constructor(private description: string) {}
    async handle(_req: Request, res: Response, _ctx: HttpHandlerContext): Promise<void> {
        res.status(501).json({ success: false, error: `Not implemented: ${this.description}` });
    }
}

class MfaStatusHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const status = await mfaService.getStatus(principalId, tenantId);
        res.status(200).json({ success: true, data: status });
    }
}

class MfaRequiredHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.isRequired(principalId, tenantId);
        res.status(200).json({ success: true, data: result });
    }
}

class MfaEnrollHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const method = req.body?.method ?? "totp";
        const result = await mfaService.startEnrollment(principalId, tenantId, method);
        res.status(200).json({ success: true, data: result });
    }
}

class MfaEnrollVerifyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.verifyEnrollment({
            principalId,
            tenantId,
            code: req.body?.code ?? "",
            ipAddress: ctx.request.ip,
            userAgent: ctx.request.userAgent,
        });
        res.status(200).json({ success: true, data: result });
    }
}

class MfaDevicesHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const devices = await mfaService.getTrustedDevices(principalId, tenantId);
        res.status(200).json({ success: true, data: devices });
    }
}

class MfaCancelEnrollHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        await mfaService.cancelEnrollment(principalId, tenantId);
        res.status(200).json({ success: true, data: { cancelled: true } });
    }
}

class MfaChallengeHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.createChallenge({
            principalId,
            tenantId,
        });
        res.status(200).json({ success: true, data: result });
    }
}

class MfaVerifyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.verifyChallenge(
            {
                code: req.body?.code ?? "",
                challengeToken: req.body?.challengeToken,
                rememberDevice: req.body?.trustDevice ?? false,
                deviceName: req.body?.deviceName,
            },
            {
                principalId,
                tenantId,
                ipAddress: ctx.request.ip,
                userAgent: ctx.request.userAgent,
            }
        );
        res.status(200).json({ success: true, data: result });
    }
}

class MfaDisableHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.disable(principalId, tenantId, req.body?.code ?? "");
        res.status(200).json({ success: true, data: result });
    }
}

class MfaBackupCodesRegenerateHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const result = await mfaService.regenerateBackupCodes(principalId, tenantId);
        res.status(200).json({ success: true, data: result });
    }
}

class MfaRevokeDeviceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const deviceId = req.params?.deviceId ?? "";
        await mfaService.revokeDevice(principalId, tenantId, deviceId);
        res.status(200).json({ success: true, data: { revoked: true, deviceId } });
    }
}

class MfaRevokeAllDevicesHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        await mfaService.revokeAllDevices(principalId, tenantId);
        res.status(200).json({ success: true, data: { revokedAll: true } });
    }
}

class MfaCheckDeviceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const mfaService = await ctx.container.resolve<MfaService>(TOKENS.iamMfaService);
        const principalId = ctx.auth.userId ?? ctx.auth.subject ?? "";
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const trustToken = req.body?.trustToken ?? "";
        const trusted = await mfaService.isTrustedDevice(principalId, tenantId, trustToken);
        res.status(200).json({ success: true, data: { trusted } });
    }
}

// ── Group Handlers ────────────────────────────────────────────────────

class ListGroupsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        let qb = db.selectFrom("core.principal_group")
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .orderBy("name", "asc")
            .limit(limit)
            .offset(offset);

        if (req.query.search) {
            const search = `%${req.query.search}%`;
            qb = qb.where((eb) => eb.or([eb("name", "ilike", search), eb("code", "ilike", search)]));
        }

        const groups = await qb.execute();
        res.status(200).json({ success: true, data: groups });
    }
}

class CreateGroupHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; code?: string; description?: string; metadata?: Record<string, unknown> };

        if (!body.name || !body.code) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "name and code are required" } });
            return;
        }

        const now = new Date();
        const group = await db.insertInto("core.principal_group")
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                name: body.name,
                code: body.code,
                description: body.description ?? null,
                metadata: body.metadata ? JSON.stringify(body.metadata) : null,
                created_at: now,
                created_by: userId,
                updated_at: now,
                updated_by: userId,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        res.status(201).json({ success: true, data: group });
    }
}

class GetGroupHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const group = await db.selectFrom("core.principal_group")
            .selectAll()
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!group) {
            res.status(404).json({ success: false, error: "Group not found" });
            return;
        }
        res.status(200).json({ success: true, data: group });
    }
}

class UpdateGroupHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; description?: string; metadata?: Record<string, unknown> };

        const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);

        const group = await db.updateTable("core.principal_group")
            .set(updates)
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!group) {
            res.status(404).json({ success: false, error: "Group not found" });
            return;
        }
        res.status(200).json({ success: true, data: group });
    }
}

class DeleteGroupHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        // Remove members first, then group
        await db.deleteFrom("core.group_member")
            .where("group_id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .execute();

        const result = await db.deleteFrom("core.principal_group")
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Group not found" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

class ListGroupMembersHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const members = await db.selectFrom("core.group_member as gm")
            .innerJoin("core.principal as p", "p.id", "gm.principal_id")
            .select(["p.id", "p.display_name", "p.email", "p.principal_type", "gm.joined_at"])
            .where("gm.group_id", "=", req.params.id)
            .where("gm.tenant_id", "=", tenantId)
            .execute();

        res.status(200).json({ success: true, data: members });
    }
}

class AddGroupMemberHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const body = req.body as { principalId?: string };

        if (!body.principalId) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "principalId is required" } });
            return;
        }

        try {
            await db.insertInto("core.group_member")
                .values({
                    id: crypto.randomUUID(),
                    tenant_id: tenantId,
                    group_id: req.params.id,
                    principal_id: body.principalId,
                })
                .execute();

            res.status(201).json({ success: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("duplicate") || message.includes("unique")) {
                res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "Member already in group" } });
            } else {
                throw err;
            }
        }
    }
}

class RemoveGroupMemberHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const result = await db.deleteFrom("core.group_member")
            .where("group_id", "=", req.params.id)
            .where("principal_id", "=", req.params.principalId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Member not found in group" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

// ── Role Handlers ─────────────────────────────────────────────────────

class ListRolesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        let qb = db.selectFrom("core.role")
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .orderBy("name", "asc")
            .limit(limit)
            .offset(offset);

        if (req.query.category) {
            qb = qb.where("category", "=", req.query.category as string);
        }

        const roles = await qb.execute();
        res.status(200).json({ success: true, data: roles });
    }
}

class CreateRoleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; code?: string; description?: string; category?: string; metadata?: Record<string, unknown> };

        if (!body.name || !body.code) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "name and code are required" } });
            return;
        }

        const now = new Date();
        const role = await db.insertInto("core.role")
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                name: body.name,
                code: body.code,
                description: body.description ?? null,
                category: body.category ?? null,
                metadata: body.metadata ? JSON.stringify(body.metadata) : null,
                created_at: now,
                created_by: userId,
                updated_at: now,
                updated_by: userId,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        res.status(201).json({ success: true, data: role });
    }
}

class GetRoleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const role = await db.selectFrom("core.role")
            .selectAll()
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!role) {
            res.status(404).json({ success: false, error: "Role not found" });
            return;
        }
        res.status(200).json({ success: true, data: role });
    }
}

class UpdateRoleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; description?: string; category?: string; metadata?: Record<string, unknown> };

        const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.category !== undefined) updates.category = body.category;
        if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);

        const role = await db.updateTable("core.role")
            .set(updates)
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!role) {
            res.status(404).json({ success: false, error: "Role not found" });
            return;
        }
        res.status(200).json({ success: true, data: role });
    }
}

class DeleteRoleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        // Remove role bindings first
        await db.deleteFrom("core.principal_role")
            .where("role_id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .execute();

        const result = await db.deleteFrom("core.role")
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Role not found" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

// ── Role Binding Handlers ─────────────────────────────────────────────

class ListRoleBindingsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        let qb = db.selectFrom("core.principal_role as pr")
            .innerJoin("core.role as r", "r.id", "pr.role_id")
            .innerJoin("core.principal as p", "p.id", "pr.principal_id")
            .select([
                "pr.id", "pr.principal_id", "pr.role_id",
                "pr.assigned_at", "pr.assigned_by", "pr.expires_at",
                "r.name as role_name", "r.code as role_code",
                "p.display_name as principal_name", "p.email as principal_email",
            ])
            .where("pr.tenant_id", "=", tenantId)
            .orderBy("pr.assigned_at", "desc")
            .limit(limit)
            .offset(offset);

        if (req.query.principalId) {
            qb = qb.where("pr.principal_id", "=", req.query.principalId as string);
        }
        if (req.query.roleId) {
            qb = qb.where("pr.role_id", "=", req.query.roleId as string);
        }

        const bindings = await qb.execute();
        res.status(200).json({ success: true, data: bindings });
    }
}

class CreateRoleBindingHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const assignedBy = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { principalId?: string; roleId?: string; expiresAt?: string };

        if (!body.principalId || !body.roleId) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "principalId and roleId are required" } });
            return;
        }

        const binding = await db.insertInto("core.principal_role")
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                principal_id: body.principalId,
                role_id: body.roleId,
                assigned_at: new Date(),
                assigned_by: assignedBy,
                expires_at: body.expiresAt ? new Date(body.expiresAt) : null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        res.status(201).json({ success: true, data: binding });
    }
}

class GetRoleBindingHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const binding = await db.selectFrom("core.principal_role as pr")
            .innerJoin("core.role as r", "r.id", "pr.role_id")
            .select([
                "pr.id", "pr.principal_id", "pr.role_id",
                "pr.assigned_at", "pr.assigned_by", "pr.expires_at",
                "r.name as role_name", "r.code as role_code",
            ])
            .where("pr.id", "=", req.params.id)
            .where("pr.tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!binding) {
            res.status(404).json({ success: false, error: "Role binding not found" });
            return;
        }
        res.status(200).json({ success: true, data: binding });
    }
}

class DeleteRoleBindingHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const result = await db.deleteFrom("core.principal_role")
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Role binding not found" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

// ── Organization Unit Handlers ────────────────────────────────────────

class GetOuTreeHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const ous = await db.selectFrom("core.organizational_unit")
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .orderBy("name", "asc")
            .execute();

        res.status(200).json({ success: true, data: ous });
    }
}

class CreateOuHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; code?: string; description?: string; parentId?: string; metadata?: Record<string, unknown> };

        if (!body.name || !body.code) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "name and code are required" } });
            return;
        }

        if (body.parentId) {
            const parent = await db.selectFrom("core.organizational_unit")
                .select("id")
                .where("id", "=", body.parentId)
                .where("tenant_id", "=", tenantId)
                .executeTakeFirst();
            if (!parent) {
                res.status(400).json({ success: false, error: { code: "INVALID_PARENT", message: "Parent OU not found" } });
                return;
            }
        }

        const now = new Date();
        const ou = await db.insertInto("core.organizational_unit")
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                name: body.name,
                code: body.code,
                description: body.description ?? null,
                parent_id: body.parentId ?? null,
                metadata: body.metadata ? JSON.stringify(body.metadata) : null,
                created_at: now,
                created_by: userId,
                updated_at: now,
                updated_by: userId,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        res.status(201).json({ success: true, data: ou });
    }
}

class GetOuHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const ou = await db.selectFrom("core.organizational_unit")
            .selectAll()
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!ou) {
            res.status(404).json({ success: false, error: "Organization unit not found" });
            return;
        }
        res.status(200).json({ success: true, data: ou });
    }
}

class UpdateOuHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as { name?: string; code?: string; description?: string; parentId?: string; metadata?: Record<string, unknown> };

        if (body.parentId) {
            if (body.parentId === req.params.id) {
                res.status(400).json({ success: false, error: { code: "CIRCULAR_REF", message: "OU cannot be its own parent" } });
                return;
            }
            const parent = await db.selectFrom("core.organizational_unit")
                .select("id")
                .where("id", "=", body.parentId)
                .where("tenant_id", "=", tenantId)
                .executeTakeFirst();
            if (!parent) {
                res.status(400).json({ success: false, error: { code: "INVALID_PARENT", message: "Parent OU not found" } });
                return;
            }
        }

        const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
        if (body.name !== undefined) updates.name = body.name;
        if (body.code !== undefined) updates.code = body.code;
        if (body.description !== undefined) updates.description = body.description;
        if (body.parentId !== undefined) updates.parent_id = body.parentId;
        if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);

        const ou = await db.updateTable("core.organizational_unit")
            .set(updates)
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!ou) {
            res.status(404).json({ success: false, error: "Organization unit not found" });
            return;
        }
        res.status(200).json({ success: true, data: ou });
    }
}

class DeleteOuHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const children = await db.selectFrom("core.organizational_unit")
            .select("id")
            .where("parent_id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (children) {
            res.status(400).json({ success: false, error: { code: "HAS_CHILDREN", message: "Cannot delete OU with children. Move or delete children first." } });
            return;
        }

        const result = await db.deleteFrom("core.organizational_unit")
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Organization unit not found" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

// ── Field Security Policy Handlers ────────────────────────────────────

class ListFieldPoliciesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        let qb = db.selectFrom("meta.field_security_policy")
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .orderBy("entity_id", "asc")
            .orderBy("priority", "asc")
            .limit(limit)
            .offset(offset);

        if (req.query.entityId) {
            qb = qb.where("entity_id", "=", req.query.entityId as string);
        }
        if (req.query.isActive !== undefined) {
            qb = qb.where("is_active", "=", req.query.isActive === "true");
        }

        const policies = await qb.execute();
        res.status(200).json({ success: true, data: policies });
    }
}

class CreateFieldPolicyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as {
            entityId?: string; fieldPath?: string; policyType?: string;
            roleList?: string[]; abacCondition?: Record<string, unknown>;
            maskStrategy?: string; maskConfig?: Record<string, unknown>;
            scope?: string; scopeRef?: string; priority?: number;
            isActive?: boolean; metadata?: Record<string, unknown>;
        };

        if (!body.entityId || !body.fieldPath || !body.policyType) {
            res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "entityId, fieldPath, and policyType are required" } });
            return;
        }

        const now = new Date();
        const policy = await db.insertInto("meta.field_security_policy")
            .values({
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                entity_id: body.entityId,
                field_path: body.fieldPath,
                policy_type: body.policyType,
                role_list: body.roleList ?? [],
                abac_condition: body.abacCondition ? JSON.stringify(body.abacCondition) : null,
                mask_strategy: body.maskStrategy ?? null,
                mask_config: body.maskConfig ? JSON.stringify(body.maskConfig) : null,
                scope: body.scope ?? "tenant",
                scope_ref: body.scopeRef ?? null,
                priority: body.priority ?? 100,
                is_active: body.isActive ?? true,
                metadata: body.metadata ? JSON.stringify(body.metadata) : null,
                created_at: now,
                created_by: userId,
                updated_at: now,
                updated_by: userId,
                version: 1,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        res.status(201).json({ success: true, data: policy });
    }
}

class GetFieldPolicyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const policy = await db.selectFrom("meta.field_security_policy")
            .selectAll()
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!policy) {
            res.status(404).json({ success: false, error: "Field policy not found" });
            return;
        }
        res.status(200).json({ success: true, data: policy });
    }
}

class UpdateFieldPolicyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
        const body = req.body as {
            roleList?: string[]; abacCondition?: Record<string, unknown>;
            maskStrategy?: string; maskConfig?: Record<string, unknown>;
            priority?: number; isActive?: boolean; metadata?: Record<string, unknown>;
        };

        const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
        if (body.roleList !== undefined) updates.role_list = JSON.stringify(body.roleList);
        if (body.abacCondition !== undefined) updates.abac_condition = JSON.stringify(body.abacCondition);
        if (body.maskStrategy !== undefined) updates.mask_strategy = body.maskStrategy;
        if (body.maskConfig !== undefined) updates.mask_config = JSON.stringify(body.maskConfig);
        if (body.priority !== undefined) updates.priority = body.priority;
        if (body.isActive !== undefined) updates.is_active = body.isActive;
        if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);

        const policy = await db.updateTable("meta.field_security_policy")
            .set(updates)
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .returningAll()
            .executeTakeFirst();

        if (!policy) {
            res.status(404).json({ success: false, error: "Field policy not found" });
            return;
        }
        res.status(200).json({ success: true, data: policy });
    }
}

class DeleteFieldPolicyHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const db = await ctx.container.resolve<Kysely<DB>>(TOKENS.db);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const result = await db.deleteFrom("meta.field_security_policy")
            .where("id", "=", req.params.id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

        if (!result.numDeletedRows || result.numDeletedRows === 0n) {
            res.status(404).json({ success: false, error: "Field policy not found" });
            return;
        }
        res.status(200).json({ success: true });
    }
}

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
    name: "platform.foundation.iam",

    async register(c: Container) {
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);

        logger.info("[iam] Registering IAM module");

        // ── Persona Registry (DB-driven priorities) ────────────────────
        c.register(TOKENS.iamPersonaRegistry, async () => {
            const repo = new DatabasePersonaCapabilityRepository(db);
            return new PersonaRegistryService(repo, logger);
        }, "singleton");

        // ── Persona Capability Service ─────────────────────────────────
        c.register(TOKENS.iamCapabilityService, async () => {
            const repo = new DatabasePersonaCapabilityRepository(db);
            const registry = await c.resolve<PersonaRegistryService>(TOKENS.iamPersonaRegistry);
            return new PersonaCapabilityService(repo, logger, { registry });
        }, "singleton");

        // ── MFA Service ────────────────────────────────────────────────
        c.register(TOKENS.iamMfaService, async () => {
            return new MfaService(db, logger);
        }, "singleton");

        // ── Session Invalidation Service ───────────────────────────────
        c.register(TOKENS.iamSessionInvalidation, async () => {
            const auditWriter = await c.resolve<AuditWriter>(TOKENS.auditWriter);

            // RedisSessionStore may not be in DI (only present in BFF deployments)
            let sessionStore: any;
            try {
                sessionStore = await c.resolve<any>("security.sessionStore");
            } catch {
                // Stub for non-BFF deployments — session invalidation is a no-op
                sessionStore = {
                    destroyAllForUser: async () => 0,
                };
            }

            return new SessionInvalidationService(sessionStore, auditWriter);
        }, "singleton");

        // ── Tenant IAM Profile Service ─────────────────────────────────
        c.register(TOKENS.iamTenantProfile, async () => {
            return {
                load: (tenantId: string) => loadTenantIAMProfile(db as any, tenantId),
                validate: validateTenantIAMProfile,
            } satisfies { load: (tenantId: string) => Promise<TenantIAMProfile>; validate: (profile: TenantIAMProfile) => void };
        }, "singleton");

        // ── Security Services (RBAC + Field-Level Security) ────────────
        c.register(TOKENS.policyGate, async () => createPolicyGate(db), "singleton");
        c.register(TOKENS.fieldSecurityRepo, async () => new DatabaseFieldSecurityRepository(db), "singleton");
        c.register(TOKENS.fieldAccessService, async () => {
            const repo = await c.resolve<any>(TOKENS.fieldSecurityRepo);
            return new FieldAccessService(repo, new MaskingService(), logger);
        }, "singleton");
        c.register(TOKENS.fieldProjectionBuilder, async () => {
            const fas = await c.resolve<FieldAccessService>(TOKENS.fieldAccessService);
            return new FieldProjectionBuilder(fas, logger);
        }, "singleton");

        // ── HTTP Handlers ──────────────────────────────────────────────

        // Principals
        c.register(IAM_HANDLER_TOKENS.listPrincipals, async () => new ListPrincipalsHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getPrincipal, async () => new GetPrincipalHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getPrincipalEntitlements, async () => new GetPrincipalEntitlementsHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getPrincipalRoles, async () => new GetPrincipalRolesHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getPrincipalGroups, async () => new GetPrincipalGroupsHandler(), "singleton");

        // Capabilities
        c.register(IAM_HANDLER_TOKENS.capabilityMatrix, async () => new CapabilityMatrixHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.listPersonas, async () => new ListPersonasHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.checkCapability, async () => new CheckCapabilityHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getPersonaCapabilities, async () => new GetPersonaCapabilitiesHandler(), "singleton");

        // MFA
        c.register(IAM_HANDLER_TOKENS.mfaStatus, async () => new MfaStatusHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaRequired, async () => new MfaRequiredHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaEnroll, async () => new MfaEnrollHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaEnrollVerify, async () => new MfaEnrollVerifyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaDevices, async () => new MfaDevicesHandler(), "singleton");

        // Groups
        c.register(IAM_HANDLER_TOKENS.listGroups, async () => new ListGroupsHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.createGroup, async () => new CreateGroupHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getGroup, async () => new GetGroupHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.updateGroup, async () => new UpdateGroupHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.deleteGroup, async () => new DeleteGroupHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.listGroupMembers, async () => new ListGroupMembersHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.addGroupMember, async () => new AddGroupMemberHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.removeGroupMember, async () => new RemoveGroupMemberHandler(), "singleton");

        // Roles
        c.register(IAM_HANDLER_TOKENS.listRoles, async () => new ListRolesHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.createRole, async () => new CreateRoleHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getRole, async () => new GetRoleHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.updateRole, async () => new UpdateRoleHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.deleteRole, async () => new DeleteRoleHandler(), "singleton");

        // Role Bindings
        c.register(IAM_HANDLER_TOKENS.listRoleBindings, async () => new ListRoleBindingsHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.createRoleBinding, async () => new CreateRoleBindingHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getRoleBinding, async () => new GetRoleBindingHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.deleteRoleBinding, async () => new DeleteRoleBindingHandler(), "singleton");

        // Organization Units
        c.register(IAM_HANDLER_TOKENS.getOuTree, async () => new GetOuTreeHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.createOu, async () => new CreateOuHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getOu, async () => new GetOuHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.updateOu, async () => new UpdateOuHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.deleteOu, async () => new DeleteOuHandler(), "singleton");

        // Field Security Policies
        c.register(IAM_HANDLER_TOKENS.listFieldPolicies, async () => new ListFieldPoliciesHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.createFieldPolicy, async () => new CreateFieldPolicyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.getFieldPolicy, async () => new GetFieldPolicyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.updateFieldPolicy, async () => new UpdateFieldPolicyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.deleteFieldPolicy, async () => new DeleteFieldPolicyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaCancelEnroll, async () => new MfaCancelEnrollHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaChallenge, async () => new MfaChallengeHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaVerify, async () => new MfaVerifyHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaDisable, async () => new MfaDisableHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaBackupCodes, async () => new MfaBackupCodesRegenerateHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaRevokeDevice, async () => new MfaRevokeDeviceHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaRevokeAllDevices, async () => new MfaRevokeAllDevicesHandler(), "singleton");
        c.register(IAM_HANDLER_TOKENS.mfaCheckDevice, async () => new MfaCheckDeviceHandler(), "singleton");

        // Platform Control
        c.register(IAM_HANDLER_TOKENS.listPlatformTenants, async () => new ListPlatformTenantsHandler(), "singleton");

        logger.info("[iam] IAM module registered");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        // ================================================================
        // Principals
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/principals", handlerToken: IAM_HANDLER_TOKENS.listPrincipals, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/principals/:id", handlerToken: IAM_HANDLER_TOKENS.getPrincipal, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/principals/:id/entitlements", handlerToken: IAM_HANDLER_TOKENS.getPrincipalEntitlements, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/principals/:id/roles", handlerToken: IAM_HANDLER_TOKENS.getPrincipalRoles, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/principals/:id/groups", handlerToken: IAM_HANDLER_TOKENS.getPrincipalGroups, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Groups
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/groups", handlerToken: IAM_HANDLER_TOKENS.listGroups, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/groups", handlerToken: IAM_HANDLER_TOKENS.createGroup, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/groups/:id", handlerToken: IAM_HANDLER_TOKENS.getGroup, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "PATCH", path: "/api/iam/groups/:id", handlerToken: IAM_HANDLER_TOKENS.updateGroup, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/groups/:id", handlerToken: IAM_HANDLER_TOKENS.deleteGroup, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/groups/:id/members", handlerToken: IAM_HANDLER_TOKENS.listGroupMembers, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/groups/:id/members", handlerToken: IAM_HANDLER_TOKENS.addGroupMember, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/groups/:id/members/:principalId", handlerToken: IAM_HANDLER_TOKENS.removeGroupMember, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Roles
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/roles", handlerToken: IAM_HANDLER_TOKENS.listRoles, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/roles", handlerToken: IAM_HANDLER_TOKENS.createRole, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/roles/:id", handlerToken: IAM_HANDLER_TOKENS.getRole, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "PATCH", path: "/api/iam/roles/:id", handlerToken: IAM_HANDLER_TOKENS.updateRole, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/roles/:id", handlerToken: IAM_HANDLER_TOKENS.deleteRole, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Role Bindings
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/role-bindings", handlerToken: IAM_HANDLER_TOKENS.listRoleBindings, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/role-bindings", handlerToken: IAM_HANDLER_TOKENS.createRoleBinding, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/role-bindings/:id", handlerToken: IAM_HANDLER_TOKENS.getRoleBinding, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/role-bindings/:id", handlerToken: IAM_HANDLER_TOKENS.deleteRoleBinding, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Organization Units
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/ous", handlerToken: IAM_HANDLER_TOKENS.getOuTree, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/ous", handlerToken: IAM_HANDLER_TOKENS.createOu, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/ous/:id", handlerToken: IAM_HANDLER_TOKENS.getOu, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "PATCH", path: "/api/iam/ous/:id", handlerToken: IAM_HANDLER_TOKENS.updateOu, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/ous/:id", handlerToken: IAM_HANDLER_TOKENS.deleteOu, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Field Security Policies
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/field-policies", handlerToken: IAM_HANDLER_TOKENS.listFieldPolicies, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "POST", path: "/api/iam/field-policies", handlerToken: IAM_HANDLER_TOKENS.createFieldPolicy, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "GET", path: "/api/iam/field-policies/:id", handlerToken: IAM_HANDLER_TOKENS.getFieldPolicy, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "PATCH", path: "/api/iam/field-policies/:id", handlerToken: IAM_HANDLER_TOKENS.updateFieldPolicy, authRequired: true, tags: ["iam", "admin"] });
        routes.add({ method: "DELETE", path: "/api/iam/field-policies/:id", handlerToken: IAM_HANDLER_TOKENS.deleteFieldPolicy, authRequired: true, tags: ["iam", "admin"] });

        // ================================================================
        // Capabilities
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/capabilities/matrix", handlerToken: IAM_HANDLER_TOKENS.capabilityMatrix, authRequired: true, tags: ["iam"] });
        routes.add({ method: "GET", path: "/api/iam/capabilities/personas", handlerToken: IAM_HANDLER_TOKENS.listPersonas, authRequired: true, tags: ["iam"] });
        routes.add({ method: "GET", path: "/api/iam/capabilities/check", handlerToken: IAM_HANDLER_TOKENS.checkCapability, authRequired: true, tags: ["iam"] });
        routes.add({ method: "GET", path: "/api/iam/capabilities/persona/:code", handlerToken: IAM_HANDLER_TOKENS.getPersonaCapabilities, authRequired: true, tags: ["iam"] });

        // ================================================================
        // MFA
        // ================================================================
        routes.add({ method: "GET", path: "/api/iam/mfa/status", handlerToken: IAM_HANDLER_TOKENS.mfaStatus, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "GET", path: "/api/iam/mfa/required", handlerToken: IAM_HANDLER_TOKENS.mfaRequired, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/enroll", handlerToken: IAM_HANDLER_TOKENS.mfaEnroll, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/enroll/verify", handlerToken: IAM_HANDLER_TOKENS.mfaEnrollVerify, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "DELETE", path: "/api/iam/mfa/enroll", handlerToken: IAM_HANDLER_TOKENS.mfaCancelEnroll, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/challenge", handlerToken: IAM_HANDLER_TOKENS.mfaChallenge, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/verify", handlerToken: IAM_HANDLER_TOKENS.mfaVerify, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "DELETE", path: "/api/iam/mfa", handlerToken: IAM_HANDLER_TOKENS.mfaDisable, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/backup-codes/regenerate", handlerToken: IAM_HANDLER_TOKENS.mfaBackupCodes, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "GET", path: "/api/iam/mfa/devices", handlerToken: IAM_HANDLER_TOKENS.mfaDevices, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "DELETE", path: "/api/iam/mfa/devices/:deviceId", handlerToken: IAM_HANDLER_TOKENS.mfaRevokeDevice, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "DELETE", path: "/api/iam/mfa/devices", handlerToken: IAM_HANDLER_TOKENS.mfaRevokeAllDevices, authRequired: true, tags: ["iam", "mfa"] });
        routes.add({ method: "POST", path: "/api/iam/mfa/devices/check", handlerToken: IAM_HANDLER_TOKENS.mfaCheckDevice, authRequired: true, tags: ["iam", "mfa"] });

        // ================================================================
        // Platform Control
        // ================================================================
        routes.add({ method: "GET", path: "/api/platform/tenants", handlerToken: IAM_HANDLER_TOKENS.listPlatformTenants, authRequired: true, tags: ["iam", "platform"] });

        logger.info("[iam] IAM module contributed — routes registered");
    },
};

export const moduleCode = "IAM";
export const moduleName = "Identity & Access Management";
