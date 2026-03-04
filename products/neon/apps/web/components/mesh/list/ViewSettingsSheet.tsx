"use client";

// components/mesh/list/ViewSettingsSheet.tsx
//
// Right-side Sheet with tabbed View/Filter/Columns/Sort/Group settings.
// Uses a buffered state pattern: changes accumulate in a local draft,
// OK commits them, Cancel discards them.
//
// Preset management (select, save, delete) is integrated via PresetBar
// and SavePresetDropdown in the header area.

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";


import { stateToPreset } from "./explorer-preset";
import { useListPage, useListPageActions } from "./ListPageContext";
import { createPreset, fetchPresetFull, fetchPresets, removePreset, updatePreset } from "./preset-api";
import { ColumnsTab } from "./settings/ColumnsTab";
import { FilterTab } from "./settings/FilterTab";
import { GroupTab } from "./settings/GroupTab";
import { PresetBar } from "./settings/PresetBar";
import { SaveAsDialog } from "./settings/SaveAsDialog";
import { SavePresetDropdown } from "./settings/SavePresetDropdown";
import { SortTab } from "./settings/SortTab";
import { ViewTab } from "./settings/ViewTab";

import type { Density, GroupRule, ListPageState, SortRule, ViewMode, ViewPreset } from "./types";

import { Button } from "@/components/ui/button";
import { removeLocalStorageValue } from "@/lib/local-storage.client";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Subset of ListPageState managed by the settings sheet. */
export interface SettingsDraft {
    viewMode: ViewMode;
    density: Density;
    filterBarFields: string[];
    columnVisibility: Record<string, boolean>;
    columnOrder: string[];
    sortRules: SortRule[];
    groupBy: GroupRule[];
}

function stateToDraft(state: ListPageState): SettingsDraft {
    return {
        viewMode: state.viewMode,
        density: state.density,
        filterBarFields: [...state.filterBarFields],
        columnVisibility: { ...state.columnVisibility },
        columnOrder: [...state.columnOrder],
        sortRules: state.sortRules.map((r) => ({ ...r })),
        groupBy: state.groupBy.map((r) => ({ ...r })),
    };
}

/** The "Default" pseudo-preset — always first in the list. */
const DEFAULT_PRESET: ViewPreset = {
    id: "__default",
    label: "Default",
    isDefault: true,
};

