/**
 * Widget type definitions — code-owned widget registry types.
 */

import type { z } from "zod";

// ─────────────────────────────────────────────
// Widget type enumeration
// ─────────────────────────────────────────────

export const WIDGET_TYPES = [
    "heading",
    "spacer",
    "shortcut",
    "kpi",
    "list",
    "chart",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

// ─────────────────────────────────────────────
// Widget definition (registered in WidgetRegistry)
// ─────────────────────────────────────────────

export interface WidgetDefinition<TParams = Record<string, unknown>> {
    /** Unique widget type key */
    type: WidgetType;
    /** Display name i18n key */
    labelKey: string;
    /** Description i18n key */
    descriptionKey: string;
    /** Icon name (lucide) */
    icon: string;
    /** Zod schema for param validation */
    paramsSchema: z.ZodType<TParams>;
    /** Default grid size when adding to layout */
    defaultGrid: { w: number; h: number };
}

// ─────────────────────────────────────────────
// Widget params (per widget type)
// ─────────────────────────────────────────────

export interface HeadingParams {
    text_key: string;
    level: "h1" | "h2" | "h3" | "h4";
}

export interface SpacerParams {
    height: "sm" | "md" | "lg";
}

export interface ShortcutParams {
    label_key: string;
    href: string;
    icon?: string;
    description_key?: string;
}

export interface KpiParams {
    label_key: string;
    query_key: string;
    format: "number" | "currency" | "percent";
    trend_query_key?: string;
    currency_code?: string;
}

export interface ListParams {
    title_key: string;
    query_key: string;
    columns: string[];
    page_size: number;
    link_template?: string;
}

export interface ChartParams {
    title_key: string;
    query_key: string;
    chart_type: "bar" | "line" | "area" | "pie";
    config?: Record<string, unknown>;
}
