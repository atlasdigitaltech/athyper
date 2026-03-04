/**
 * Standard widget definitions — Phase 1 widget types.
 *
 * Registers the core set of widgets available to all dashboards:
 * heading, spacer, shortcut, kpi, list, chart.
 */

import {
    chartParamsSchema,
    headingParamsSchema,
    kpiParamsSchema,
    listParamsSchema,
    shortcutParamsSchema,
    spacerParamsSchema,
} from "../schemas/widget-params.schema.js";

import { WidgetRegistry } from "./widget-registry.js";

import type { WidgetDefinition } from "../types/widget.types.js";

// ─────────────────────────────────────────────
// Widget Definitions
// ─────────────────────────────────────────────

const headingWidget: WidgetDefinition = {
    type: "heading",
    labelKey: "widget.heading.label",
    descriptionKey: "widget.heading.description",
    icon: "type",
    paramsSchema: headingParamsSchema,
    defaultGrid: { w: 12, h: 1 },
};

const spacerWidget: WidgetDefinition = {
    type: "spacer",
    labelKey: "widget.spacer.label",
    descriptionKey: "widget.spacer.description",
    icon: "minus",
    paramsSchema: spacerParamsSchema,
    defaultGrid: { w: 12, h: 1 },
};

const shortcutWidget: WidgetDefinition = {
    type: "shortcut",
    labelKey: "widget.shortcut.label",
    descriptionKey: "widget.shortcut.description",
    icon: "external-link",
    paramsSchema: shortcutParamsSchema,
    defaultGrid: { w: 3, h: 2 },
};

const kpiWidget: WidgetDefinition = {
    type: "kpi",
    labelKey: "widget.kpi.label",
    descriptionKey: "widget.kpi.description",
    icon: "hash",
    paramsSchema: kpiParamsSchema,
    defaultGrid: { w: 3, h: 2 },
};

const listWidget: WidgetDefinition = {
    type: "list",
    labelKey: "widget.list.label",
    descriptionKey: "widget.list.description",
    icon: "list",
    paramsSchema: listParamsSchema,
    defaultGrid: { w: 6, h: 4 },
};

const chartWidget: WidgetDefinition = {
    type: "chart",
    labelKey: "widget.chart.label",
    descriptionKey: "widget.chart.description",
    icon: "bar-chart-2",
    paramsSchema: chartParamsSchema,
    defaultGrid: { w: 6, h: 4 },
};

// ─────────────────────────────────────────────
// Factory: create a pre-populated registry
// ─────────────────────────────────────────────

export function createStandardWidgetRegistry(): WidgetRegistry {
    const registry = new WidgetRegistry();
    registry.register(headingWidget);
    registry.register(spacerWidget);
    registry.register(shortcutWidget);
    registry.register(kpiWidget);
    registry.register(listWidget);
    registry.register(chartWidget);
    return registry;
}

export const standardWidgets: WidgetDefinition[] = [
    headingWidget,
    spacerWidget,
    shortcutWidget,
    kpiWidget,
    listWidget,
    chartWidget,
];