export function ViewSettingsSheet<T>() {
    const { state, config, capabilities } = useListPage<T>();
    const actions = useListPageActions();

    const [draft, setDraft] = useState<SettingsDraft>(() => stateToDraft(state));
    const [activeTab, setActiveTab] = useState<string>("view");

    // ── Preset state ──────────────────────────────────────────
    const [userPresets, setUserPresets] = useState<ViewPreset[]>([]);
    const [draftPresetId, setDraftPresetId] = useState<string | null>(
        state.activePresetId,
    );
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [saveAsDefaultName, setSaveAsDefaultName] = useState("My View");

    // Merge config presets + user presets with Default always first
    const allPresets = useMemo(() => {
        const configPresets = (config.presets ?? []).filter((p) => !p.isDefault);
        return [DEFAULT_PRESET, ...configPresets, ...userPresets];
    }, [config.presets, userPresets]);

    const activePreset = useMemo(
        () => allPresets.find((p) => p.id === draftPresetId) ?? null,
        [allPresets, draftPresetId],
    );

    // Simple dirty detection: compare draft fields against active preset
    const draftDirty = useMemo(() => {
        if (!activePreset || activePreset.id === "__default") {
            // Always "dirty" vs Default (no baseline to compare)
            return false;
        }
        if (activePreset.viewMode && draft.viewMode !== activePreset.viewMode) return true;
        if (activePreset.density && draft.density !== activePreset.density) return true;
        if (activePreset.sortRules) {
            const a = draft.sortRules;
            const b = activePreset.sortRules;
            if (a.length !== b.length) return true;
            if (a.some((r, i) => r.fieldId !== b[i].fieldId || r.dir !== b[i].dir)) return true;
        }
        if (activePreset.groupBy) {
            const a = draft.groupBy;
            const b = activePreset.groupBy;
            if (a.length !== b.length) return true;
            if (a.some((r, i) => r.fieldId !== b[i].fieldId)) return true;
        }
        if (activePreset.columnOrder) {
            if (draft.columnOrder.join(",") !== activePreset.columnOrder.join(",")) return true;
        }
        if (activePreset.columnVisibility) {
            for (const [k, v] of Object.entries(activePreset.columnVisibility)) {
                if (draft.columnVisibility[k] !== v) return true;
            }
        }
        return false;
    }, [draft, activePreset]);

    // Re-snapshot draft + presets whenever the sheet opens
    useEffect(() => {
        if (state.settingsOpen) {
            setDraft(stateToDraft(state));
            setActiveTab(state.settingsDefaultTab ?? "view");
            setDraftPresetId(state.activePresetId);
            // Fetch presets from API
            fetchPresets(config.basePath).then(setUserPresets).catch(() => setUserPresets([]));
        }
    }, [state.settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Preset handlers ───────────────────────────────────────

    const applyPresetToDraft = useCallback((preset: ViewPreset) => {
        setDraft((prev) => ({
            ...prev,
            viewMode: preset.viewMode ?? prev.viewMode,
            density: preset.density ?? prev.density,
            filterBarFields: preset.filterBarFields ?? prev.filterBarFields,
            columnVisibility: preset.columnVisibility ?? prev.columnVisibility,
            columnOrder: preset.columnOrder ?? prev.columnOrder,
            sortRules: preset.sortRules ?? prev.sortRules,
            groupBy: preset.groupBy ?? prev.groupBy,
        }));
    }, []);

    const handleSelectPreset = useCallback(
        (preset: ViewPreset) => {
            setDraftPresetId(preset.id);

            // API-backed presets from list endpoint lack view state — lazy-load
            if (preset.version !== undefined && preset.viewMode === undefined) {
                fetchPresetFull(preset.id).then((full) => {
                    if (full) {
                        // Update cached preset with full state
                        setUserPresets((prev) =>
                            prev.map((p) => (p.id === full.id ? full : p)),
                        );
                        applyPresetToDraft(full);
                    }
                });
            } else {
                applyPresetToDraft(preset);
            }
        },
        [applyPresetToDraft],
    );

    const handleSave = useCallback(() => {
        if (!activePreset || activePreset.scope !== "personal") return;
        const updated = stateToPreset(
            {
                ...state,
                viewMode: draft.viewMode,
                density: draft.density,
                filterBarFields: draft.filterBarFields,
                columnVisibility: draft.columnVisibility,
                columnOrder: draft.columnOrder,
                sortRules: draft.sortRules,
                groupBy: draft.groupBy,
            } as ListPageState,
            activePreset.id,
            activePreset.label,
            "personal",
        );
        updated.version = activePreset.version;
        updatePreset(activePreset.id, updated)
            .then((saved) => {
                setUserPresets((prev) =>
                    prev.map((p) => (p.id === saved.id ? saved : p)),
                );
            })
            .catch((err) => console.error("[ViewSettings] Save failed:", err));
    }, [activePreset, state, draft]);

    const handleSaveAs = useCallback(
        (name: string) => {
            const preset = stateToPreset(
                {
                    ...state,
                    viewMode: draft.viewMode,
                    density: draft.density,
                    filterBarFields: draft.filterBarFields,
                    columnVisibility: draft.columnVisibility,
                    columnOrder: draft.columnOrder,
                    sortRules: draft.sortRules,
                    groupBy: draft.groupBy,
                } as ListPageState,
                "", // id will be assigned by the server
                name,
                "personal",
            );
            createPreset(config.basePath, preset)
                .then((saved) => {
                    setUserPresets((prev) => [...prev, saved]);
                    setDraftPresetId(saved.id);
                    setSaveAsOpen(false);
                })
                .catch((err) => console.error("[ViewSettings] Save As failed:", err));
        },
        [state, draft, config.basePath],
    );

    const handleDeletePreset = useCallback(
        (presetId: string) => {
            removePreset(presetId)
                .then(() => {
                    setUserPresets((prev) => prev.filter((p) => p.id !== presetId));
                    if (draftPresetId === presetId) {
                        setDraftPresetId(null);
                    }
                })
                .catch((err) => console.error("[ViewSettings] Delete failed:", err));
        },
        [draftPresetId],
    );

    // ── Settings handlers ─────────────────────────────────────

    const handleOk = useCallback(() => {
        actions.applySettings({
            viewMode: draft.viewMode,
            density: draft.density,
            filterBarFields: draft.filterBarFields,
            columnVisibility: draft.columnVisibility,
            columnOrder: draft.columnOrder,
            sortRules: draft.sortRules,
            sortKey: draft.sortRules[0]?.fieldId ?? null,
            sortDir: draft.sortRules[0]?.dir ?? "asc",
            groupBy: draft.groupBy,
            activePresetId: draftPresetId,
        });
    }, [draft, draftPresetId, actions]);

    const handleCancel = useCallback(() => {
        actions.closeSettings();
    }, [actions]);

    const handleReset = useCallback(() => {
        const columnVisibility: Record<string, boolean> = {};
        for (const col of config.columns) {
            columnVisibility[col.id] = !col.hidden;
        }

        // Resolve responsive defaults based on current viewport
        const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
        const viewMode = isDesktop
            ? (config.defaultViewModeDesktop ?? config.defaultViewMode ?? "table")
            : (config.defaultViewMode ?? "card-grid");
        const density = isDesktop
            ? (config.defaultDensityDesktop ?? config.defaultDensity ?? "comfortable")
            : (config.defaultDensity ?? "comfortable");

        setDraft({
            viewMode,
            density,
            filterBarFields: [],
            columnVisibility,
            columnOrder: config.columns.map((c) => c.id),
            sortRules: [],
            groupBy: [],
        });
        setDraftPresetId(null);

        // Clear localStorage overrides so responsive defaults apply on next load
        removeLocalStorageValue(`neon:viewMode:${config.basePath}`);
        removeLocalStorageValue(`neon:viewMode:${config.basePath}:userSet`);
        removeLocalStorageValue(`neon:density:${config.basePath}`);
        removeLocalStorageValue(`neon:density:${config.basePath}:userSet`);
    }, [config.columns, config.basePath, config.defaultViewMode, config.defaultViewModeDesktop, config.defaultDensity, config.defaultDensityDesktop]);

    // Draft updaters
    const updateViewMode = useCallback(
        (mode: ViewMode) =>
            setDraft((prev) => ({ ...prev, viewMode: mode })),
        [],
    );

    const updateDensity = useCallback(
        (density: Density) =>
            setDraft((prev) => ({ ...prev, density })),
        [],
    );

    const updateFilterBarFields = useCallback(
        (fields: string[]) =>
            setDraft((prev) => ({ ...prev, filterBarFields: fields })),
        [],
    );

    const updateColumnVisibility = useCallback(
        (vis: Record<string, boolean>) =>
            setDraft((prev) => ({ ...prev, columnVisibility: vis })),
        [],
    );

    const updateColumnOrder = useCallback(
        (order: string[]) =>
            setDraft((prev) => ({ ...prev, columnOrder: order })),
        [],
    );

    const updateSortRules = useCallback(
        (rules: SortRule[]) =>
            setDraft((prev) => ({ ...prev, sortRules: rules })),
        [],
    );

    const updateGroupBy = useCallback(
        (rules: GroupRule[]) =>
            setDraft((prev) => ({ ...prev, groupBy: rules })),
        [],
    );

    // Determine which tabs to show
    const hasFilterableFields = config.quickFilters.length > 0 || config.columns.some((c) => c.filterable);
    const hasSortableColumns = config.columns.some((c) => c.sortKey);
    const hasGroupableColumns = capabilities.groupableColumns.length > 0;

    return (
        <>
            <Sheet open={state.settingsOpen} onOpenChange={(open) => {
                if (!open) handleCancel();
            }}>
                <SheetContent side="right" className="flex w-full flex-col sm:max-w-md" showCloseButton={false}>
                    <SheetHeader className="flex-row items-center justify-between space-y-0">
                        <div>
                            <SheetTitle className="text-base">View Settings</SheetTitle>
                            <SheetDescription className="sr-only">
                                Configure view mode, columns, sorting, and grouping.
                            </SheetDescription>
                        </div>
                        <div className="flex items-center gap-1">
                            <SavePresetDropdown
                                activePreset={activePreset}
                                isDirty={draftDirty}
                                onSave={handleSave}
                                onSaveAs={() => {
                                    setSaveAsDefaultName(
                                        activePreset?.label
                                            ? `${activePreset.label} (copy)`
                                            : "My View",
                                    );
                                    setSaveAsOpen(true);
                                }}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={handleReset}
                            >
                                <RotateCcw className="size-3" />
                                Reset
                            </Button>
                        </div>
                    </SheetHeader>

                    {/* Preset chips bar */}
                    <PresetBar
                        allPresets={allPresets}
                        activePresetId={draftPresetId}
                        isDirty={draftDirty}
                        onSelectPreset={handleSelectPreset}
                        onDeletePreset={handleDeletePreset}
                    />

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                        <TabsList className="w-full shrink-0">
                            <TabsTrigger value="view" className="flex-1 text-xs">
                                View
                            </TabsTrigger>
                            {hasFilterableFields && (
                                <TabsTrigger value="filter" className="flex-1 text-xs">
                                    Filter
                                    {draft.filterBarFields.length > 0 && (
                                        <span className="ml-1 text-[10px] text-muted-foreground">
                                            ({draft.filterBarFields.length})
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="columns" className="flex-1 text-xs">
                                Columns
                            </TabsTrigger>
                            {hasSortableColumns && (
                                <TabsTrigger value="sort" className="flex-1 text-xs">
                                    Sort
                                    {draft.sortRules.length > 0 && (
                                        <span className="ml-1 text-[10px] text-muted-foreground">
                                            ({draft.sortRules.length})
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {hasGroupableColumns && (
                                <TabsTrigger value="group" className="flex-1 text-xs">
                                    Group
                                    {draft.groupBy.length > 0 && (
                                        <span className="ml-1 text-[10px] text-muted-foreground">
                                            ({draft.groupBy.length})
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="view" className="min-h-0 flex-1 overflow-y-auto">
                            <ViewTab
                                viewMode={draft.viewMode}
                                density={draft.density}
                                config={config}
                                capabilities={capabilities}
                                onViewModeChange={updateViewMode}
                                onDensityChange={updateDensity}
                            />
                        </TabsContent>

                        {hasFilterableFields && (
                            <TabsContent value="filter" className="min-h-0 flex-1 overflow-y-auto">
                                <FilterTab
                                    quickFilters={config.quickFilters}
                                    columns={config.columns}
                                    filterBarFields={draft.filterBarFields}
                                    onFilterBarFieldsChange={updateFilterBarFields}
                                />
                            </TabsContent>
                        )}

                        <TabsContent value="columns" className="min-h-0 flex-1 overflow-y-auto">
                            <ColumnsTab
                                columns={config.columns}
                                columnVisibility={draft.columnVisibility}
                                columnOrder={draft.columnOrder}
                                onVisibilityChange={updateColumnVisibility}
                                onOrderChange={updateColumnOrder}
                            />
                        </TabsContent>

                        {hasSortableColumns && (
                            <TabsContent value="sort" className="min-h-0 flex-1 overflow-y-auto">
                                <SortTab
                                    columns={config.columns}
                                    sortRules={draft.sortRules}
                                    onSortRulesChange={updateSortRules}
                                />
                            </TabsContent>
                        )}

                        {hasGroupableColumns && (
                            <TabsContent value="group" className="min-h-0 flex-1 overflow-y-auto">
                                <GroupTab
                                    columns={config.columns}
                                    columnVisibility={draft.columnVisibility}
                                    groupBy={draft.groupBy}
                                    groupableColumns={capabilities.groupableColumns}
                                    onGroupByChange={updateGroupBy}
                                />
                            </TabsContent>
                        )}
                    </Tabs>

                    <SheetFooter className="flex-row justify-end gap-2 border-t pt-4">
                        <Button variant="outline" size="sm" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleOk}>
                            OK
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            <SaveAsDialog
                open={saveAsOpen}
                defaultName={saveAsDefaultName}
                onOpenChange={setSaveAsOpen}
                onSave={handleSaveAs}
            />
        </>
    );
}
