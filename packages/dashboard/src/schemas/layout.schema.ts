/**
 * Zod schema for dashboard layout JSON validation.
 */

import { z } from "zod";

export const gridPositionSchema = z.object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1),
});

export const layoutItemSchema = z.object({
    id: z.string().min(1),
    widget_type: z.string().min(1),
    params: z.record(z.unknown()),
    grid: gridPositionSchema,
});

export const dashboardLayoutSchema = z.object({
    schema_version: z.literal(1),
    columns: z.literal(12),
    row_height: z.number().int().min(20).max(200),
    items: z.array(layoutItemSchema),
});

export type DashboardLayoutInput = z.input<typeof dashboardLayoutSchema>;

export const dashboardExportSchema = z.object({
    $schema: z.literal("athyper-dashboard-export-v1"),
    exportedAt: z.string(),
    dashboard: z.object({
        code: z.string().min(1),
        titleKey: z.string().min(1),
        descriptionKey: z.string().optional(),
        moduleCode: z.string().min(1),
        icon: z.string().optional(),
    }),
    layout: dashboardLayoutSchema,
});
