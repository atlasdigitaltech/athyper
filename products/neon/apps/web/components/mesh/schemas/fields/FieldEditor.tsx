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
import { Archive, Filter, Layers, Lock, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";
import { useEntityMeta } from "@/lib/schema-manager/use-entity-meta";
import { useMutation } from "@/lib/schema-manager/use-mutation";
import { useEntityValidation } from "@/lib/schema-manager/use-entity-validation";

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
  readonly: readonlyProp = false,
}: FieldEditorProps) {
  const { entity: entityMeta } = useEntityMeta(entityName);
  const versionStatus = entityMeta?.currentVersion?.status;
  const isVersionLocked = versionStatus === "published" || versionStatus === "archived";
  const readonly = readonlyProp || isVersionLocked;

  const { fields, loading, error, etag, hasPublishedVersion, refresh } = useEntityFields(entityName);
  const { rules: entityValidationRules } = useEntityValidation(entityName);
  const [originFilter, setOriginFilter] = useState<"all" | "system" | "standard" | "business">("all");
  const [showDeprecated, setShowDeprecated] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState("");

  // Deep-link: auto-open field dialog when ?edit=fieldId is in URL
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || loading || fields.length === 0) return;
    const editFieldId = searchParams.get("edit");
    if (!editFieldId) return;
    const field = fields.find((f) => f.id === editFieldId);
    if (field) {
      deepLinkHandled.current = true;
      setEditingField(field);
      setDialogOpen(true);
    }
  }, [searchParams, fields, loading]);

  // Use local state for reordering, fallback to fetched fields
  const displayFields = localFields ?? fields;

  const { deprecatedCount, originCounts } = useMemo(() => {
    let deprecated = 0;
    const counts = { system: 0, standard: 0, business: 0 };
    for (const f of displayFields) {
      if (f.isDeprecated) deprecated++;
      const o = (f.origin ?? (SYSTEM_FIELDS.has(f.name) ? "system" : "business")) as keyof typeof counts;
      if (o in counts) counts[o]++;
    }
    return { deprecatedCount: deprecated, originCounts: counts };
  }, [displayFields]);

  const visibleFields = useMemo(() => {
    let list = displayFields;
    if (originFilter !== "all") {
      list = list.filter((f) => {
        const o = f.origin ?? (SYSTEM_FIELDS.has(f.name) ? "system" : "business");
        return o === originFilter;
      });
    }
    if (!showDeprecated) list = list.filter((f) => !f.isDeprecated);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.label && f.label.toLowerCase().includes(q)) ||
          f.dataType.toLowerCase().includes(q) ||
          (f.columnName && f.columnName.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [originFilter, showDeprecated, displayFields, searchQuery]);
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
    onError: (err) => {
      toast.error(err.message || "Failed to save field order");
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
      onError: (err) => {
        const details = (err as any)?.fieldErrors as Array<{ path: string; message: string }> | undefined;
        if (details?.length) {
          toast.error(details.map((e) => `${e.path}: ${e.message}`).join("\n"));
        } else {
          toast.error(err.message || "Failed to save field");
        }
      },
    });

  // Mutation hook for deprecating/restoring a field
  const { mutate: deprecateField } = useMutation<FieldDefinition>({
    url: `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/fields`,
    method: "POST",
    etag,
    onSuccess: (data) => {
      const field = data as any;
      toast.success(
        field?.isDeprecated
          ? `Field "${field.name}" deprecated`
          : `Field "${field.name}" restored`,
      );
      refresh();
    },
    onConflict: (conflict) => {
      setConflictData(conflict);
      setConflictOpen(true);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update field status");
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
    onError: (err) => {
      toast.error(err.message || "Failed to delete field");
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

  const handleDeprecate = useCallback(
    (field: FieldDefinition) => {
      deprecateField({
        fieldId: field.id,
        isDeprecated: !field.isDeprecated,
      });
    },
    [deprecateField],
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
      <>
        <EmptyState
          icon={Layers}
          title="No fields defined"
          description="Add fields to define the structure of this entity."
          actionLabel={readonly ? undefined : "Add First Field"}
          onAction={readonly ? undefined : handleAddNew}
        />
        {!readonly && (
          <FieldFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            field={editingField}
            existingFields={fields}
            entityValidationRules={entityValidationRules}
            entityName={entityName}
            onSubmit={handleFormSubmit}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {isVersionLocked && (
        <div className="flex items-center justify-between rounded-md border border-muted bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-3.5" />
            <span>
              {versionStatus === "published"
                ? "This version is published. Fields are read-only."
                : "This version is archived. Fields are read-only."}
            </span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Plus className="size-3" />
            Create New Version
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-semibold shrink-0">Fields</h2>
          <Badge variant="secondary" className="text-xs shrink-0">
            {fields.length} fields
          </Badge>
          {readonly && !isVersionLocked && (
            <Badge variant="outline" className="text-xs text-warning shrink-0">
              Read-only
            </Badge>
          )}
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
          <span className="text-sm text-meta-text-soft truncate">
            Define and organize the data structure for this entity.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Search */}
          <div className="relative w-[180px]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-meta-text-soft pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fields..."
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {/* Origin filter */}
          <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as typeof originFilter)}>
            <SelectTrigger size="sm" className="w-[150px] gap-1.5 !text-xs">
              <Filter className="size-3.5 text-meta-text-soft" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="text-xs" value="all">All fields</SelectItem>
              <SelectItem className="text-xs" value="standard">Standard ({originCounts.standard})</SelectItem>
              <SelectItem className="text-xs" value="business">Custom ({originCounts.business})</SelectItem>
              <SelectItem className="text-xs" value="system">System ({originCounts.system})</SelectItem>
            </SelectContent>
          </Select>
          {deprecatedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeprecated(!showDeprecated)}
              className="gap-1.5"
            >
              <Archive className="size-3.5" />
              {showDeprecated
                ? "Hide deprecated"
                : `Show deprecated (${deprecatedCount})`}
            </Button>
          )}
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
          <div className="rounded-lg border" role="list" aria-label="Entity fields">
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
                  onEdit={handleEdit}
                  onDelete={readonly || hasPublishedVersion ? undefined : handleDelete}
                  onDeprecate={readonly ? undefined : handleDeprecate}
                />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <FieldFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editingField}
        existingFields={fields}
        readonly={readonly}
        onSubmit={handleFormSubmit}
      />

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
