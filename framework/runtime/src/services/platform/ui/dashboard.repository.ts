/**
 * Dashboard Repository — Kysely-based database queries for ui.dashboard tables.
 */

import type { Kysely } from "kysely";

// ─────────────────────────────────────────────
// Types (aligned with Prisma-generated Kysely types)
// ─────────────────────────────────────────────

export interface DashboardRow {
    id: string;
    tenant_id: string | null;
    code: string;
    title_key: string;
    description_key: string | null;
    module_code: string;
    workbench: string;
    visibility: string;
    icon: string | null;
    sort_order: number;
    is_hidden: boolean;
    forked_from_id: string | null;
    owner_id: string | null;
    created_at: Date;
    created_by: string;
    updated_at: Date | null;
    updated_by: string | null;
}

export interface DashboardVersionRow {
    id: string;
    tenant_id: string | null;
    dashboard_id: string;
    version_no: number;
    status: string;
    layout: unknown;
    published_at: Date | null;
    published_by: string | null;
    created_at: Date;
    created_by: string;
}

export interface DashboardAclRow {
    id: string;
    tenant_id: string | null;
    dashboard_id: string;
    principal_type: string;
    principal_key: string;
    permission: string;
    created_at: Date;
    created_by: string;
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export class DashboardRepository {
    constructor(private db: Kysely<any>) {}

    /**
     * List dashboards accessible to a user for a given workbench.
     * Joins with ACL to filter by persona/role/group/user.
     */
    async listForUser(params: {
        tenantId: string;
        workbench: string;
        personas: string[];
        roles: string[];
        groups: string[];
        userId: string;
    }): Promise<(DashboardRow & { permission: string })[]> {
        // Build principal keys for ACL matching
        const principalMatches: Array<{ type: string; key: string }> = [];
        for (const p of params.personas) principalMatches.push({ type: "persona", key: p });
        for (const r of params.roles) principalMatches.push({ type: "role", key: r });
        for (const g of params.groups) principalMatches.push({ type: "group", key: g });
        principalMatches.push({ type: "user", key: params.userId });

        if (principalMatches.length === 0) return [];

        // Query: dashboards where (system OR tenant match) AND ACL matches AND not hidden
        const rows = await this.db
            .selectFrom("ui.dashboard as d")
            .innerJoin("ui.dashboard_acl as acl", "acl.dashboard_id", "d.id")
            .select([
                "d.id", "d.tenant_id", "d.code", "d.title_key", "d.description_key",
                "d.module_code", "d.workbench", "d.visibility", "d.icon",
                "d.sort_order", "d.is_hidden", "d.forked_from_id", "d.owner_id",
                "d.created_at", "d.created_by", "d.updated_at", "d.updated_by",
                "acl.permission",
            ])
            .where("d.workbench", "=", params.workbench)
            .where("d.is_hidden", "=", false)
            .where((eb) =>
                eb.or([
                    eb("d.visibility", "=", "system").and("d.tenant_id", "is", null),
                    eb("d.tenant_id", "=", params.tenantId),
                ])
            )
            .where((eb) =>
                eb.or(
                    principalMatches.map((pm) =>
                        eb.and([
                            eb("acl.principal_type", "=", pm.type),
                            eb("acl.principal_key", "=", pm.key),
                        ])
                    )
                )
            )
            .orderBy("d.module_code")
            .orderBy("d.sort_order")
            .execute();

        return rows as any;
    }

    /**
     * Get a dashboard by ID with its published version.
     */
    async getPublished(dashboardId: string): Promise<{
        dashboard: DashboardRow;
        version: DashboardVersionRow;
    } | null> {
        const row = await this.db
            .selectFrom("ui.dashboard as d")
            .innerJoin("ui.dashboard_version as v", (join) =>
                join
                    .onRef("v.dashboard_id", "=", "d.id")
                    .on("v.status", "=", "published")
            )
            .select([
                "d.id as d_id", "d.tenant_id as d_tenant_id", "d.code as d_code",
                "d.title_key as d_title_key", "d.description_key as d_description_key",
                "d.module_code as d_module_code", "d.workbench as d_workbench",
                "d.visibility as d_visibility", "d.icon as d_icon",
                "d.sort_order as d_sort_order", "d.is_hidden as d_is_hidden",
                "d.forked_from_id as d_forked_from_id", "d.owner_id as d_owner_id",
                "d.created_at as d_created_at", "d.created_by as d_created_by",
                "d.updated_at as d_updated_at", "d.updated_by as d_updated_by",
                "v.id as v_id", "v.tenant_id as v_tenant_id",
                "v.dashboard_id as v_dashboard_id", "v.version_no as v_version_no",
                "v.status as v_status", "v.layout as v_layout",
                "v.published_at as v_published_at", "v.published_by as v_published_by",
                "v.created_at as v_created_at", "v.created_by as v_created_by",
            ])
            .where("d.id", "=", dashboardId)
            .executeTakeFirst();

        if (!row) return null;

        return {
            dashboard: {
                id: (row as any).d_id,
                tenant_id: (row as any).d_tenant_id,
                code: (row as any).d_code,
                title_key: (row as any).d_title_key,
                description_key: (row as any).d_description_key,
                module_code: (row as any).d_module_code,
                workbench: (row as any).d_workbench,
                visibility: (row as any).d_visibility,
                icon: (row as any).d_icon,
                sort_order: (row as any).d_sort_order,
                is_hidden: (row as any).d_is_hidden,
                forked_from_id: (row as any).d_forked_from_id,
                owner_id: (row as any).d_owner_id,
                created_at: (row as any).d_created_at,
                created_by: (row as any).d_created_by,
                updated_at: (row as any).d_updated_at,
                updated_by: (row as any).d_updated_by,
            },
            version: {
                id: (row as any).v_id,
                tenant_id: (row as any).v_tenant_id,
                dashboard_id: (row as any).v_dashboard_id,
                version_no: (row as any).v_version_no,
                status: (row as any).v_status,
                layout: (row as any).v_layout,
                published_at: (row as any).v_published_at,
                published_by: (row as any).v_published_by,
                created_at: (row as any).v_created_at,
                created_by: (row as any).v_created_by,
            },
        };
    }

    /**
     * Get the draft version of a dashboard.
     */
    async getDraft(dashboardId: string): Promise<DashboardVersionRow | null> {
        const row = await this.db
            .selectFrom("ui.dashboard_version")
            .selectAll()
            .where("dashboard_id", "=", dashboardId)
            .where("status", "=", "draft")
            .orderBy("version_no", "desc")
            .executeTakeFirst();

        return (row as DashboardVersionRow) ?? null;
    }

    /**
     * Create a new dashboard with an initial published version.
     */
    async create(params: {
        tenantId: string | null;
        code: string;
        titleKey: string;
        descriptionKey?: string;
        moduleCode: string;
        workbench: string;
        visibility: string;
        icon?: string;
        sortOrder?: number;
        forkedFromId?: string;
        ownerId?: string;
        layout: unknown;
        acl: Array<{ principalType: string; principalKey: string; permission: string }>;
        createdBy: string;
    }): Promise<string> {
        const dashboardId = await this.db.transaction().execute(async (trx) => {
            // Insert dashboard
            const [dashboard] = await trx
                .insertInto("ui.dashboard")
                .values({
                    tenant_id: params.tenantId,
                    code: params.code,
                    title_key: params.titleKey,
                    description_key: params.descriptionKey ?? null,
                    module_code: params.moduleCode,
                    workbench: params.workbench,
                    visibility: params.visibility,
                    icon: params.icon ?? null,
                    sort_order: params.sortOrder ?? 100,
                    forked_from_id: params.forkedFromId ?? null,
                    owner_id: params.ownerId ?? null,
                    created_by: params.createdBy,
                })
                .returning("id")
                .execute();

            const dId = dashboard.id as string;

            // Insert published version
            await trx
                .insertInto("ui.dashboard_version")
                .values({
                    tenant_id: params.tenantId,
                    dashboard_id: dId,
                    version_no: 1,
                    status: "published",
                    layout: JSON.stringify(params.layout),
                    published_at: new Date(),
                    published_by: params.createdBy,
                    created_by: params.createdBy,
                })
                .execute();

            // Insert ACL entries
            if (params.acl.length > 0) {
                await trx
                    .insertInto("ui.dashboard_acl")
                    .values(
                        params.acl.map((a) => ({
                            tenant_id: params.tenantId,
                            dashboard_id: dId,
                            principal_type: a.principalType,
                            principal_key: a.principalKey,
                            permission: a.permission,
                            created_by: params.createdBy,
                        }))
                    )
                    .execute();
            }

            return dId;
        });

        return dashboardId;
    }

    /**
     * Duplicate a dashboard (fork system → tenant).
     */
    async duplicate(params: {
        sourceDashboardId: string;
        tenantId: string;
        newCode: string;
        createdBy: string;
    }): Promise<string> {
        const source = await this.getPublished(params.sourceDashboardId);
        if (!source) throw new Error(`Dashboard not found: ${params.sourceDashboardId}`);

        // Load source ACL
        const sourceAcl = await this.db
            .selectFrom("ui.dashboard_acl")
            .selectAll()
            .where("dashboard_id", "=", params.sourceDashboardId)
            .execute();

        return this.create({
            tenantId: params.tenantId,
            code: params.newCode,
            titleKey: source.dashboard.title_key,
            descriptionKey: source.dashboard.description_key ?? undefined,
            moduleCode: source.dashboard.module_code,
            workbench: source.dashboard.workbench,
            visibility: "tenant",
            icon: source.dashboard.icon ?? undefined,
            sortOrder: source.dashboard.sort_order,
            forkedFromId: params.sourceDashboardId,
            layout: source.version.layout,
            acl: (sourceAcl as DashboardAclRow[]).map((a) => ({
                principalType: a.principal_type,
                principalKey: a.principal_key,
                permission: a.permission,
            })),
            createdBy: params.createdBy,
        });
    }

    /**
     * Save a draft layout for a dashboard.
     */
    async saveDraft(params: {
        dashboardId: string;
        tenantId: string | null;
        layout: unknown;
        createdBy: string;
    }): Promise<void> {
        // Get the latest version number
        const latest = await this.db
            .selectFrom("ui.dashboard_version")
            .select("version_no")
            .where("dashboard_id", "=", params.dashboardId)
            .orderBy("version_no", "desc")
            .executeTakeFirst();

        const nextVersion = (latest?.version_no ?? 0) + 1;

        // Check if draft already exists
        const existingDraft = await this.getDraft(params.dashboardId);

        if (existingDraft) {
            // Update existing draft
            await this.db
                .updateTable("ui.dashboard_version")
                .set({ layout: JSON.stringify(params.layout) })
                .where("id", "=", existingDraft.id)
                .execute();
        } else {
            // Create new draft
            await this.db
                .insertInto("ui.dashboard_version")
                .values({
                    tenant_id: params.tenantId,
                    dashboard_id: params.dashboardId,
                    version_no: nextVersion,
                    status: "draft",
                    layout: JSON.stringify(params.layout),
                    created_by: params.createdBy,
                })
                .execute();
        }
    }

    /**
     * Publish a draft version.
     */
    async publish(params: {
        dashboardId: string;
        publishedBy: string;
    }): Promise<void> {
        await this.db.transaction().execute(async (trx) => {
            // Archive current published version
            await trx
                .updateTable("ui.dashboard_version")
                .set({ status: "archived" })
                .where("dashboard_id", "=", params.dashboardId)
                .where("status", "=", "published")
                .execute();

            // Promote draft to published
            await trx
                .updateTable("ui.dashboard_version")
                .set({
                    status: "published",
                    published_at: new Date(),
                    published_by: params.publishedBy,
                })
                .where("dashboard_id", "=", params.dashboardId)
                .where("status", "=", "draft")
                .execute();
        });
    }

    /**
     * Update dashboard metadata (rename/hide/reorder).
     */
    async update(
        dashboardId: string,
        updates: {
            titleKey?: string;
            descriptionKey?: string;
            isHidden?: boolean;
            sortOrder?: number;
            updatedBy: string;
        },
    ): Promise<void> {
        const set: Record<string, unknown> = {
            updated_at: new Date(),
            updated_by: updates.updatedBy,
        };
        if (updates.titleKey !== undefined) set.title_key = updates.titleKey;
        if (updates.descriptionKey !== undefined) set.description_key = updates.descriptionKey;
        if (updates.isHidden !== undefined) set.is_hidden = updates.isHidden;
        if (updates.sortOrder !== undefined) set.sort_order = updates.sortOrder;

        await this.db
            .updateTable("ui.dashboard")
            .set(set)
            .where("id", "=", dashboardId)
            .execute();
    }

    /**
     * Discard (delete) the draft version of a dashboard.
     */
    async discardDraft(dashboardId: string): Promise<void> {
        await this.db
            .deleteFrom("ui.dashboard_version")
            .where("dashboard_id", "=", dashboardId)
            .where("status", "=", "draft")
            .execute();
    }

    /**
     * Delete a dashboard and all related rows (versions, ACL).
     */
    async delete(dashboardId: string): Promise<void> {
        await this.db.transaction().execute(async (tx) => {
            await tx.deleteFrom("ui.dashboard_acl").where("dashboard_id", "=", dashboardId).execute();
            await tx.deleteFrom("ui.dashboard_version").where("dashboard_id", "=", dashboardId).execute();
            await tx.deleteFrom("ui.dashboard").where("id", "=", dashboardId).execute();
        });
    }

    /**
     * Get lightweight dashboard metadata for permission resolution.
     */
    async getDashboardMeta(dashboardId: string): Promise<{
        id: string;
        tenant_id: string | null;
        visibility: string;
        owner_id: string | null;
        created_by: string;
    } | null> {
        const row = await this.db
            .selectFrom("ui.dashboard")
            .select(["id", "tenant_id", "visibility", "owner_id", "created_by"])
            .where("id", "=", dashboardId)
            .executeTakeFirst();

        return (row as any) ?? null;
    }

    /**
     * Resolve the highest permission level a user has on a specific dashboard.
     *
     * Resolution order:
     *   1. Ownership check (owner_id or created_by for non-system dashboards) → "owner"
     *   2. ACL scan for matching principals → highest of "edit" | "view"
     *   3. No match → "none"
     */
    async resolvePermission(
        dashboardId: string,
        params: {
            userId: string;
            personas: string[];
            roles: string[];
            groups: string[];
        },
    ): Promise<"owner" | "edit" | "view" | "none"> {
        const meta = await this.getDashboardMeta(dashboardId);
        if (!meta) return "none";

        // Ownership check (system dashboards have no owner)
        if (
            meta.visibility !== "system" &&
            (meta.owner_id === params.userId || meta.created_by === params.userId)
        ) {
            return "owner";
        }

        // Build principal matches
        const principalMatches: Array<{ type: string; key: string }> = [];
        for (const p of params.personas) principalMatches.push({ type: "persona", key: p });
        for (const r of params.roles) principalMatches.push({ type: "role", key: r });
        for (const g of params.groups) principalMatches.push({ type: "group", key: g });
        principalMatches.push({ type: "user", key: params.userId });

        if (principalMatches.length === 0) return "none";

        const rows = await this.db
            .selectFrom("ui.dashboard_acl")
            .select("permission")
            .where("dashboard_id", "=", dashboardId)
            .where((eb) =>
                eb.or(
                    principalMatches.map((pm) =>
                        eb.and([
                            eb("principal_type", "=", pm.type),
                            eb("principal_key", "=", pm.key),
                        ])
                    )
                )
            )
            .execute();

        let highest: "edit" | "view" | "none" = "none";
        for (const row of rows) {
            if (row.permission === "edit") return "edit"; // can't get higher than edit via ACL
            if (row.permission === "view") highest = "view";
        }

        return highest;
    }

    /**
     * Get all ACL entries for a dashboard.
     */
    async getAclEntries(dashboardId: string): Promise<DashboardAclRow[]> {
        const rows = await this.db
            .selectFrom("ui.dashboard_acl")
            .selectAll()
            .where("dashboard_id", "=", dashboardId)
            .orderBy("created_at")
            .execute();

        return rows as DashboardAclRow[];
    }

    /**
     * Add an ACL entry to a dashboard.
     */
    async addAclEntry(params: {
        dashboardId: string;
        tenantId: string | null;
        principalType: string;
        principalKey: string;
        permission: string;
        createdBy: string;
    }): Promise<string> {
        const [row] = await this.db
            .insertInto("ui.dashboard_acl")
            .values({
                tenant_id: params.tenantId,
                dashboard_id: params.dashboardId,
                principal_type: params.principalType,
                principal_key: params.principalKey,
                permission: params.permission,
                created_by: params.createdBy,
            })
            .returning("id")
            .execute();

        return row.id as string;
    }

    /**
     * Remove an ACL entry by ID.
     */
    async removeAclEntry(aclId: string): Promise<void> {
        await this.db
            .deleteFrom("ui.dashboard_acl")
            .where("id", "=", aclId)
            .execute();
    }

    /**
     * Upsert a system dashboard (used by contribution seeder).
     * Idempotent: updates existing or creates new.
     */
    async upsertSystem(params: {
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
    }): Promise<string> {
        // Check if system dashboard already exists
        const existing = await this.db
            .selectFrom("ui.dashboard")
            .select("id")
            .where("tenant_id", "is", null)
            .where("code", "=", params.code)
            .where("workbench", "=", params.workbench)
            .executeTakeFirst();

        if (existing) {
            return existing.id as string;
        }

        return this.create({
            tenantId: null,
            code: params.code,
            titleKey: params.titleKey,
            descriptionKey: params.descriptionKey,
            moduleCode: params.moduleCode,
            workbench: params.workbench,
            visibility: "system",
            icon: params.icon,
            sortOrder: params.sortOrder,
            layout: params.layout,
            acl: params.acl,
            createdBy: params.createdBy,
        });
    }
}
