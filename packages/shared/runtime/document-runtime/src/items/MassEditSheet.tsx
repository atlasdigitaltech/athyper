"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  type LineRecord,
  MetaFieldInput,
  coerceFieldValue,
  editableLineFields,
  fieldLabel,
  recordId,
  recordValue,
} from "./metaLineRuntime";

function lineUrl(entityCode: string, parentRecordId: string, lineId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}`;
}

function comparable(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface MassEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: DocumentLine[];
  lineEntity: CompiledEntity;
  entityCode: string;
  recordId: string;
  onMutated?: () => void;
  onDraftPatch?: (patch: Record<string, unknown>) => void;
}

export function MassEditSheet({
  open,
  onOpenChange,
  lines,
  lineEntity,
  entityCode,
  recordId: parentRecordId,
  onMutated,
  onDraftPatch,
}: MassEditSheetProps) {
  const fields = useMemo(() => editableLineFields(lineEntity), [lineEntity]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({});
    setTouched(new Set());
    setSaveError(null);
  }, [open]);

  // For each field: detect whether all selected lines share the same value
  const fieldSummary = useMemo(() => {
    const summary = new Map<string, { uniform: boolean; sharedValue: unknown }>();
    for (const field of fields) {
      const values = lines.map((line) => comparable(recordValue(line as LineRecord, field)));
      const first = values[0] ?? "";
      const uniform = values.every((v) => v === first);
      summary.set(field.name, {
        uniform,
        sharedValue: uniform ? recordValue(lines[0] as LineRecord, field) : undefined,
      });
    }
    return summary;
  }, [fields, lines]);

  function handleChange(fieldName: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [fieldName]: value }));
    setTouched((prev) => new Set([...prev, fieldName]));
  }

  function handleReset(fieldName: string) {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setTouched((prev) => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }

  async function save() {
    if (touched.size === 0) { onOpenChange(false); return; }

    const patch: Record<string, unknown> = {};
    for (const fieldName of touched) {
      const field = fields.find((f) => f.name === fieldName);
      if (!field) continue;
      patch[fieldName] = coerceFieldValue(field, draft[fieldName]);
    }

    if (onDraftPatch) {
      onDraftPatch(patch);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all(
        lines.map((line) => {
          const id = recordId(line as LineRecord);
          if (!id) return Promise.resolve();
          return relayMutate(lineUrl(entityCode, parentRecordId, id), {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
        }),
      );
      onMutated?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const touchedCount = touched.size;

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="transactional"
      widthKey="mass-edit-lines"
      defaultWidth={580}
      minWidth={380}
      maxWidth="92vw"
      resizable
      badge="Mass Edit"
      title={`Editing ${lines.length} line${lines.length !== 1 ? "s" : ""}`}
      subtitle={`${touchedCount > 0 ? `${touchedCount} field${touchedCount !== 1 ? "s" : ""} changed` : "Fill in only the fields you want to update"}`}
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {saveError}
          </span>
        ) : undefined
      }
      footerEnd={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || touchedCount === 0}
            className="h-8 rounded-lg bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {saving
              ? "Saving..."
              : touchedCount > 0
                ? `Update ${lines.length} line${lines.length !== 1 ? "s" : ""}`
                : "No changes"}
          </button>
        </>
      }
    >
      <div>
        <div className="flex items-start gap-2 border-b border-border/40 bg-muted/30 px-5 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Only fields you fill in will be written. Blank fields are left unchanged on all selected lines.
          </p>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          {fields.map((field) => {
            const summary = fieldSummary.get(field.name);
            const isTouched = touched.has(field.name);
            const inputValue = isTouched ? draft[field.name] : "";

            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {fieldLabel(field)}
                    {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
                  </span>
                  {isTouched && (
                    <button
                      type="button"
                      onClick={() => handleReset(field.name)}
                      className="text-[10px] text-muted-foreground/60 underline underline-offset-2 hover:text-foreground"
                    >
                      reset
                    </button>
                  )}
                </div>

                <MetaFieldInput
                  field={field}
                  value={inputValue}
                  disabled={saving}
                  onChange={(value) => handleChange(field.name, value)}
                />

                {!isTouched && (
                  <span className="text-[10px] text-muted-foreground/50">
                    {summary?.uniform
                      ? `All: ${String(summary.sharedValue ?? "—")}`
                      : `${lines.length} mixed values — will not change`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DrawerShell>
  );
}
