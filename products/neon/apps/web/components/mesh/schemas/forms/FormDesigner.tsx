"use client";

// components/mesh/schemas/forms/FormDesigner.tsx
//
// Visual designer for entity form section layouts.
// Multi-container drag-and-drop: fields can be dragged between
// an unassigned pool and multiple named sections.

import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  Eye,
  EyeOff,
  LayoutGrid,
  Save,
  X,
  RefreshCw,
  Pencil,
  Check,
  Columns3,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConflictError,
  FieldDefinition,
} from "@/lib/schema-manager/types";
import type { FormSection } from "@/lib/schema-manager/use-entity-forms";
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";

import { ConflictDialog } from "@/components/mesh/schemas/ConflictDialog";
import { FieldTypeIcon } from "@/components/mesh/schemas/fields/FieldTypeIcon";
import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useEntityForms } from "@/lib/schema-manager/use-entity-forms";

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

const POOL_ID = "pool";

// ─── Sub-components ──────────────────────────────────────────

function SortableFieldItem({
  fieldName,
  fieldDef,
  onRemove,
}: {
  fieldName: string;
  fieldDef: FieldDefinition | undefined;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldName });

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
      {fieldDef && <FieldTypeIcon dataType={fieldDef.dataType} />}
      <span className="flex-1 truncate">{fieldName}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function PoolFieldChip({
  fieldName,
  fieldDef,
}: {
  fieldName: string;
  fieldDef: FieldDefinition | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="inline-flex cursor-grab items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
      {...attributes}
      {...listeners}
    >
      {fieldDef && <FieldTypeIcon dataType={fieldDef.dataType} />}
      <span className="truncate max-w-[140px]">{fieldName}</span>
    </div>
  );
}

