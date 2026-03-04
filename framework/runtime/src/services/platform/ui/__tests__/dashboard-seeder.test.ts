/**
 * Dashboard Contribution Seeder Tests
 */

import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { DashboardContributionSeeder } from "../dashboard-seeder.js";

// ─────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────

function createMockRepo() {
    return {
        upsertSystem: vi.fn().mockResolvedValue("generated-id"),
    };
}

function createMockLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
    };
}

/** Minimal valid contribution JSON */
function makeContribution(overrides?: Partial<{
    module_code: string;
    module_name: string;
    dashboards: unknown[];
}>) {
    return {
        $schema: "athyper://dashboard-contribution/v1",
        module_code: overrides?.module_code ?? "TST",
        module_name: overrides?.module_name ?? "Test Module",
        dashboards: overrides?.dashboards ?? [
            {
                code: "tst_overview",
                title_key: "dashboard.TST.overview.title",
                description_key: "dashboard.TST.overview.description",
                icon: "test-icon",
                workbenches: ["user", "admin"],
                sort_order: 100,
                acl: [
                    { principal_type: "persona", principal_key: "agent", permission: "view" },
                    { principal_type: "persona", principal_key: "module_admin", permission: "edit" },
                ],
                layout: {
                    schema_version: 1,
                    columns: 12,
                    row_height: 80,
                    items: [
                        {
                            id: "h1",
                            widget_type: "heading",
                            params: { text_key: "dashboard.TST.overview.title", level: "h2" },
                            grid: { x: 0, y: 0, w: 12, h: 1 },
                        },
                    ],
                },
            },
        ],
    };
}

