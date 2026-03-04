"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Eye, EyeOff, Layers, Plus, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FieldFormDialog } from "./FieldFormDialog";
import { FieldRow } from "./FieldRow";

import type {
  ConflictError,
  FieldDefinition,
} from "@/lib/schema-manager/types";
import type { DragEndEvent } from "@dnd-kit/core";

import { ConflictDialog } from "@/components/mesh/schemas/ConflictDialog";
import { ConfirmDeleteDialog } from "@/components/mesh/shared/ConfirmDeleteDialog";
import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";
import { useMutation } from "@/lib/schema-manager/use-mutation";

const SYSTEM_FIELDS = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
]);

interface FieldEditorProps {
  entityName: string;
  readonly?: boolean;
}

/**
 * Rebase a local field order onto the latest server fields.
 * Preserves the user's ordering intent while incorporating any new fields added by others.
 */
function rebaseReorder(
  localOrder: string[],
  serverFields: FieldDefinition[],
): FieldDefinition[] {
  const serverMap = new Map(serverFields.map((f) => [f.id, f]));
  const reordered: FieldDefinition[] = [];

  for (const id of localOrder) {
    const field = serverMap.get(id);
    if (field) {
      reordered.push(field);
      serverMap.delete(id);
    }
  }

  // Append any new fields added by others
  for (const field of serverMap.values()) {
    reordered.push(field);
  }

  return reordered.map((f, i) => ({ ...f, sortOrder: i }));
}

