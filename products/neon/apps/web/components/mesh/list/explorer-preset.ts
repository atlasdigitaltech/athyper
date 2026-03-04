// components/mesh/list/explorer-preset.ts
//
// Zod-validated explorer preset schema.
// Handles serialization, deserialization, and dirty detection for view presets.

import { z } from "zod";

import type {
    GroupRule,
    ListPageState,
    PresetScope,
    SortRule,
    ViewPreset,
} from "./types";

// ─── Zod Schemas ────────────────────────────────────────────

const ViewModeSchema = z.enum(["table", "table-columns", "card-grid", "kanban", "timeline"]);
const DensitySchema = z.enum(["compact", "comfortable", "spacious"]);
const PresetScopeSchema = z.enum(["personal", "team", "tenant"]);

const SortRuleSchema = z.object({
    fieldId: z.string(),
    dir: z.enum(["asc", "desc"]),
});

const GroupRuleSchema = z.object({
    fieldId: z.string(),
    dir: z.enum(["asc", "desc"]).optional(),
    collapsed: z.boolean().optional(),
});

export const ExplorerPresetSchema = z.object({
    id: z.string(),
    label: z.string(),
    scope: PresetScopeSchema.optional(),
    viewMode: ViewModeSchema.optional(),
    filters: z.record(z.string()).optional(),
    search: z.string().optional(),
    sortKey: z.string().nullable().optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    sortRules: z.array(SortRuleSchema).optional(),
    groupBy: z.array(GroupRuleSchema).optional(),
    columnVisibility: z.record(z.boolean()).optional(),
    columnOrder: z.array(z.string()).optional(),
    columnSizing: z.record(z.number()).optional(),
    filterBarFields: z.array(z.string()).optional(),
    density: DensitySchema.optional(),
    pageSize: z.number().int().positive().optional(),
    showPreview: z.boolean().optional(),
    isDefault: z.boolean().optional(),
});

export type ExplorerPresetInput = z.input<typeof ExplorerPresetSchema>;

// ─── Serialization ──────────────────────────────────────────

/** Serialize a preset for storage. Strips undefined values. */
export function serializePreset(preset: ViewPreset): string {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(preset)) {
        if (v !== undefined) clean[k] = v;
    }
    return JSON.stringify(clean);
}

/** Deserialize and validate a preset from storage. Returns null on invalid data. */
export function deserializePreset(raw: string): ViewPreset | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        const result = ExplorerPresetSchema.safeParse(parsed);
        return result.success ? result.data : null;
    } catch {
        return null;
    }
}

// ─── State ↔ Preset Conversion ──────────────────────────────

/** Extract a ViewPreset snapshot from current state. */
export function stateToPreset(
    state: ListPageState,
    id: string,
    label: string,
    scope: PresetScope = "personal",
): ViewPreset {
    return {
        id,
        label,
        scope,
        viewMode: state.viewMode,
        filters: { ...state.filters },
        search: state.search || undefined,
        sortRules: state.sortRules.length > 0 ? [...state.sortRules] : undefined,
        groupBy: state.groupBy.length > 0 ? [...state.groupBy] : undefined,
        columnVisibility: { ...state.columnVisibility },
        columnOrder: [...state.columnOrder],
        columnSizing: Object.keys(state.columnSizing).length > 0
            ? { ...state.columnSizing }
            : undefined,
        filterBarFields: state.filterBarFields.length > 0
            ? [...state.filterBarFields]
            : undefined,
        density: state.density !== "comfortable" ? state.density : undefined,
        pageSize: state.pageSize !== 25 ? state.pageSize : undefined,
    };
}

// ─── Dirty Detection ────────────────────────────────────────

/** Check if current state has diverged from the given preset baseline. */
export function isPresetDirty(state: ListPageState, preset: ViewPreset | null): boolean {
    if (!preset) return false;

    // View mode
    if (preset.viewMode && state.viewMode !== preset.viewMode) return true;

    // Filters
    if (preset.filters) {
        const pf = preset.filters;
        const sf = state.filters;
        const allKeys = new Set([...Object.keys(pf), ...Object.keys(sf)]);
        for (const k of allKeys) {
            if ((pf[k] ?? "") !== (sf[k] ?? "")) return true;
        }
    }

    // Search
    if (preset.search !== undefined && state.search !== preset.search) return true;

    // Multi-sort
    if (preset.sortRules) {
        if (!sortRulesEqual(state.sortRules, preset.sortRules)) return true;
    } else if (preset.sortKey !== undefined) {
        // Legacy single-sort check
        if (state.sortKey !== preset.sortKey) return true;
        if (preset.sortDir && state.sortDir !== preset.sortDir) return true;
    }

    // Group-by
    if (preset.groupBy && !groupRulesEqual(state.groupBy, preset.groupBy)) return true;

    // Column visibility
    if (preset.columnVisibility) {
        for (const [k, v] of Object.entries(preset.columnVisibility)) {
            if (state.columnVisibility[k] !== v) return true;
        }
    }

    // Column order
    if (preset.columnOrder) {
        if (state.columnOrder.join(",") !== preset.columnOrder.join(",")) return true;
    }

    // Density
    if (preset.density && state.density !== preset.density) return true;

    // Page size
    if (preset.pageSize && state.pageSize !== preset.pageSize) return true;

    return false;
}

function sortRulesEqual(a: SortRule[], b: SortRule[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((r, i) => r.fieldId === b[i].fieldId && r.dir === b[i].dir);
}

function groupRulesEqual(a: GroupRule[], b: GroupRule[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((r, i) => r.fieldId === b[i].fieldId && (r.dir ?? "asc") === (b[i].dir ?? "asc"));
}
