"use client";

/**
 * ChildRecordRepeater — generic repeater for child-entity rows within
 * a composite intake wizard step.
 *
 * Renders a list of child-entity rows. Each row expands into an inline
 * editor using FlowFieldBinding for individual field rendering.
 *
 * Generic — no supplier-specific code. All entity / field metadata
 * comes from FlowSectionDescriptor (payload_key, child_fields, etc.).
 */

import React, { useId } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "@athyper/ui/primitives";
import { FlowFieldBinding } from "../intake/FlowFieldBinding";
import { isTruthy } from "../intake/evaluateRule";
import { childFieldToBinding } from "./types";
import type { ChildFieldSpec } from "./types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChildRecordRepeaterProps {
  /** The section key — used for unique DOM id generation. */
  sectionKey: string;
  /** Human label rendered in the section header. */
  label: string;
  /** Child entity field specs (from FlowSectionDescriptor.child_fields). */
  fields: ChildFieldSpec[];
  /** Current rows state. */
  rows: Record<string, unknown>[];
  /** Fires when rows change (add/edit/remove). */
  onChange: (rows: Record<string, unknown>[]) => void;
  /** Validation errors keyed `${rowIndex}__${fieldName}`. */
  rowErrors?: Record<string, string>;
  /** Parent wizard draft, merged into row context for country-aware controls. */
  parentDraft?: Record<string, unknown>;
  /** Minimum number of rows that must exist (remove disabled at limit). */
  minRows?: number;
  /** Maximum number of rows (add disabled at limit). */
  maxRows?: number;
  /** Default values pre-filled into each new row (e.g. { is_primary: false }). */
  defaultRow?: Record<string, unknown>;
  /** Label for the Add button (default: "Add {label}"). */
  addLabel?: string;
  /** If set, user must have this permission to interact (view-only otherwise). */
  permissionCode?: string | null;
  /** Pre-evaluated visibility: if false, renders nothing. */
  visibleWhen?: boolean;
  /** Permissions the current user holds (used for permissionCode check). */
  userPermissions: string[];
  /** When true, all inputs are disabled regardless of permissions. */
  restrictedViewOnly?: boolean;
  /** When true, renders a subtle help note that this section is optional. */
  optional?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChildRecordRepeater({
  sectionKey,
  label,
  fields,
  rows,
  onChange,
  rowErrors = {},
  parentDraft = {},
  minRows = 0,
  maxRows,
  defaultRow = {},
  addLabel,
  permissionCode,
  visibleWhen = true,
  userPermissions,
  restrictedViewOnly = false,
  optional = false,
}: ChildRecordRepeaterProps) {
  const uid = useId();
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(() => new Set([0]));

  if (!visibleWhen) return null;

  const isReadOnly =
    restrictedViewOnly ||
    (permissionCode != null && !userPermissions.includes(permissionCode));

  const canAdd    = !isReadOnly && (maxRows == null || rows.length < maxRows);
  const canRemove = !isReadOnly && rows.length > minRows;

  function handleAddRow() {
    const hasPrimaryFlag = fields.some((field) => field.field_name === "is_primary");
    const newRow = {
      ...defaultRow,
      ...(hasPrimaryFlag && rows.length === 0 ? { is_primary: true } : {}),
    };
    const newRows = [...rows, newRow];
    onChange(newRows);
    // Auto-expand the new row
    setExpandedRows(prev => new Set([...prev, newRows.length - 1]));
  }

  function handleRemoveRow(idx: number) {
    const newRows = rows.filter((_, i) => i !== idx);
    onChange(newRows);
    setExpandedRows(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  }

  function handleFieldChange(rowIdx: number, fieldName: string, value: unknown) {
    const newRows = rows.map((r, i) => {
      const next = i === rowIdx ? { ...r, [fieldName]: value } : { ...r };

      if (fieldName === "is_primary" && value === true && i !== rowIdx) {
        next["is_primary"] = false;
      }

      if (fieldName === "country_code" && i === rowIdx) {
        next["region"] = null;
        next["state_region"] = null;
        next["state_region_code"] = null;
      }

      if (fieldName === "contact_role" && value === "primary" && i === rowIdx) {
        next["contact_role"] = "general";
        next["is_primary"] = true;
      }

      return next;
    });
    onChange(newRows);
  }

  function toggleRow(idx: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const sortedFields = fields
    .filter((field) => field.field_name !== "status" && field.data_type !== "lifecycle_state")
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {optional && (
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          )}
          {rows.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
              {rows.length}
            </span>
          )}
          {isReadOnly && (
            <span className="text-xs text-muted-foreground italic">read-only</span>
          )}
        </div>

        {canAdd && (
          <button
            type="button"
            onClick={handleAddRow}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
              "border border-border bg-background text-foreground",
              "hover:bg-muted transition-colors",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel ?? `Add ${label}`}
          </button>
        )}
      </div>

      {/* Rows */}
      {rows.length === 0 && (
        <div className={cn(
          "rounded-lg border border-dashed border-border px-4 py-5 text-center",
          "text-sm text-muted-foreground",
        )}>
          {optional
            ? `No ${label.toLowerCase()} added — skip or add one below.`
            : `Add at least ${minRows > 0 ? minRows : "one"} ${label.toLowerCase()}.`}
        </div>
      )}

      {rows.map((row, rowIdx) => {
        const isExpanded = expandedRows.has(rowIdx);
        const rowLabel = getRowLabel(row, sortedFields, rowIdx);
        const hasError = Object.keys(rowErrors).some(k => k.startsWith(`${rowIdx}__`));

        return (
          <Card
            key={`${uid}-row-${rowIdx}`}
            className={cn(
              "overflow-hidden transition-colors",
              hasError && "border-destructive/60",
            )}
          >
            {/* Row header — div instead of button to allow the remove button inside */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleRow(rowIdx)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(rowIdx); } }}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left cursor-pointer",
                "bg-muted/30 hover:bg-muted/50 transition-colors",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate text-sm font-medium text-foreground">
                  {rowLabel}
                </span>
                {hasError && (
                  <span className="shrink-0 text-xs font-medium text-destructive">
                    · incomplete
                  </span>
                )}
              </div>

              {canRemove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemoveRow(rowIdx); }}
                  className={cn(
                    "ml-2 shrink-0 rounded-md p-1 text-muted-foreground",
                    "hover:bg-destructive/10 hover:text-destructive transition-colors",
                  )}
                  title={`Remove ${label} row`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Row fields */}
            {isExpanded && (
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {sortedFields.map((fieldSpec) => {
                    const binding = childFieldToBinding(fieldSpec, rowIdx, sectionKey);
                    const errKey  = `${rowIdx}__${fieldSpec.field_name}`;
                    const value   = row[fieldSpec.field_name];

                    // Evaluate field visibility predicate against the row's own values
                    // (simple top-level key lookup — no draft context for child rows)
                    if (fieldSpec.visible_when) {
                      try {
                        const ctx = { draft: row, ctx: {}, meta: {} };
                        const shown = isTruthy(fieldSpec.visible_when, ctx);
                        if (!shown) return null;
                      } catch {
                        // keep visible on error
                      }
                    }

                    return (
                      <FlowFieldBinding
                        key={binding.id}
                        binding={binding}
                        value={value}
                        error={rowErrors[errKey]}
                        userPermissions={isReadOnly ? [] : userPermissions}
                        isOverridden={false}
                        draftCtx={{ ...parentDraft, ...row }}
                        onChange={(v) => handleFieldChange(rowIdx, fieldSpec.field_name, v)}
                        onOverride={(v) => handleFieldChange(rowIdx, fieldSpec.field_name, v)}
                        onReset={() => handleFieldChange(rowIdx, fieldSpec.field_name, undefined)}
                      />
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Section-level errors */}
      {(rowErrors[`${sectionKey}__min`] || rowErrors["min"]) && (
        <p className="text-xs text-destructive">{rowErrors[`${sectionKey}__min`] ?? rowErrors["min"]}</p>
      )}
    </div>
  );
}

// ── Label derivation ──────────────────────────────────────────────────────────

function getRowLabel(
  row: Record<string, unknown>,
  fields: ChildFieldSpec[],
  rowIdx: number,
): string {
  // Use the first text-like field that has a value as the row summary label
  const candidates = ["name", "contact_name", "member_name", "value", "country_code", "bank_name", "account_number"];
  for (const key of candidates) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // Fall back to the first string field with a value
  const firstField = fields.find(f => {
    const v = row[f.field_name];
    return typeof v === "string" && (v as string).trim();
  });
  if (firstField) return String(row[firstField.field_name]);
  return `Row ${rowIdx + 1}`;
}