export function FieldEditor({
  entityName,
  readonly = false,
}: FieldEditorProps) {
  const { fields, loading, error, etag, refresh } = useEntityFields(entityName);
  const [showSystem, setShowSystem] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(
    null,
  );
  const [localFields, setLocalFields] = useState<FieldDefinition[] | null>(
    null,
  );
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictError | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Use local state for reordering, fallback to fetched fields
  const displayFields = localFields ?? fields;

  const { userFields, systemFields } = useMemo(() => {
    const user: FieldDefinition[] = [];
    const system: FieldDefinition[] = [];
    for (const f of displayFields) {
      if (SYSTEM_FIELDS.has(f.name)) system.push(f);
      else user.push(f);
    }
    return { userFields: user, systemFields: system };
  }, [displayFields]);

  const visibleFields = showSystem ? displayFields : userFields;
  const hasUnsavedOrder = localFields !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Mutation hook for saving field order
  const { mutate: saveOrder, loading: savingOrder } = useMutation<
    FieldDefinition[]
  >({
    url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
    method: "POST",
    etag,
    onSuccess: () => {
      setLocalFields(null);
      refresh();
    },
    onConflict: (conflict) => {
      setConflictData(conflict);
      setConflictOpen(true);
    },
  });

  // Mutation hook for creating/updating a field
  const { mutate: saveField, loading: _savingField } =
    useMutation<FieldDefinition>({
      url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
      method: "POST",
      etag,
      onSuccess: () => {
        setDialogOpen(false);
        setEditingField(null);
        refresh();
      },
      onConflict: (conflict) => {
        setConflictData(conflict);
        setConflictOpen(true);
      },
    });

  // Mutation hook for deleting a field
  const { mutate: deleteField, loading: deletingField } = useMutation<void>({
    url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
    method: "DELETE",
    etag,
    onSuccess: () => {
      setDeleteOpen(false);
      setDeleteTarget(null);
      refresh();
    },
    onConflict: (conflict) => {
      setConflictData(conflict);
      setConflictOpen(true);
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (readonly) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = visibleFields.findIndex((f) => f.id === active.id);
      const newIndex = visibleFields.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(visibleFields, oldIndex, newIndex).map(
        (f, i) => ({
          ...f,
          sortOrder: i,
        }),
      );
      setLocalFields(reordered);
    },
    [visibleFields, readonly],
  );

  const handleSaveOrder = useCallback(async () => {
    if (!localFields) return;
    await saveOrder({ fieldIds: localFields.map((f) => f.id) });
  }, [localFields, saveOrder]);

  const handleDiscardOrder = useCallback(() => {
    setLocalFields(null);
  }, []);

  const handleConflictReload = useCallback(() => {
    setLocalFields(null);
    refresh();
  }, [refresh]);

  const handleConflictForceRebase = useCallback(async () => {
    if (!localFields) return;
    // Reload latest, then rebase local order onto it
    const res = await fetch(
      `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
      { credentials: "same-origin" },
    );
    if (res.ok) {
      const body = (await res.json()) as { data: FieldDefinition[] };
      const localOrder = localFields.map((f) => f.id);
      const rebased = rebaseReorder(localOrder, body.data);
      setLocalFields(rebased);
    }
  }, [localFields, entityName]);

  const handleEdit = useCallback(
    (field: FieldDefinition) => {
      if (readonly) return;
      setEditingField(field);
      setDialogOpen(true);
    },
    [readonly],
  );

  const handleDelete = useCallback((field: FieldDefinition) => {
    setDeleteTarget(field);
    setDeleteOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteField({ fieldId: deleteTarget.id });
  }, [deleteTarget, deleteField]);

  const handleAddNew = useCallback(() => {
    setEditingField(null);
    setDialogOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      // If editing an existing field, include fieldId to trigger update path
      if (editingField) {
        await saveField({ ...values, fieldId: editingField.id });
      } else {
        await saveField(values);
      }
    },
    [editingField, saveField],
  );

  // Keyboard reorder: Alt+Up / Alt+Down moves focused field
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (readonly) return;

    function handleKeyboardReorder(e: KeyboardEvent) {
      if (!e.altKey || !focusedFieldId) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      e.preventDefault();
      const currentList = localFields ?? visibleFields;
      const idx = currentList.findIndex((f) => f.id === focusedFieldId);
      if (idx === -1) return;

      const newIdx =
        e.key === "ArrowUp"
          ? Math.max(0, idx - 1)
          : Math.min(currentList.length - 1, idx + 1);
      if (newIdx === idx) return;

      const reordered = arrayMove(currentList, idx, newIdx).map((f, i) => ({
        ...f,
        sortOrder: i,
      }));
      setLocalFields(reordered);
    }

    window.addEventListener("keydown", handleKeyboardReorder);
    return () => window.removeEventListener("keydown", handleKeyboardReorder);
  }, [readonly, focusedFieldId, localFields, visibleFields]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No fields defined"
        description="Add fields to define the structure of this entity."
        actionLabel={readonly ? undefined : "Add First Field"}
        onAction={readonly ? undefined : handleAddNew}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Fields</h3>
          <Badge variant="secondary" className="text-xs">
            {fields.length}
          </Badge>
          {readonly && (
            <Badge variant="outline" className="text-xs text-warning">
              Read-only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedOrder && !readonly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardOrder}
                disabled={savingOrder}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSaveOrder}
                disabled={savingOrder}
                className="gap-1.5"
              >
                <Save className="size-3.5" />
                {savingOrder ? "Saving..." : "Save Order"}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSystem(!showSystem)}
            className="gap-1.5"
          >
            {showSystem ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {showSystem
              ? "Hide system"
              : `Show system (${systemFields.length})`}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          {!readonly && (
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="mr-1.5 size-3.5" />
              Add Field
            </Button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleFields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5" role="list" aria-label="Entity fields">
            {visibleFields.map((field) => (
              <div
                key={field.id}
                role="listitem"
                tabIndex={0}
                onFocus={() => setFocusedFieldId(field.id)}
                onBlur={() =>
                  setFocusedFieldId((prev) => (prev === field.id ? null : prev))
                }
              >
                <FieldRow
                  field={field}
                  onEdit={readonly ? undefined : handleEdit}
                  onDelete={readonly ? undefined : handleDelete}
                />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readonly && (
        <FieldFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          field={editingField}
          existingFields={fields}
          onSubmit={handleFormSubmit}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Field"
        description={`Are you sure you want to delete the field "${deleteTarget?.name ?? ""}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        loading={deletingField}
      />

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        conflict={conflictData}
        onReload={handleConflictReload}
        onForceOverwrite={handleConflictForceRebase}
      />
    </div>
  );
}
