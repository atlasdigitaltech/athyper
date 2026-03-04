import { NextResponse } from "next/server";

import { proxyGet, requireAdminSession } from "../helpers";

import type { EntitySummary } from "@/lib/schema-manager/types";

interface HealthIssue {
    level: "info" | "warning" | "error";
    entity: string;
    code: string;
    message: string;
}

/**
 * GET /api/admin/mesh/meta-studio/health
 * Aggregates schema health data across all entities.
 */
export async function GET() {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    // Fetch all entities
    const entitiesRes = await proxyGet(auth, "/api/meta/entities");
    const entitiesBody = (await entitiesRes.json()) as { success: boolean; data?: EntitySummary[] };

    if (!entitiesBody.success || !entitiesBody.data) {
        return NextResponse.json({
            success: true,
            data: {
                entityCount: 0,
                healthyCount: 0,
                issues: [],
                summary: { errors: 0, warnings: 0, infos: 0 },
            },
        });
    }

    const entities = entitiesBody.data;
    const issues: HealthIssue[] = [];

    for (const entity of entities) {
        // No version defined
        if (!entity.currentVersion) {
            issues.push({
                level: "error",
                entity: entity.name,
                code: "NO_VERSION",
                message: "No version defined",
            });
            continue;
        }

        // Draft pending publish
        if (entity.currentVersion.status === "draft") {
            issues.push({
                level: "info",
                entity: entity.name,
                code: "DRAFT_PENDING",
                message: `Draft v${entity.currentVersion.versionNo} pending publish`,
            });
        }

        // Archived/deprecated
        if (entity.currentVersion.status === "archived") {
            issues.push({
                level: "warning",
                entity: entity.name,
                code: "ARCHIVED",
                message: "Current version is archived/deprecated",
            });
        }

        // No fields
        if (entity.fieldCount === 0) {
            issues.push({
                level: "warning",
                entity: entity.name,
                code: "NO_FIELDS",
                message: "No fields defined",
            });
        }

        // Inactive entity
        if (!entity.isActive) {
            issues.push({
                level: "warning",
                entity: entity.name,
                code: "INACTIVE",
                message: "Entity is inactive",
            });
        }
    }

    const errorCount = issues.filter((i) => i.level === "error").length;
    const warningCount = issues.filter((i) => i.level === "warning").length;
    const infoCount = issues.filter((i) => i.level === "info").length;
    const entitiesWithIssues = new Set(issues.map((i) => i.entity));
    const healthyCount = entities.length - entitiesWithIssues.size;

    return NextResponse.json({
        success: true,
        data: {
            entityCount: entities.length,
            healthyCount,
            issues,
            summary: { errors: errorCount, warnings: warningCount, infos: infoCount },
        },
    });
}
