"use client";

// components/mesh/list/preset-api.ts
//
// Async API client for saved view presets.
// Replaces localStorage-based preset-storage.ts with BFF API calls.

import type { SessionBootstrap } from "@/lib/session-bootstrap";
import type { PresetScope, ViewPreset } from "./types";

// ─── CSRF Helper ────────────────────────────────────────────

function getCsrfHeaders(): Record<string, string> {
    if (typeof window === "undefined") return {};
    const bootstrap = (window as unknown as { __SESSION_BOOTSTRAP__?: SessionBootstrap }).__SESSION_BOOTSTRAP__;
    const csrfToken = bootstrap?.csrfToken ?? "";
    if (csrfToken) return { "x-csrf-token": csrfToken };
    return {};
}

// ─── Scope Mapping ───────────────────────────────────────────

function dbScopeToPreset(scope: string): PresetScope {
    switch (scope) {
        case "SYSTEM": return "tenant";
        case "SHARED": return "team";
        default: return "personal";
    }
}

function presetScopeToDb(scope: PresetScope | undefined): string {
    switch (scope) {
        case "tenant": return "SYSTEM";
        case "team": return "SHARED";
        default: return "USER";
    }
}

// ─── API Response Types ──────────────────────────────────────

interface ApiViewMeta {
    id: string;
    entity_key: string;
    scope: string;
    owner_user_id: string | null;
    name: string;
    is_pinned: boolean;
    is_default: boolean;
    state_hash: string;
    version: number;
}

interface ApiViewFull extends ApiViewMeta {
    state_json: Record<string, unknown>;
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
}

// ─── Response Mapping ────────────────────────────────────────

/** Convert a metadata-only API response to a ViewPreset (no view state fields). */
function metaToPreset(meta: ApiViewMeta): ViewPreset {
    return {
        id: meta.id,
        label: meta.name,
        scope: dbScopeToPreset(meta.scope),
        isDefault: meta.is_default,
        version: meta.version,
    };
}

/** Convert a full API response (with state_json) to a ViewPreset. */
function fullToPreset(view: ApiViewFull): ViewPreset {
    const state = view.state_json ?? {};
    return {
        id: view.id,
        label: view.name,
        scope: dbScopeToPreset(view.scope),
        isDefault: view.is_default,
        version: view.version,
        viewMode: state.viewMode as ViewPreset["viewMode"],
        filters: state.filters as ViewPreset["filters"],
        search: state.search as ViewPreset["search"],
        sortRules: state.sortRules as ViewPreset["sortRules"],
        groupBy: state.groupBy as ViewPreset["groupBy"],
        columnVisibility: state.columnVisibility as ViewPreset["columnVisibility"],
        columnOrder: state.columnOrder as ViewPreset["columnOrder"],
        columnSizing: state.columnSizing as ViewPreset["columnSizing"],
        filterBarFields: state.filterBarFields as ViewPreset["filterBarFields"],
        density: state.density as ViewPreset["density"],
        pageSize: state.pageSize as ViewPreset["pageSize"],
        showPreview: state.showPreview as ViewPreset["showPreview"],
    };
}

/** Extract the view state fields from a ViewPreset for storage in state_json. */
function presetToStateJson(preset: ViewPreset): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    if (preset.viewMode !== undefined) state.viewMode = preset.viewMode;
    if (preset.filters !== undefined) state.filters = preset.filters;
    if (preset.search !== undefined) state.search = preset.search;
    if (preset.sortRules !== undefined) state.sortRules = preset.sortRules;
    if (preset.groupBy !== undefined) state.groupBy = preset.groupBy;
    if (preset.columnVisibility !== undefined) state.columnVisibility = preset.columnVisibility;
    if (preset.columnOrder !== undefined) state.columnOrder = preset.columnOrder;
    if (preset.columnSizing !== undefined) state.columnSizing = preset.columnSizing;
    if (preset.filterBarFields !== undefined) state.filterBarFields = preset.filterBarFields;
    if (preset.density !== undefined) state.density = preset.density;
    if (preset.pageSize !== undefined) state.pageSize = preset.pageSize;
    if (preset.showPreview !== undefined) state.showPreview = preset.showPreview;
    return state;
}

// ─── API Functions ───────────────────────────────────────────

/**
 * Fetch all saved view presets for an entity.
 * Returns metadata-only presets (no view state). Use `fetchPresetFull` to load state.
 */
export async function fetchPresets(entityKey: string): Promise<ViewPreset[]> {
    const res = await fetch(`/api/ui/views?entity_key=${encodeURIComponent(entityKey)}`);
    const json = (await res.json()) as ApiResponse<ApiViewMeta[]>;

    if (!json.success || !json.data) return [];
    return json.data.map(metaToPreset);
}

/**
 * Fetch a single saved view with full state_json payload.
 */
export async function fetchPresetFull(viewId: string): Promise<ViewPreset | null> {
    const res = await fetch(`/api/ui/views/${encodeURIComponent(viewId)}`);
    const json = (await res.json()) as ApiResponse<ApiViewFull>;

    if (!json.success || !json.data) return null;
    return fullToPreset(json.data);
}

/**
 * Create a new saved view preset.
 */
export async function createPreset(
    entityKey: string,
    preset: ViewPreset,
): Promise<ViewPreset> {
    const res = await fetch("/api/ui/views", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
            entityKey,
            name: preset.label,
            scope: presetScopeToDb(preset.scope),
            isPinned: false,
            isDefault: preset.isDefault ?? false,
            stateJson: presetToStateJson(preset),
        }),
    });

    const json = (await res.json()) as ApiResponse<ApiViewFull>;

    if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to create preset");
    }

    return fullToPreset(json.data);
}

/**
 * Update an existing saved view preset (optimistic concurrency).
 */
export async function updatePreset(
    viewId: string,
    preset: ViewPreset,
): Promise<ViewPreset> {
    const res = await fetch(`/api/ui/views/${encodeURIComponent(viewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({
            name: preset.label,
            isPinned: false,
            isDefault: preset.isDefault,
            stateJson: presetToStateJson(preset),
            version: preset.version ?? 1,
        }),
    });

    const json = (await res.json()) as ApiResponse<ApiViewFull>;

    if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to update preset");
    }

    return fullToPreset(json.data);
}

/**
 * Soft-delete a saved view preset.
 */
export async function removePreset(viewId: string): Promise<void> {
    const res = await fetch(`/api/ui/views/${encodeURIComponent(viewId)}`, {
        method: "DELETE",
        headers: { ...getCsrfHeaders() },
    });

    const json = (await res.json()) as ApiResponse<unknown>;

    if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to delete preset");
    }
}