/** Create a temp dir with contribution file(s) */
function createTempDir(files: Array<{ path: string; content: unknown }>) {
    const tmpDir = mkdtempSync(join(tmpdir(), "seeder-test-"));
    for (const f of files) {
        const fullPath = join(tmpDir, f.path);
        const dir = fullPath.substring(0, fullPath.lastIndexOf("\\") === -1 ? fullPath.lastIndexOf("/") : fullPath.lastIndexOf("\\"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, JSON.stringify(f.content, null, 2));
    }
    return tmpDir;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("DashboardContributionSeeder", () => {
    let mockRepo: ReturnType<typeof createMockRepo>;
    let mockLogger: ReturnType<typeof createMockLogger>;
    let seeder: DashboardContributionSeeder;

    beforeEach(() => {
        mockRepo = createMockRepo();
        mockLogger = createMockLogger();
        seeder = new DashboardContributionSeeder(mockRepo as any, mockLogger as any);
    });

    it("should find contribution files recursively", () => {
        const tmpDir = createTempDir([
            { path: "business/crm/dashboard.contribution.json", content: makeContribution({ module_code: "CRM" }) },
            { path: "business/hr/dashboard.contribution.json", content: makeContribution({ module_code: "HR" }) },
            { path: "platform/ref/dashboard.contribution.json", content: makeContribution({ module_code: "REF" }) },
        ]);

        const files = seeder.findContributionFiles(tmpDir);
        expect(files).toHaveLength(3);
        expect(files.every((f) => f.endsWith("dashboard.contribution.json"))).toBe(true);
    });

    it("should call upsertSystem for each dashboard × workbench", async () => {
        const contribution = makeContribution();
        // 1 dashboard × 2 workbenches ("user", "admin") = 2 calls
        const tmpDir = createTempDir([
            { path: "mod/dashboard.contribution.json", content: contribution },
        ]);

        const result = await seeder.seed(tmpDir);

        expect(mockRepo.upsertSystem).toHaveBeenCalledTimes(2);
        expect(result.seeded).toBe(2);
        expect(result.errors).toBe(0);

        // Verify first call (user workbench)
        const firstCall = mockRepo.upsertSystem.mock.calls[0][0];
        expect(firstCall.code).toBe("tst_overview");
        expect(firstCall.titleKey).toBe("dashboard.TST.overview.title");
        expect(firstCall.moduleCode).toBe("TST");
        expect(firstCall.workbench).toBe("user");
        expect(firstCall.createdBy).toBe("system");
        expect(firstCall.sortOrder).toBe(100);
        expect(firstCall.acl).toHaveLength(2);
        expect(firstCall.acl[0]).toEqual({
            principalType: "persona",
            principalKey: "agent",
            permission: "view",
        });

        // Verify second call (admin workbench)
        const secondCall = mockRepo.upsertSystem.mock.calls[1][0];
        expect(secondCall.workbench).toBe("admin");
    });

    it("should handle multiple dashboards in one contribution", async () => {
        const contribution = makeContribution({
            dashboards: [
                {
                    code: "tst_one",
                    title_key: "one.title",
                    workbenches: ["admin"],
                    sort_order: 10,
                    acl: [{ principal_type: "persona", principal_key: "agent", permission: "view" }],
                    layout: { schema_version: 1, columns: 12, row_height: 80, items: [] },
                },
                {
                    code: "tst_two",
                    title_key: "two.title",
                    workbenches: ["user", "partner"],
                    sort_order: 20,
                    acl: [{ principal_type: "persona", principal_key: "agent", permission: "view" }],
                    layout: { schema_version: 1, columns: 12, row_height: 80, items: [] },
                },
            ],
        });

        const tmpDir = createTempDir([
            { path: "mod/dashboard.contribution.json", content: contribution },
        ]);

        const result = await seeder.seed(tmpDir);

        // 1 call for tst_one(admin) + 2 calls for tst_two(user, partner) = 3
        expect(mockRepo.upsertSystem).toHaveBeenCalledTimes(3);
        expect(result.seeded).toBe(3);
    });

    it("should handle validation errors gracefully", async () => {
        const tmpDir = createTempDir([
            // Invalid: missing required fields
            { path: "bad/dashboard.contribution.json", content: { invalid: true } },
            // Valid: should still be processed
            { path: "good/dashboard.contribution.json", content: makeContribution() },
        ]);

        const result = await seeder.seed(tmpDir);

        // Bad file logged, good file processed (2 workbenches)
        expect(result.errors).toBe(1);
        expect(result.seeded).toBe(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.any(String) }),
            "[dashboard-seeder] failed to parse contribution file",
        );
    });

    it("should handle upsert errors gracefully and continue", async () => {
        // First call fails, second succeeds
        mockRepo.upsertSystem
            .mockRejectedValueOnce(new Error("DB connection failed"))
            .mockResolvedValue("id-2");

        const tmpDir = createTempDir([
            { path: "mod/dashboard.contribution.json", content: makeContribution() },
        ]);

        const result = await seeder.seed(tmpDir);

        // 2 workbenches: first fails, second succeeds
        expect(result.seeded).toBe(1);
        expect(result.errors).toBe(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                code: "tst_overview",
                workbench: "user",
                error: expect.stringContaining("DB connection failed"),
            }),
            "[dashboard-seeder] failed to upsert dashboard",
        );
    });

    it("should return correct result with empty directory", async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), "seeder-empty-"));

        const result = await seeder.seed(tmpDir);

        expect(result.seeded).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.files).toBe(0);
    });

    it("should use default sort_order 100 when not specified", async () => {
        const contribution = makeContribution({
            dashboards: [
                {
                    code: "tst_nosort",
                    title_key: "nosort.title",
                    workbenches: ["admin"],
                    // No sort_order
                    acl: [{ principal_type: "persona", principal_key: "agent", permission: "view" }],
                    layout: { schema_version: 1, columns: 12, row_height: 80, items: [] },
                },
            ],
        });

        const tmpDir = createTempDir([
            { path: "mod/dashboard.contribution.json", content: contribution },
        ]);

        await seeder.seed(tmpDir);

        expect(mockRepo.upsertSystem.mock.calls[0][0].sortOrder).toBe(100);
    });

    it("should find real contribution files in the project services directory", () => {
        // Verify the seeder can find the actual 29 contribution files
        const servicesDir = join(__dirname, "../../../");
        const files = seeder.findContributionFiles(servicesDir);

        expect(files.length).toBeGreaterThanOrEqual(29);
        expect(files.every((f) => f.endsWith("dashboard.contribution.json"))).toBe(true);
    });
});
