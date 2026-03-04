"use client";

// components/mesh/schemas/views/ViewConfigurator.tsx
//
// Configure list/table view presets for an entity.
// Named presets with column selection, ordering, widths, and sort defaults.
// Single-container drag-and-drop for column reordering within a preset.

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  X,
  RefreshCw,
  Columns3,
  ArrowUpDown,
  Star,
  Pencil,
  Check,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConflictError,
  FieldDefinition,
} from "@/lib/schema-manager/types";
import type {
  ViewPreset,
  ViewColumn,
  ColumnWidth,
} from "@/lib/schema-manager/use-entity-views";
import type { DragEndEvent } from "@dnd-kit/core";

import { ConflictDialog } from "@/components/mesh/schemas/ConflictDialog";
import { FieldTypeIcon } from "@/components/mesh/schemas/fields/FieldTypeIcon";
import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";
import { useEntityViews } from "@/lib/schema-manager/use-entity-views";

// ─── Constants ───────────────────────────────────────────────

const SYSTEM_FIELDS = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
]);

// ─── Sub-components ──────────────────────────────────────────

function SortableColumnRow({
  column,
  fieldDef,
  onToggleVisible,
  onWidthChange,
  onRemove,
}: {
  column: ViewColumn;
  fieldDef: FieldDefinition | undefined;
  onToggleVisible: () => void;
  onWidthChange: (width: ColumnWidth) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.fieldName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Checkbox
        checked={column.visible}
        onCheckedChange={onToggleVisible}
        className="size-3.5"
      />
      {fieldDef && <FieldTypeIcon dataType={fieldDef.dataType} />}
      <span className="flex-1 truncate">{column.fieldName}</span>
      <Select
        value={column.width}
        onValueChange={(v) => onWidthChange(v as ColumnWidth)}
      >
        <SelectTrigger className="h-6 w-20 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="narrow">Narrow</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="wide">Wide</SelectItem>
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
        title="Remove column"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function PresetTab({
  preset,
  isActive,
  isOnly,
  onSelect,
  onRename,
  onDelete,
  onSetDefault,
}: {
  preset: ViewPreset;
  isActive: boolean;
  isOnly: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(preset.name);

  const commitRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== preset.name) onRename(trimmed);
    setEditing(false);
  }, [editName, preset.name, onRename]);

  return (
    <div
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
        isActive
          ? "border-primary bg-primary/5 text-primary"
          : "cursor-pointer border-transparent text-muted-foreground hover:border-border hover:text-foreground"
      }`}
      onClick={() => !editing && onSelect()}
    >
      {preset.isDefault && <Star className="size-3 fill-current" />}
      {editing ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commitRename}
            className="h-5 w-28 text-xs"
            autoFocus
          />
          <button type="button" onClick={commitRename} title="Confirm rename">
            <Check className="size-3" />
          </button>
        </div>
      ) : (
        <span
          className="truncate max-w-[100px]"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditName(preset.name);
            setEditing(true);
          }}
        >
          {preset.name}
        </span>
      )}
      {isActive && (
        <div
          className="ml-1 flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setEditName(preset.name);
              setEditing(true);
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Rename preset"
          >
            <Pencil className="size-2.5" />
          </button>
          {!preset.isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="text-muted-foreground hover:text-foreground"
              title="Set as default"
            >
              <Star className="size-2.5" />
            </button>
          )}
          {!isOnly && (
            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
              title="Delete preset"
            >
              <Trash2 className="size-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

interface ViewConfiguratorProps {
  entityName: string;
}

export function ViewConfigurator({ entityName }: ViewConfiguratorProps) {
  const {
    config,
    loading: viewsLoading,
    error: viewsError,
    refresh,
    saveConfig,
  } = useEntityViews(entityName);
  const {
    fields,
    loading: fieldsLoading,
    error: fieldsError,
  } = useEntityFields(entityName);

  const [localViews, setLocalViews] = useState<ViewPreset[] | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictError | null>(null);
  const [saving, setSaving] = useState(false);

  // Field lookup
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const f of fields) map.set(f.name, f);
    return map;
  }, [fields]);

  const userFieldNames = useMemo(
    () => fields.filter((f) => !SYSTEM_FIELDS.has(f.name)).map((f) => f.name),
    [fields],
  );

  const activeViews = localViews ?? config.views;

  // Auto-select first preset when views load or change
  useEffect(() => {
    if (
      activeViews.length > 0 &&
      !activeViews.find((v) => v.id === activePresetId)
    ) {
      setActivePresetId(activeViews[0].id);
    }
  }, [activeViews, activePresetId]);

  const activePreset =
    activeViews.find((v) => v.id === activePresetId) ?? activeViews[0] ?? null;
  const isDirty = localViews !== null;

  // Resolve columns for the active preset (auto-expand empty columns)
  const resolvedColumns = useMemo((): ViewColumn[] => {
    if (!activePreset) return [];
    if (activePreset.columns.length > 0) {
      // Filter stale field references
      return activePreset.columns.filter((c) => fieldMap.has(c.fieldName));
    }
    // Auto-populate from entity fields
    return userFieldNames.map((name, i) => ({
      fieldName: name,
      width: "medium" as ColumnWidth,
      visible: true,
      sortOrder: i,
    }));
  }, [activePreset, userFieldNames, fieldMap]);

  // Fields not in the active preset's columns
  const availableFields = useMemo(() => {
    const inPreset = new Set(resolvedColumns.map((c) => c.fieldName));
    return userFieldNames.filter((f) => !inPreset.has(f));
  }, [resolvedColumns, userFieldNames]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ─── Updaters ────────────────────────────────────────────

  const updateViews = useCallback(
    (updater: (prev: ViewPreset[]) => ViewPreset[]) => {
      setLocalViews((prev) => updater(prev ?? config.views));
    },
    [config.views],
  );

  const updateActivePreset = useCallback(
    (
      updater: (preset: ViewPreset, resolvedCols: ViewColumn[]) => ViewPreset,
    ) => {
      if (!activePreset) return;
      updateViews((prev) =>
        prev.map((v) =>
          v.id === activePreset.id ? updater(v, resolvedColumns) : v,
        ),
      );
    },
    [activePreset, resolvedColumns, updateViews],
  );

  // ─── Preset CRUD ─────────────────────────────────────────

  const addPreset = useCallback(() => {
    const id = crypto.randomUUID();
    updateViews((prev) => [
      ...prev,
      {
        id,
        name: "New View",
        isDefault: false,
        columns: [],
        defaultSortDirection: "asc" as const,
      },
    ]);
    setActivePresetId(id);
  }, [updateViews]);

  const deletePreset = useCallback(
    (id: string) => {
      updateViews((prev) => {
        const filtered = prev.filter((v) => v.id !== id);
        // If deleted preset was default, promote first remaining
        const wasDefault = prev.find((v) => v.id === id)?.isDefault;
        if (wasDefault && filtered.length > 0) {
          filtered[0] = { ...filtered[0], isDefault: true };
        }
        return filtered;
      });
    },
    [updateViews],
  );

  const renamePreset = useCallback(
    (id: string, name: string) => {
      updateViews((prev) =>
        prev.map((v) => (v.id === id ? { ...v, name } : v)),
      );
    },
    [updateViews],
  );

  const setDefaultPreset = useCallback(
    (id: string) => {
      updateViews((prev) =>
        prev.map((v) => ({ ...v, isDefault: v.id === id })),
      );
    },
    [updateViews],
  );

  // ─── Column management ───────────────────────────────────

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      updateActivePreset((_preset, cols) => {
        const oldIdx = cols.findIndex((c) => c.fieldName === active.id);
        const newIdx = cols.findIndex((c) => c.fieldName === over.id);
        if (oldIdx < 0 || newIdx < 0) return { ..._preset, columns: cols };
        const reordered = arrayMove(cols, oldIdx, newIdx).map((c, i) => ({
          ...c,
          sortOrder: i,
        }));
        return { ..._preset, columns: reordered };
      });
    },
    [updateActivePreset],
  );

  const toggleColumnVisible = useCallback(
    (fieldName: string) => {
      updateActivePreset((_preset, cols) => ({
        ..._preset,
        columns: cols.map((c) =>
          c.fieldName === fieldName ? { ...c, visible: !c.visible } : c,
        ),
      }));
    },
    [updateActivePreset],
  );

  const changeColumnWidth = useCallback(
    (fieldName: string, width: ColumnWidth) => {
      updateActivePreset((_preset, cols) => ({
        ..._preset,
        columns: cols.map((c) =>
          c.fieldName === fieldName ? { ...c, width } : c,
        ),
      }));
    },
    [updateActivePreset],
  );

  const removeColumn = useCallback(
    (fieldName: string) => {
      updateActivePreset((_preset, cols) => ({
        ..._preset,
        columns: cols
          .filter((c) => c.fieldName !== fieldName)
          .map((c, i) => ({ ...c, sortOrder: i })),
      }));
    },
    [updateActivePreset],
  );

  const addColumn = useCallback(
    (fieldName: string) => {
      updateActivePreset((_preset, cols) => ({
        ..._preset,
        columns: [
          ...cols,
          {
            fieldName,
            width: "medium" as ColumnWidth,
            visible: true,
            sortOrder: cols.length,
          },
        ],
      }));
    },
    [updateActivePreset],
  );

  const setSortField = useCallback(
    (field: string) => {
      updateActivePreset((preset) => ({
        ...preset,
        defaultSortField: field || undefined,
      }));
    },
    [updateActivePreset],
  );

  const setSortDirection = useCallback(
    (dir: string) => {
      updateActivePreset((preset) => ({
        ...preset,
        defaultSortDirection: dir as "asc" | "desc",
      }));
    },
    [updateActivePreset],
  );

  // ─── Save / Discard ──────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!localViews) return;
    setSaving(true);
    try {
      const result = await saveConfig(localViews);
      if (result.success) {
        setLocalViews(null);
      } else if (result.error?.code === "CONFLICT") {
        setConflictData(result.error as ConflictError);
        setConflictOpen(true);
      }
    } finally {
      setSaving(false);
    }
  }, [localViews, saveConfig]);

  const handleDiscard = useCallback(() => setLocalViews(null), []);

  const handleConflictReload = useCallback(() => {
    setLocalViews(null);
    refresh();
  }, [refresh]);

  // Reset on entity change
  useEffect(() => {
    setLocalViews(null);
    setActivePresetId(null);
  }, [entityName]);

  // ─── Loading / Error / Empty ─────────────────────────────

  const loading = viewsLoading || fieldsLoading;
  const error = viewsError || fieldsError;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="mr-1.5 size-3.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userFieldNames.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No fields defined"
        description="Add fields to this entity before configuring views."
      />
    );
  }

  // Visible columns for sort dropdown
  const visibleColumns = resolvedColumns.filter((c) => c.visible);

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">View Configuration</h2>
          <Badge variant="outline" className="text-xs">
            {activeViews.length} preset{activeViews.length !== 1 ? "s" : ""}
          </Badge>
          {isDirty && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <>
              <Button size="sm" variant="ghost" onClick={handleDiscard}>
                <X className="mr-1.5 size-3.5" />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-1.5 size-3.5" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Preset Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {activeViews.map((preset) => (
          <PresetTab
            key={preset.id}
            preset={preset}
            isActive={preset.id === activePreset?.id}
            isOnly={activeViews.length === 1}
            onSelect={() => setActivePresetId(preset.id)}
            onRename={(name) => renamePreset(preset.id, name)}
            onDelete={() => deletePreset(preset.id)}
            onSetDefault={() => setDefaultPreset(preset.id)}
          />
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={addPreset}
        >
          <Plus className="mr-1 size-3" />
          Add Preset
        </Button>
      </div>

      {activePreset && (
        <>
          {/* Sort Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ArrowUpDown className="size-3.5" />
                Default Sort
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    Sort By
                  </Label>
                  <Select
                    value={activePreset.defaultSortField ?? "__none__"}
                    onValueChange={(v) =>
                      setSortField(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {visibleColumns.map((c) => (
                        <SelectItem key={c.fieldName} value={c.fieldName}>
                          {c.fieldName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label className="text-xs text-muted-foreground">
                    Direction
                  </Label>
                  <Select
                    value={activePreset.defaultSortDirection ?? "asc"}
                    onValueChange={setSortDirection}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Column List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Columns3 className="size-3.5" />
                  Columns
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {resolvedColumns.length} total, {visibleColumns.length}{" "}
                  visible
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={resolvedColumns.map((c) => c.fieldName)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {resolvedColumns.map((col) => (
                      <SortableColumnRow
                        key={col.fieldName}
                        column={col}
                        fieldDef={fieldMap.get(col.fieldName)}
                        onToggleVisible={() =>
                          toggleColumnVisible(col.fieldName)
                        }
                        onWidthChange={(w) =>
                          changeColumnWidth(col.fieldName, w)
                        }
                        onRemove={() => removeColumn(col.fieldName)}
                      />
                    ))}
                    {resolvedColumns.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No columns configured. Add columns from below.
                      </p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          {/* Available Fields */}
          {availableFields.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Available Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {availableFields.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => addColumn(f)}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
                    >
                      <FieldTypeIcon
                        dataType={fieldMap.get(f)?.dataType ?? "string"}
                      />
                      <span className="truncate max-w-[140px]">{f}</span>
                      <Plus className="size-3" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        conflict={conflictData}
        onReload={handleConflictReload}
      />
    </div>
  );
}
