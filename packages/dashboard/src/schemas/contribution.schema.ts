/**
 * Zod schema for dashboard.contribution.json validation.
 */

import { z } from "zod";

import { dashboardLayoutSchema } from "./layout.schema.js";

const aclEntrySchema = z.object({
    principal_type: z.enum(["role", "group", "user", "persona"]),
    principal_key: z.string().min(1),
    permission: z.enum(["view", "edit"]),
});

const dashboardEntrySchema = z.object({
    code: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "Dashboard code must be lowercase alphanumeric with underscores"),
    title_key: z.string().min(1),
    description_key: z.string().optional(),
    icon: z.string().optional(),
    workbenches: z.array(z.enum(["user", "admin", "partner"])).min(1),
    sort_order: z.number().int().optional(),
    acl: z.array(aclEntrySchema).min(1),
    layout: dashboardLayoutSchema,
});

export const dashboardContributionSchema = z.object({
    $schema: z.string().optional(),
    module_code: z.string().min(1).max(10),
    module_name: z.string().min(1),
    dashboards: z.array(dashboardEntrySchema).min(1),
});

export type DashboardContributionInput = z.input<typeof dashboardContributionSchema>;
