/**
 * Dashboard Service — business logic for dashboard resolution, CRUD, versioning, and access control.
 */

import { HttpError } from "./http-error.js";

import type { DashboardAclRow, DashboardRepository } from "./dashboard.repository.js";
import type { Logger } from "../../../kernel/logger.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface UserContext {
    tenantId: string;
    userId: string;
    personas: string[];
    roles: string[];
    groups: string[];
}

export interface DashboardListParams extends UserContext {
    workbench: string;
}

export interface CreateDashboardParams {
    tenantId: string;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    workbench: string;
    icon?: string;
    sortOrder?: number;
    layout: unknown;
    acl: Array<{ principalType: string; principalKey: string; permission: string }>;
    createdBy: string;
    ownerId?: string;
}

const PERMISSION_RANK: Record<string, number> = {
    owner: 3,
    edit: 2,
    view: 1,
    none: 0,
};

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class DashboardService {
    constructor(
        private repo: DashboardRepository,
        private logger: Logger,
    ) {}

    // ─────────────────────────────────────────
    // Permission helpers
    // ─────────────────────────────────────────

    /**
     * Assert that the user has at least the required permission on a dashboard.
     * Throws HttpError(403) if insufficient.
     */
    async assertPermission(
        dashboardId: string,
        userCtx: UserContext,
        required: "view" | "edit",
    ): Promise<void> {
        const actual = await this.repo.resolvePermission(dashboardId, {
            userId: userCtx.userId,
            personas: userCtx.personas,
            roles: userCtx.roles,
            groups: userCtx.groups,
        });

        if (PERMISSION_RANK[actual] < PERMISSION_RANK[required]) {
            this.logger.warn(
                { dashboardId, userId: userCtx.userId, required, actual },
                "[dashboard] permission denied",
            );
            throw new HttpError(403, "PERMISSION_DENIED", `Requires "${required}" permission, have "${actual}"`);
        }
    }

    /**
     * Assert that the user is the owner of a dashboard.
     * Throws HttpError(403) if not owner.
     */
    async assertOwner(dashboardId: string, userCtx: UserContext): Promise<void> {
        const actual = await this.repo.resolvePermission(dashboardId, {
            userId: userCtx.userId,
            personas: userCtx.personas,
            roles: userCtx.roles,
            groups: userCtx.groups,
        });

        if (actual !== "owner") {
            this.logger.warn(
                { dashboardId, userId: userCtx.userId, actual },
                "[dashboard] owner required",
            );
            throw new HttpError(403, "PERMISSION_DENIED", "Only the owner can perform this action");
        }
    }

    /**
     * Assert that a dashboard is not a system dashboard (system dashboards are immutable).
     * Throws HttpError(403) if the dashboard has visibility "system".
     */
    async assertNotSystem(dashboardId: string): Promise<void> {
        const meta = await this.repo.getDashboardMeta(dashboardId);
        if (!meta) {
            throw new HttpError(404, "DASHBOARD_NOT_FOUND", `Dashboard ${dashboardId} not found`);
        }
        if (meta.visibility === "system") {
            throw new HttpError(403, "SYSTEM_DASHBOARD_IMMUTABLE", "System dashboards cannot be modified");
        }
    }

    /**
     * Get published dashboard with the caller's resolved permission level.
     */
    async getPublishedWithPermission(dashboardId: string, userCtx: UserContext) {
        const result = await this.repo.getPublished(dashboardId);
        if (!result) return null;

        const permission = await this.repo.resolvePermission(dashboardId, {
            userId: userCtx.userId,
            personas: userCtx.personas,
            roles: userCtx.roles,
            groups: userCtx.groups,
        });

        return {
            id: result.dashboard.id,
            code: result.dashboard.code,
            titleKey: result.dashboard.title_key,
            descriptionKey: result.dashboard.description_key,
            moduleCode: result.dashboard.module_code,
            workbench: result.dashboard.workbench,
            visibility: result.dashboard.visibility,
            icon: result.dashboard.icon,
            layout: result.version.layout,
            versionNo: result.version.version_no,
            publishedAt: result.version.published_at,
            ownerId: result.dashboard.owner_id,
            createdBy: result.dashboard.created_by,
            permission,
        };
    }

    // ─────────────────────────────────────────
    // ACL management
    // ─────────────────────────────────────────

    async getAclEntries(dashboardId: string): Promise<DashboardAclRow[]> {
        return this.repo.getAclEntries(dashboardId);
    }

    async addAclEntry(params: {
        dashboardId: string;
        tenantId: string | null;
        principalType: string;
        principalKey: string;
        permission: string;
        createdBy: string;
    }): Promise<string> {
        this.logger.info(
            { dashboardId: params.dashboardId, principalType: params.principalType, principalKey: params.principalKey },
            "[dashboard] adding ACL entry",
        );
        return this.repo.addAclEntry(params);
    }

    async removeAclEntry(aclId: string): Promise<void> {
        this.logger.info({ aclId }, "[dashboard] removing ACL entry");
        return this.repo.removeAclEntry(aclId);
    }

    // ─────────────────────────────────────────
    // Existing operations
    // ─────────────────────────────────────────

    /**
     * List dashboards for the sidebar (filtered by ACL + workbench).
     */
    async listDashboards(params: DashboardListParams) {
        this.logger.debug(
            { workbench: params.workbench, userId: params.userId },
            "[dashboard] listing dashboards",
        );

        const rows = await this.repo.listForUser({
            tenantId: params.tenantId,
            workbench: params.workbench,
            personas: params.personas,
            roles: params.roles,
            groups: params.groups,
            userId: params.userId,
        });

        // Deduplicate by dashboard ID (a user may match multiple ACL entries)
        const seen = new Set<string>();
        const unique = rows.filter((r) => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });

        // Group by module_code
        const groups = new Map<string, typeof unique>();
        for (const d of unique) {
            const key = d.module_code;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(d);
        }

        return {
            total: unique.length,
            groups: Array.from(groups.entries()).map(([moduleCode, dashboards]) => ({
                moduleCode,
                dashboards: dashboards.map((d) => ({
                    id: d.id,
                    code: d.code,
                    titleKey: d.title_key,
                    descriptionKey: d.description_key,
                    moduleCode: d.module_code,
                    workbench: d.workbench,
                    visibility: d.visibility,
                    icon: d.icon,
                    sortOrder: d.sort_order,
                    isHidden: d.is_hidden,
                    forkedFromId: d.forked_from_id,
                    permission: d.permission,
                })),
            })),
        };
    }

    /**
     * Get a dashboard's published version for rendering.
     */
    async getPublished(dashboardId: string) {
        const result = await this.repo.getPublished(dashboardId);
        if (!result) return null;

        return {
            id: result.dashboard.id,
            code: result.dashboard.code,
            titleKey: result.dashboard.title_key,
            descriptionKey: result.dashboard.description_key,
            moduleCode: result.dashboard.module_code,
            workbench: result.dashboard.workbench,
            visibility: result.dashboard.visibility,
            icon: result.dashboard.icon,
            layout: result.version.layout,
            versionNo: result.version.version_no,
            publishedAt: result.version.published_at,
        };
    }

    /**
     * Get a dashboard's draft version for editing.
     */
    async getDraft(dashboardId: string) {
        return this.repo.getDraft(dashboardId);
    }

    /**
     * Create a new tenant dashboard.
     */
    async createDashboard(params: CreateDashboardParams) {
        this.logger.info(
            { code: params.code, module: params.moduleCode, workbench: params.workbench },
            "[dashboard] creating dashboard",
        );

        return this.repo.create({
            tenantId: params.tenantId,
            code: params.code,
            titleKey: params.titleKey,
            descriptionKey: params.descriptionKey,
            moduleCode: params.moduleCode,
            workbench: params.workbench,
            visibility: "tenant",
            icon: params.icon,
            sortOrder: params.sortOrder,
            ownerId: params.ownerId,
            layout: params.layout,
            acl: params.acl,
            createdBy: params.createdBy,
        });
    }

    /**
     * Duplicate a dashboard (fork system → tenant).
     */
    async duplicateDashboard(params: {
        sourceDashboardId: string;
        tenantId: string;
        newCode: string;
        createdBy: string;
    }) {
        this.logger.info(
            { source: params.sourceDashboardId, newCode: params.newCode },
            "[dashboard] duplicating dashboard",
        );

        return this.repo.duplicate(params);
    }

    /**
     * Update dashboard metadata.
     */
    async updateDashboard(
        dashboardId: string,
        updates: {
            titleKey?: string;
            descriptionKey?: string;
            isHidden?: boolean;
            sortOrder?: number;
            updatedBy: string;
        },
    ) {
        return this.repo.update(dashboardId, updates);
    }

    /**
     * Save draft layout.
     */
    async saveDraftLayout(params: {
        dashboardId: string;
        tenantId: string | null;
        layout: unknown;
        createdBy: string;
    }) {
        return this.repo.saveDraft(params);
    }

    /**
     * Publish a draft version.
     */
    async publishDashboard(dashboardId: string, publishedBy: string) {
        this.logger.info({ dashboardId }, "[dashboard] publishing dashboard");
        return this.repo.publish({ dashboardId, publishedBy });
    }

    /**
     * Discard (delete) the draft version.
     */
    async discardDraft(dashboardId: string) {
        this.logger.info({ dashboardId }, "[dashboard] discarding draft");
        return this.repo.discardDraft(dashboardId);
    }

    /**
     * Delete a dashboard permanently (cascade: versions + ACL).
     */
    async deleteDashboard(dashboardId: string): Promise<void> {
        this.logger.info({ dashboardId }, "[dashboard] deleting dashboard");
        return this.repo.delete(dashboardId);
    }
}
