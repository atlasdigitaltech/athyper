"use client";

// components/mesh/list/ViewPresetSelector.tsx
//
// Dropdown button for applying, saving, and managing view presets.
// Shows dirty indicator when state has diverged from active preset.

import {
    Check,
    ChevronDown,
    Copy,
    RotateCcw,
    Save,
    Settings2,
    Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isPresetDirty, stateToPreset } from "./explorer-preset";
import { useListPage, useListPageActions } from "./ListPageContext";
import { deletePreset, loadPresets, savePreset } from "./preset-storage";

import type { ViewPreset } from "./types";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";



export function ViewPresetSelector<T>() {
    const { state, config } = useListPage<T>();
    const actions = useListPageActions();

    // Merge config presets + user-saved presets
    const [userPresets, setUserPresets] = useState<ViewPreset[]>([]);
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState("");

    // Load user presets on mount
    useEffect(() => {
        setUserPresets(loadPresets(config.basePath));
    }, [config.basePath]);

    const allPresets = useMemo(() => {
        const configPresets = config.presets ?? [];
        return [...configPresets, ...userPresets];
    }, [config.presets, userPresets]);

    const activePreset = allPresets.find((p) => p.id === state.activePresetId);
    const label = activePreset?.label ?? "Default";
    const dirty = isPresetDirty(state, activePreset ?? null);

    // Sync dirty state
    useEffect(() => {
        if (state.presetDirty !== dirty) {
            actions.setPresetDirty(dirty);
        }
    }, [dirty, state.presetDirty, actions]);

    const handleSave = useCallback(() => {
        if (!activePreset || activePreset.scope !== "personal") return;
        const updated = stateToPreset(state, activePreset.id, activePreset.label, "personal");
        savePreset(config.basePath, updated);
        setUserPresets(loadPresets(config.basePath));
        actions.setPresetDirty(false);
    }, [activePreset, state, config.basePath, actions]);

    const handleSaveAs = useCallback(() => {
        if (!saveAsName.trim()) return;
        const id = `user_${Date.now()}`;
        const preset = stateToPreset(state, id, saveAsName.trim(), "personal");
        savePreset(config.basePath, preset);
        setUserPresets(loadPresets(config.basePath));
        actions.applyPreset(preset);
        setSaveAsOpen(false);
        setSaveAsName("");
    }, [saveAsName, state, config.basePath, actions]);

    const handleDelete = useCallback((presetId: string) => {
        deletePreset(config.basePath, presetId);
        setUserPresets(loadPresets(config.basePath));
        if (state.activePresetId === presetId) {
            actions.applyPreset({
                id: "__default",
                label: "Default",
                isDefault: true,
            });
        }
    }, [config.basePath, state.activePresetId, actions]);

    if (allPresets.length === 0 && !dirty) return null;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5">
                        <span className="text-xs">{label}</span>
                        {dirty && (
                            <span className="size-1.5 rounded-full bg-amber-500" />
                        )}
                        <ChevronDown className="size-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                    {/* Preset list */}
                    {allPresets.map((preset) => (
                        <DropdownMenuItem
                            key={preset.id}
                            onClick={() => actions.applyPreset(preset)}
                            className="flex items-center justify-between text-xs"
                        >
                            <span className="flex items-center gap-2">
                                {preset.label}
                                {preset.scope === "personal" && (
                                    <span className="text-[10px] text-muted-foreground">(mine)</span>
                                )}
                            </span>
                            {state.activePresetId === preset.id && (
                                <Check className="size-3 text-primary" />
                            )}
                        </DropdownMenuItem>
                    ))}

                    <DropdownMenuSeparator />

                    {/* Save (only if active preset is personal and dirty) */}
                    {activePreset?.scope === "personal" && dirty && (
                        <DropdownMenuItem onClick={handleSave} className="gap-2 text-xs">
                            <Save className="size-3" />
                            Save
                        </DropdownMenuItem>
                    )}

                    {/* Save As */}
                    <DropdownMenuItem
                        onClick={() => {
                            setSaveAsName(activePreset?.label ? `${activePreset.label} (copy)` : "My View");
                            setSaveAsOpen(true);
                        }}
                        className="gap-2 text-xs"
                    >
                        <Copy className="size-3" />
                        Save As...
                    </DropdownMenuItem>

                    {/* Manage */}
                    {userPresets.length > 0 && (
                        <DropdownMenuItem
                            onClick={() => setManageOpen(true)}
                            className="gap-2 text-xs"
                        >
                            <Settings2 className="size-3" />
                            Manage Presets...
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* Reset */}
                    <DropdownMenuItem
                        onClick={() => {
                            actions.clearFilters();
                            actions.applyPreset({
                                id: "__default",
                                label: "Default",
                                isDefault: true,
                            });
                        }}
                        className="gap-2 text-xs"
                    >
                        <RotateCcw className="size-3" />
                        Reset to Default
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Save As Dialog */}
            <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Save View As</DialogTitle>
                        <DialogDescription>
                            Save the current view settings as a personal preset.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                        <Label htmlFor="preset-name">Preset Name</Label>
                        <Input
                            id="preset-name"
                            value={saveAsName}
                            onChange={(e) => setSaveAsName(e.target.value)}
                            placeholder="My View"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveAs();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setSaveAsOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveAs} disabled={!saveAsName.trim()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage Presets Dialog */}
            <Dialog open={manageOpen} onOpenChange={setManageOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Manage Presets</DialogTitle>
                        <DialogDescription>
                            Rename or delete your personal view presets.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        {userPresets.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No personal presets yet.</p>
                        ) : (
                            userPresets.map((preset) => (
                                <div
                                    key={preset.id}
                                    className="flex items-center justify-between rounded-md border px-3 py-2"
                                >
                                    <span className="text-sm">{preset.label}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        onClick={() => handleDelete(preset.id)}
                                    >
                                        <Trash2 className="size-3.5 text-destructive" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setManageOpen(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
