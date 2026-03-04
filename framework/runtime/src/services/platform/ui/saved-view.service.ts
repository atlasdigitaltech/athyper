/**
 * SavedView Service — Business logic for saved view management.
 *
 * Enforces scope-based access control:
 *   - USER scope: only the owner can read/write
 *   - SHARED scope: requires role ui:preset:write_shared
 *   - SYSTEM scope: requires role ui:preset:write_system
 */

import { createHash } from "node:crypto";

import { HttpError } from "./http-error";

import type { SavedViewMeta, SavedViewRepository, SavedViewRow } from "./saved-view.repository.js";
import type { Logger } from "../../../kernel/logger.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface UserContext {
    tenantId: string;
    userId: string;
    roles: string[];
}

export interface CreateViewInput {
    entityKey: string;
    scope: string;
    name: string;
    isPinned?: boolean;
    isDefault?: boolean;
    stateJson: unknown;
}

export interface UpdateViewInput {
    name?: string;
    isPinned?: boolean;
    isDefault?: boolean;
    stateJson?: unknown;
    version: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function computeStateHash(stateJson: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(stateJson))
        .digest("hex")
        .slice(0, 16);
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class SavedViewService {
    constructor(
        private repo: SavedViewRepository,
        private logger: Logger,
    ) {}

    /**
     * List all views accessible to the user for a given entity.
     */
    async listViews(
        user: UserContext,
        entityKey: string,
    ): Promise<SavedViewMeta[]> {
        this.logger.debug(
            { entityKey, userId: user.userId },
            "[saved-view] listing views",
        );

        return this.repo.listByEntity(user.tenantId, entityKey, user.userId);
    }

    /**
     * Get a single view with full state payload.
     * Enforces USER-scope ownership check.
     */
    async getView(
        user: UserContext,
        viewId: string,
    ): Promise<SavedViewRow> {
        const view = await this.repo.getById(user.tenantId, viewId);
        if (!view) {
            throw new HttpError(404, "VIEW_NOT_FOUND", `View "${viewId}" not found`);
        }

        this.assertReadAccess(user, view);
        return view;
    }

    /**
     * Create a new saved view. Returns the full created row.
     */
    async createView(
        user: UserContext,
        input: CreateViewInput,
    ): Promise<SavedViewRow> {
        this.assertWriteScope(user, input.scope);

        const stateHash = computeStateHash(input.stateJson);

        this.logger.info(
            { entityKey: input.entityKey, scope: input.scope, name: input.name, userId: user.userId },
            "[saved-view] creating view",
        );

        const { id } = await this.repo.create({
            tenantId: user.tenantId,
            entityKey: input.entityKey,
            scope: input.scope,
            ownerUserId: input.scope === "USER" ? user.userId : null,
            name: input.name,
            isPinned: input.isPinned ?? false,
            isDefault: input.isDefault ?? false,
            stateJson: input.stateJson,
            stateHash,
            createdBy: user.userId,
        });

        const created = await this.repo.getById(user.tenantId, id);
        if (!created) {
            throw new HttpError(500, "CREATE_FAILED", "Failed to retrieve created view");
        }
        return created;
    }

    /**
     * Update an existing saved view with optimistic concurrency.
     */
    async updateView(
        user: UserContext,
        viewId: string,
        input: UpdateViewInput,
    ): Promise<SavedViewRow> {
        const existing = await this.repo.getById(user.tenantId, viewId);
        if (!existing) {
            throw new HttpError(404, "VIEW_NOT_FOUND", `View "${viewId}" not found`);
        }

        this.assertWriteAccess(user, existing);

        const stateHash = input.stateJson !== undefined
            ? computeStateHash(input.stateJson)
            : undefined;

        this.logger.info(
            { viewId, userId: user.userId },
            "[saved-view] updating view",
        );

        return this.repo.update(
            user.tenantId,
            viewId,
            {
                name: input.name,
                isPinned: input.isPinned,
                isDefault: input.isDefault,
                stateJson: input.stateJson,
                stateHash,
                updatedBy: user.userId,
            },
            input.version,
        );
    }

    /**
     * Soft-delete a saved view.
     */
    async deleteView(
        user: UserContext,
        viewId: string,
    ): Promise<void> {
        const existing = await this.repo.getById(user.tenantId, viewId);
        if (!existing) {
            throw new HttpError(404, "VIEW_NOT_FOUND", `View "${viewId}" not found`);
        }

        this.assertDeleteAccess(user, existing);

        this.logger.info(
            { viewId, scope: existing.scope, userId: user.userId },
            "[saved-view] deleting view",
        );

        const deleted = await this.repo.softDelete(user.tenantId, viewId, user.userId);
        if (!deleted) {
            throw new HttpError(404, "VIEW_NOT_FOUND", `View "${viewId}" not found`);
        }
    }

    // ─── Access control ─────────────────────────────────

    private assertReadAccess(user: UserContext, view: SavedViewRow): void {
        if (view.scope === "SYSTEM" || view.scope === "SHARED") return;
        if (view.scope === "USER" && view.owner_user_id === user.userId) return;

        this.logger.warn(
            { viewId: view.id, scope: view.scope, userId: user.userId },
            "[saved-view] read access denied",
        );
        throw new HttpError(403, "ACCESS_DENIED", "You do not have access to this view");
    }

    private assertWriteScope(user: UserContext, scope: string): void {
        if (scope === "USER") return;
        if (scope === "SHARED" && user.roles.includes("ui:preset:write_shared")) return;
        if (scope === "SYSTEM" && user.roles.includes("ui:preset:write_system")) return;

        this.logger.warn(
            { scope, userId: user.userId, roles: user.roles },
            "[saved-view] write scope denied",
        );
        throw new HttpError(
            403,
            "SCOPE_DENIED",
            `Role required to create ${scope} views`,
        );
    }

    private assertWriteAccess(user: UserContext, view: SavedViewRow): void {
        if (view.scope === "USER" && view.owner_user_id === user.userId) return;
        if (view.scope === "SHARED" && user.roles.includes("ui:preset:write_shared")) return;
        if (view.scope === "SYSTEM" && user.roles.includes("ui:preset:write_system")) return;

        this.logger.warn(
            { viewId: view.id, scope: view.scope, userId: user.userId },
            "[saved-view] write access denied",
        );
        throw new HttpError(403, "ACCESS_DENIED", "You do not have permission to modify this view");
    }

    private assertDeleteAccess(user: UserContext, view: SavedViewRow): void {
        if (view.scope === "USER" && view.owner_user_id === user.userId) return;
        if (view.scope === "SHARED" && user.roles.includes("ui:preset:delete_shared")) return;
        if (view.scope === "SYSTEM" && user.roles.includes("ui:preset:write_system")) return;

        this.logger.warn(
            { viewId: view.id, scope: view.scope, userId: user.userId },
            "[saved-view] delete access denied",
        );
        throw new HttpError(403, "ACCESS_DENIED", "You do not have permission to delete this view");
    }
}