function DroppableContainer({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[48px] rounded-md transition-colors ${isOver ? "bg-accent/50" : ""}`}
    >
      {children}
    </div>
  );
}

function SectionCard({
  section,
  fieldMap,
  onLabelChange,
  onColumnsChange,
  onDelete,
  onRemoveField,
}: {
  section: FormSection;
  fieldMap: Map<string, FieldDefinition>;
  onLabelChange: (label: string) => void;
  onColumnsChange: (cols: 1 | 2 | 3) => void;
  onDelete: () => void;
  onRemoveField: (fieldName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(section.label);

  const commitLabel = useCallback(() => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== section.label) onLabelChange(trimmed);
    setEditing(false);
  }, [editLabel, section.label, onLabelChange]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitLabel();
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={commitLabel}
                className="h-7 w-48 text-sm"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={commitLabel}
              >
                <Check className="size-3.5" />
              </Button>
            </div>
          ) : (
            <CardTitle
              className="cursor-pointer text-sm hover:underline"
              onClick={() => {
                setEditLabel(section.label);
                setEditing(true);
              }}
            >
              {section.label}
              <Pencil className="ml-1.5 inline size-3 text-muted-foreground" />
            </CardTitle>
          )}
          <Badge variant="outline" className="text-[10px]">
            {section.fields.length} field
            {section.fields.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(section.columns)}
            onValueChange={(v) => onColumnsChange(Number(v) as 1 | 2 | 3)}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <Columns3 className="mr-1 size-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Column</SelectItem>
              <SelectItem value="2">2 Columns</SelectItem>
              <SelectItem value="3">3 Columns</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DroppableContainer id={`section:${section.code}`}>
          <SortableContext
            items={section.fields}
            strategy={verticalListSortingStrategy}
          >
            {section.fields.length === 0 ? (
              <div className="flex items-center justify-center rounded-md border border-dashed py-6 text-xs text-muted-foreground">
                Drag fields here
              </div>
            ) : (
              <div className="space-y-1">
                {section.fields.map((f) => (
                  <SortableFieldItem
                    key={f}
                    fieldName={f}
                    fieldDef={fieldMap.get(f)}
                    onRemove={() => onRemoveField(f)}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DroppableContainer>
      </CardContent>
    </Card>
  );
}

function FormPreview({
  sections,
  fieldMap,
}: {
  sections: FormSection[];
  fieldMap: Map<string, FieldDefinition>;
}) {
  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No sections defined. Add a section to preview the form layout.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Card key={section.code}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{section.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${
                section.columns === 3
                  ? "grid-cols-3"
                  : section.columns === 2
                    ? "grid-cols-2"
                    : "grid-cols-1"
              }`}
            >
              {section.fields.map((fieldName) => {
                const field = fieldMap.get(fieldName);
                return (
                  <div key={fieldName} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {fieldName
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {field ? field.dataType : "unknown"}
                    </div>
                  </div>
                );
              })}
              {section.fields.length === 0 && (
                <div className="col-span-full py-4 text-center text-xs text-muted-foreground">
                  Empty section
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

interface FormDesignerProps {
  entityName: string;
}

export function FormDesigner({ entityName }: FormDesignerProps) {
  const {
    layout,
    loading: formsLoading,
    error: formsError,
    refresh,
    saveLayout,
  } = useEntityForms(entityName);
  const {
    fields,
    loading: fieldsLoading,
    error: fieldsError,
  } = useEntityFields(entityName);

  const [localSections, setLocalSections] = useState<FormSection[] | null>(
    null,
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictError | null>(null);
  const [saving, setSaving] = useState(false);

  // Build field lookup map
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const f of fields) map.set(f.name, f);
    return map;
  }, [fields]);

  // User fields (exclude system)
  const userFieldNames = useMemo(
    () => fields.filter((f) => !SYSTEM_FIELDS.has(f.name)).map((f) => f.name),
    [fields],
  );

  // Compute default sections when server returns empty (first use)
  const serverSections = useMemo(() => {
    if (layout.sections.length > 0) {
      // Filter out stale field references
      return layout.sections.map((s) => ({
        ...s,
        fields: s.fields.filter((f) => fieldMap.has(f)),
      }));
    }
    if (userFieldNames.length === 0) return [];
    // Default: single "Details" section with all user fields, 2 columns
    return [
      {
        code: "details",
        label: "Details",
        columns: 2 as const,
        fields: [...userFieldNames],
      },
    ];
  }, [layout.sections, userFieldNames, fieldMap]);

  const activeSections = localSections ?? serverSections;
  const isDirty = localSections !== null;

  // Computed unassigned pool
  const assignedSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of activeSections) {
      for (const f of s.fields) set.add(f);
    }
    return set;
  }, [activeSections]);

  const unassignedFields = useMemo(
    () => userFieldNames.filter((f) => !assignedSet.has(f)),
    [userFieldNames, assignedSet],
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ─── DnD helpers ─────────────────────────────────────────

  const findContainer = useCallback(
    (fieldId: string): string | null => {
      if (unassignedFields.includes(fieldId)) return POOL_ID;
      for (const s of activeSections) {
        if (s.fields.includes(fieldId)) return `section:${s.code}`;
      }
      // Check if the id IS a container
      if (fieldId === POOL_ID) return POOL_ID;
      if (fieldId.startsWith("section:")) return fieldId;
      return null;
    },
    [activeSections, unassignedFields],
  );

  const updateSections = useCallback(
    (updater: (prev: FormSection[]) => FormSection[]) => {
      setLocalSections((prev) => updater(prev ?? serverSections));
    },
    [serverSections],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeContainer = findContainer(String(active.id));
      let overContainer = findContainer(String(over.id));

      // If we're over a container directly (not an item), use that
      if (!overContainer) {
        if (String(over.id) === POOL_ID) overContainer = POOL_ID;
        else if (String(over.id).startsWith("section:"))
          overContainer = String(over.id);
      }

      if (
        !activeContainer ||
        !overContainer ||
        activeContainer === overContainer
      )
        return;

      const fieldName = String(active.id);

      updateSections((prev) => {
        const next = prev.map((s) => ({
          ...s,
          fields: s.fields.filter((f) => f !== fieldName),
        }));

        if (overContainer !== POOL_ID) {
          const sectionCode = overContainer.replace("section:", "");
          return next.map((s) => {
            if (s.code !== sectionCode) return s;
            const overIndex = s.fields.indexOf(String(over.id));
            const insertAt = overIndex >= 0 ? overIndex : s.fields.length;
            const newFields = [...s.fields];
            newFields.splice(insertAt, 0, fieldName);
            return { ...s, fields: newFields };
          });
        }

        // Moving to pool = just remove from section (pool is computed)
        return next;
      });
    },
    [findContainer, updateSections],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const activeContainer = findContainer(String(active.id));
      const overContainer = findContainer(String(over.id));

      if (!activeContainer || !overContainer) return;

      // Same container: reorder
      if (activeContainer === overContainer && activeContainer !== POOL_ID) {
        const sectionCode = activeContainer.replace("section:", "");
        updateSections((prev) =>
          prev.map((s) => {
            if (s.code !== sectionCode) return s;
            const oldIdx = s.fields.indexOf(String(active.id));
            const newIdx = s.fields.indexOf(String(over.id));
            if (oldIdx < 0 || newIdx < 0) return s;
            return { ...s, fields: arrayMove(s.fields, oldIdx, newIdx) };
          }),
        );
      }
    },
    [findContainer, updateSections],
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  // ─── Section management ──────────────────────────────────

  const addSection = useCallback(() => {
    const code = `section_${Date.now()}`;
    updateSections((prev) => [
      ...prev,
      { code, label: "New Section", columns: 2, fields: [] },
    ]);
  }, [updateSections]);

  const deleteSection = useCallback(
    (code: string) => {
      updateSections((prev) => prev.filter((s) => s.code !== code));
    },
    [updateSections],
  );

  const updateSectionLabel = useCallback(
    (code: string, label: string) => {
      updateSections((prev) =>
        prev.map((s) => (s.code === code ? { ...s, label } : s)),
      );
    },
    [updateSections],
  );

  const updateSectionColumns = useCallback(
    (code: string, columns: 1 | 2 | 3) => {
      updateSections((prev) =>
        prev.map((s) => (s.code === code ? { ...s, columns } : s)),
      );
    },
    [updateSections],
  );

  const removeFieldFromSection = useCallback(
    (sectionCode: string, fieldName: string) => {
      updateSections((prev) =>
        prev.map((s) =>
          s.code === sectionCode
            ? { ...s, fields: s.fields.filter((f) => f !== fieldName) }
            : s,
        ),
      );
    },
    [updateSections],
  );

  // ─── Save / Discard ──────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!localSections) return;
    setSaving(true);
    try {
      const result = await saveLayout(localSections);
      if (result.success) {
        setLocalSections(null);
      } else if (result.error?.code === "CONFLICT") {
        setConflictData(result.error as ConflictError);
        setConflictOpen(true);
      }
    } finally {
      setSaving(false);
    }
  }, [localSections, saveLayout]);

  const handleDiscard = useCallback(() => setLocalSections(null), []);

  const handleConflictReload = useCallback(() => {
    setLocalSections(null);
    refresh();
  }, [refresh]);

  // Reset local state when entity changes
  useEffect(() => {
    setLocalSections(null);
    setPreviewMode(false);
  }, [entityName]);

  // ─── Loading / Error / Empty ─────────────────────────────

  const loading = formsLoading || fieldsLoading;
  const error = formsError || fieldsError;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
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
        icon={LayoutGrid}
        title="No fields defined"
        description="Add fields to this entity before designing the form layout."
      />
    );
  }

  // ─── Render ──────────────────────────────────────────────

  const activeFieldDef = activeId ? fieldMap.get(activeId) : undefined;

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Form Designer</h2>
          <Badge variant="outline" className="text-xs">
            {activeSections.length} section
            {activeSections.length !== 1 ? "s" : ""}
          </Badge>
          {isDirty && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreviewMode((p) => !p)}
          >
            {previewMode ? (
              <>
                <EyeOff className="mr-1.5 size-3.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="mr-1.5 size-3.5" />
                Preview
              </>
            )}
          </Button>
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

      {previewMode ? (
        <FormPreview sections={activeSections} fieldMap={fieldMap} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Unassigned Field Pool */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Unassigned Fields</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {unassignedFields.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <DroppableContainer id={POOL_ID}>
                <SortableContext
                  items={unassignedFields}
                  strategy={verticalListSortingStrategy}
                >
                  {unassignedFields.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      All fields assigned
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {unassignedFields.map((f) => (
                        <PoolFieldChip
                          key={f}
                          fieldName={f}
                          fieldDef={fieldMap.get(f)}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              </DroppableContainer>
            </CardContent>
          </Card>

          <Separator />

          {/* Sections */}
          <div className="space-y-3">
            {activeSections.map((section) => (
              <SectionCard
                key={section.code}
                section={section}
                fieldMap={fieldMap}
                onLabelChange={(label) =>
                  updateSectionLabel(section.code, label)
                }
                onColumnsChange={(cols) =>
                  updateSectionColumns(section.code, cols)
                }
                onDelete={() => deleteSection(section.code)}
                onRemoveField={(fieldName) =>
                  removeFieldFromSection(section.code, fieldName)
                }
              />
            ))}
          </div>

          <Button variant="outline" className="w-full" onClick={addSection}>
            <Plus className="mr-1.5 size-3.5" />
            Add Section
          </Button>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeId ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm shadow-lg">
                {activeFieldDef && (
                  <FieldTypeIcon dataType={activeFieldDef.dataType} />
                )}
                <span>{activeId}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
