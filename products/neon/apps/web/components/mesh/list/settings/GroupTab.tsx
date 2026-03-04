"use client";

// components/mesh/list/settings/GroupTab.tsx
//
// Group-by configuration: select groupable fields, set direction,
// collapse-by-default toggle.

import {
    ArrowDown,
    ArrowUp,
    Plus,
    Trash2,
} from "lucide-react";

import type { ColumnDef, GroupRule } from "../types";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";


interface GroupTabProps<T> {
    columns: ColumnDef<T>[];
    columnVisibility: Record<string, boolean>;
    groupBy: GroupRule[];
    groupableColumns: string[];
    onGroupByChange: (rules: GroupRule[]) => void;
}

export function GroupTab<T>({
    columns,
    columnVisibility,
    groupBy,
    groupableColumns,
    onGroupByChange,
}: GroupTabProps<T>) {
    const usedFieldIds = new Set(groupBy.map((r) => r.fieldId));

    const availableColumns = columns.filter(
        (c) => groupableColumns.includes(c.id) && !usedFieldIds.has(c.id),
    );

    function addGroup() {
        if (availableColumns.length === 0) return;
        const col = availableColumns[0];
        onGroupByChange([...groupBy, { fieldId: col.id, dir: "asc", collapsed: false }]);
    }

    function removeGroup(fieldId: string) {
        onGroupByChange(groupBy.filter((r) => r.fieldId !== fieldId));
    }

    function updateGroupField(oldFieldId: string, newFieldId: string) {
        onGroupByChange(
            groupBy.map((r) =>
                r.fieldId === oldFieldId ? { ...r, fieldId: newFieldId } : r,
            ),
        );
    }

    function toggleDir(fieldId: string) {
        onGroupByChange(
            groupBy.map((r) =>
                r.fieldId === fieldId
                    ? { ...r, dir: (r.dir ?? "asc") === "asc" ? "desc" : "asc" }
                    : r,
            ),
        );
    }

    function toggleCollapsed(fieldId: string) {
        onGroupByChange(
            groupBy.map((r) =>
                r.fieldId === fieldId
                    ? { ...r, collapsed: !r.collapsed }
                    : r,
            ),
        );
    }

    return (
        <div className="flex flex-col gap-3 p-1">
            {groupBy.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                    No grouping configured. Add a group field to organize results.
                </p>
            )}

            <div className="space-y-2">
                {groupBy.map((rule, idx) => {
                    const col = columns.find((c) => c.id === rule.fieldId);
                    const isHidden = col ? !columnVisibility[col.id] : false;

                    // Available options for this row: current + all unused groupable columns
                    const availableForThisRow = columns.filter(
                        (c) =>
                            groupableColumns.includes(c.id) &&
                            (c.id === rule.fieldId || !usedFieldIds.has(c.id)),
                    );

                    return (
                        <div
                            key={rule.fieldId}
                            className="space-y-2 rounded-md border p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span className="w-4 text-center text-[10px] font-medium text-muted-foreground">
                                    {idx + 1}
                                </span>

                                <Select
                                    value={rule.fieldId}
                                    onValueChange={(v) => updateGroupField(rule.fieldId, v)}
                                >
                                    <SelectTrigger className="h-7 flex-1 text-xs">
                                        <SelectValue>
                                            {col?.header ?? rule.fieldId}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableForThisRow.map((c) => (
                                            <SelectItem
                                                key={c.id}
                                                value={c.id}
                                                className="text-xs"
                                            >
                                                {c.header}
                                                {!columnVisibility[c.id] && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        (hidden)
                                                    </span>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0"
                                    onClick={() => toggleDir(rule.fieldId)}
                                    title={
                                        (rule.dir ?? "asc") === "asc"
                                            ? "Ascending"
                                            : "Descending"
                                    }
                                >
                                    {(rule.dir ?? "asc") === "asc" ? (
                                        <ArrowUp className="size-3.5" />
                                    ) : (
                                        <ArrowDown className="size-3.5" />
                                    )}
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0"
                                    onClick={() => removeGroup(rule.fieldId)}
                                >
                                    <Trash2 className="size-3 text-destructive" />
                                </Button>
                            </div>

                            {/* Options row */}
                            <div className="flex items-center gap-3 pl-6">
                                <div className="flex items-center gap-1.5">
                                    <Checkbox
                                        id={`collapse-${rule.fieldId}`}
                                        checked={rule.collapsed ?? false}
                                        onCheckedChange={() =>
                                            toggleCollapsed(rule.fieldId)
                                        }
                                        className="size-3.5"
                                    />
                                    <Label
                                        htmlFor={`collapse-${rule.fieldId}`}
                                        className="text-xs text-muted-foreground"
                                    >
                                        Collapse by default
                                    </Label>
                                </div>

                                {isHidden && (
                                    <span className="text-[10px] text-amber-600">
                                        Column is hidden — will auto-show
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 self-start text-xs"
                onClick={addGroup}
                disabled={availableColumns.length === 0}
            >
                <Plus className="size-3" />
                Add Group Level
            </Button>

            {groupBy.length > 1 && (
                <p className="text-[10px] text-muted-foreground">
                    Multi-level grouping: items are grouped by level 1, then sub-grouped by level 2.
                </p>
            )}
        </div>
    );
}
