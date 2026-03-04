/**
 * Zod validation schemas for widget parameters.
 * Each widget type has a corresponding param schema.
 */

import { z } from "zod";

// ─────────────────────────────────────────────
// Heading widget
// ─────────────────────────────────────────────
export const headingParamsSchema = z.object({
    text_key: z.string().min(1),
    level: z.enum(["h1", "h2", "h3", "h4"]),
});

// ─────────────────────────────────────────────
// Spacer widget
// ─────────────────────────────────────────────
export const spacerParamsSchema = z.object({
    height: z.enum(["sm", "md", "lg"]),
});

// ─────────────────────────────────────────────
// Shortcut widget
// ─────────────────────────────────────────────
export const shortcutParamsSchema = z.object({
    label_key: z.string().min(1),
    href: z.string().min(1),
    icon: z.string().optional(),
    description_key: z.string().optional(),
});

// ─────────────────────────────────────────────
// KPI widget
// ─────────────────────────────────────────────
export const kpiParamsSchema = z.object({
    label_key: z.string().min(1),
    query_key: z.string().min(1),
    format: z.enum(["number", "currency", "percent"]),
    trend_query_key: z.string().optional(),
    currency_code: z.string().optional(),
});

// ─────────────────────────────────────────────
// List widget
// ─────────────────────────────────────────────
export const listParamsSchema = z.object({
    title_key: z.string().min(1),
    query_key: z.string().min(1),
    columns: z.array(z.string()).min(1),
    page_size: z.number().int().min(1).max(100).default(10),
    link_template: z.string().optional(),
});

// ─────────────────────────────────────────────
// Chart widget
// ─────────────────────────────────────────────
export const chartParamsSchema = z.object({
    title_key: z.string().min(1),
    query_key: z.string().min(1),
    chart_type: z.enum(["bar", "line", "area", "pie"]),
    config: z.record(z.unknown()).optional(),
});

// ─────────────────────────────────────────────
// Param schema map (by widget type)
// ─────────────────────────────────────────────
export const widgetParamsSchemaMap = {
    heading: headingParamsSchema,
    spacer: spacerParamsSchema,
    shortcut: shortcutParamsSchema,
    kpi: kpiParamsSchema,
    list: listParamsSchema,
    chart: chartParamsSchema,
} as const;
