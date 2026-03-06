"use client";

/**
 * CollectionFieldRenderer — Meta-driven inline grid for cardinality=many fields.
 *
 * Renders child rows in an editable grid (or read-only table in view mode).
 * Columns are auto-derived from the child entity's field metadata.
 * Supports add/remove/reorder based on collectionBehavior config.
 */

import { Button, Input, Label } from "@neon/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";

import type { ResolvedFieldMeta } from "@/lib/entity-page/resolve-field-meta";
import type { FieldMeta } from "@/lib/use-entity-fields";
import type {
  CollectionRow,
  UseCollectionFieldResult,
} from "@/lib/use-collection-field";


// ============================================================================
// Types
// ============================================================================

interface CollectionFieldRendererProps {
  resolved: ResolvedFieldMeta;
  /** Parent record ID (required to fetch child rows) */
  parentId?: string;
  /** Parent entity name */
  parentEntity: string;
  /** Collection hook result — caller manages the hook lifecycle */
  collection: UseCollectionFieldResult;
  /** View mode */
  viewMode: "view" | "edit" | "create";
}

// System fields to hide in the grid
const GRID_HIDDEN_FIELDS = new Set([
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

// ============================================================================
// Main Component
// ============================================================================

export function CollectionFieldRenderer({
  resolved,
  parentId,
  parentEntity,
  collection,
  viewMode,
}: CollectionFieldRendererProps) {
  const {
    rows,
    childFields,
    loading,
    saving,
    error,
    addRow,
    removeRow,
    updateRow,
    save,
  } = collection;

  const collectionConfig = resolved.field.collectionBehavior as Record<
    string,
    unknown
  > | null;
  const maxItems = collectionConfig?.maxItems as number | undefined;
  const canAddMore = maxItems == null || rows.length < maxItems;
  const isEditable = viewMode !== "view";

  // Derive visible columns from child field metadata
  const visibleFields = getVisibleChildFields(
    childFields,
    resolved.field.childFkField,
  );

  if (loading) {
    return (
      <CollectionShell label={resolved.displayLabel}>
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading...
        </div>
      </CollectionShell>
    );
  }

  if (error) {
    return (
      <CollectionShell label={resolved.displayLabel}>
        <p className="py-2 text-sm text-destructive">{error}</p>
      </CollectionShell>
    );
  }

  // No child fields metadata yet — can't render columns
  if (!childFields || visibleFields.length === 0) {
    return (
      <CollectionShell label={resolved.displayLabel}>
        <p className="py-2 text-sm text-muted-foreground">
          {rows.length === 0
            ? "No rows."
            : `${rows.length} row(s) — field metadata unavailable.`}
        </p>
      </CollectionShell>
    );
  }

  return (
    <CollectionShell label={resolved.displayLabel}>
      {/* Grid header */}
      <div
        className="grid gap-2 text-xs font-medium text-muted-foreground border-b pb-1 mb-1"
        style={gridStyle(visibleFields.length, isEditable)}
      >
        {visibleFields.map((f) => (
          <div key={f.columnName}>{f.label ?? humanize(f.columnName)}</div>
        ))}
        {isEditable && <div />}
      </div>

      {/* Grid rows */}
      {rows.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground text-center">
          No rows yet.
        </p>
      )}

      {rows.map((row, _idx) => (
        <CollectionGridRow
          key={row._clientId}
          row={row}
          fields={visibleFields}
          isEditable={isEditable}
          onUpdate={(field, value) => updateRow(row._clientId, field, value)}
          onRemove={() => removeRow(row._clientId)}
        />
      ))}

      {/* Footer: add button + save */}
      {isEditable && (
        <div className="flex items-center justify-between pt-2 border-t mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canAddMore || saving}
            onClick={() => addRow()}
          >
            <Plus className="size-3.5 mr-1" />
            Add Row
          </Button>

          {rows.some((r) => r._dirty || r._isNew) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              Save Lines
            </Button>
          )}
        </div>
      )}
    </CollectionShell>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function CollectionShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="col-span-full space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="rounded-md border p-3 bg-muted/30">{children}</div>
    </div>
  );
}

function CollectionGridRow({
  row,
  fields,
  isEditable,
  onUpdate,
  onRemove,
}: {
  row: CollectionRow;
  fields: FieldMeta[];
  isEditable: boolean;
  onUpdate: (field: string, value: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="grid gap-2 items-center py-1"
      style={gridStyle(fields.length, isEditable)}
    >
      {fields.map((f) => {
        const value = row[f.columnName];

        if (!isEditable) {
          return (
            <div key={f.columnName} className="text-sm truncate">
              {value != null ? String(value) : "\u2014"}
            </div>
          );
        }

        return (
          <Input
            key={f.columnName}
            className="h-8 text-sm"
            defaultValue={value != null ? String(value) : ""}
            placeholder={f.label ?? humanize(f.columnName)}
            onChange={(e) => onUpdate(f.columnName, e.target.value || null)}
          />
        );
      })}

      {isEditable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Filter child fields to only show business-relevant columns in the grid.
 * Hides system fields, the parent FK field, and sort_order.
 */
function getVisibleChildFields(
  fields: FieldMeta[] | null,
  parentFkField: string | null,
): FieldMeta[] {
  if (!fields) return [];

  return fields.filter((f) => {
    if (GRID_HIDDEN_FIELDS.has(f.columnName)) return false;
    // Hide the FK back to parent — redundant in context
    if (parentFkField && f.columnName === parentFkField) return false;
    // Hide sort_order — managed by reorder
    if (f.columnName === "sort_order" || f.columnName === "line_number")
      return false;
    // Hide system-origin fields
    if (f.origin === "system") return false;
    return true;
  });
}

function gridStyle(
  fieldCount: number,
  hasActions: boolean,
): React.CSSProperties {
  const dataCols = Array(fieldCount).fill("1fr").join(" ");
  return {
    gridTemplateColumns: hasActions ? `${dataCols} auto` : dataCols,
  };
}

function humanize(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
