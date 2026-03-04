/**
 * Dashboard Contribution Seeder
 *
 * Scans for dashboard.contribution.json files across all modules,
 * validates them against the Zod schema, and upserts system dashboards
 * into the database. Runs once at boot during the contribute() phase.
 *
 * Idempotent: existing system dashboards are left as-is.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { dashboardContributionSchema } from "@athyper/dashboard";

import type { DashboardRepository } from "./dashboard.repository.js";
import type { Logger } from "../../../kernel/logger.js";

export interface SeedResult {
    seeded: number;
    errors: number;
    files: number;
}

export class DashboardContributionSeeder {
    constructor(
        private repo: DashboardRepository,
        private logger: Logger,
    ) {}

    /**
     * Scan servicesDir for dashboard.contribution.json files,
     * parse/validate, and upsert each dashboard × workbench into the DB.
     */
    async seed(servicesDir: string): Promise<SeedResult> {
        const files = this.findContributionFiles(servicesDir);
        this.logger.info(
            { count: files.length },
            "[dashboard-seeder] found contribution files",
        );

        let seeded = 0;
        let errors = 0;

        for (const file of files) {
            try {
                const raw = JSON.parse(readFileSync(file, "utf-8"));
                const contribution = dashboardContributionSchema.parse(raw);

                for (const dashboard of contribution.dashboards) {
                    for (const workbench of dashboard.workbenches) {
                        try {
                            await this.repo.upsertSystem({
                                code: dashboard.code,
                                titleKey: dashboard.title_key,
                                descriptionKey: dashboard.description_key,
                                moduleCode: contribution.module_code,
                                workbench,
                                icon: dashboard.icon,
                                sortOrder: dashboard.sort_order ?? 100,
                                layout: dashboard.layout,
                                acl: dashboard.acl.map((a) => ({
                                    principalType: a.principal_type,
                                    principalKey: a.principal_key,
                                    permission: a.permission,
                                })),
                                createdBy: "system",
                            });
                            seeded++;
                        } catch (err) {
                            this.logger.warn(
                                { code: dashboard.code, workbench, error: String(err) },
                                "[dashboard-seeder] failed to upsert dashboard",
                            );
                            errors++;
                        }
                    }
                }
            } catch (err) {
                this.logger.warn(
                    { file, error: String(err) },
                    "[dashboard-seeder] failed to parse contribution file",
                );
                errors++;
            }
        }

        this.logger.info(
            { seeded, errors, files: files.length },
            "[dashboard-seeder] seeding complete",
        );

        return { seeded, errors, files: files.length };
    }

    /**
     * Recursively find all dashboard.contribution.json files under baseDir.
     */
    findContributionFiles(baseDir: string): string[] {
        const results: string[] = [];

        function walk(dir: string) {
            let entries: string[];
            try {
                entries = readdirSync(dir);
            } catch {
                return; // skip unreadable directories
            }

            for (const entry of entries) {
                const full = join(dir, entry);
                try {
                    const stat = statSync(full);
                    if (stat.isDirectory()) {
                        walk(full);
                    } else if (entry === "dashboard.contribution.json") {
                        results.push(full);
                    }
                } catch {
                    // skip unreadable entries
                }
            }
        }

        walk(baseDir);
        return results;
    }
}
