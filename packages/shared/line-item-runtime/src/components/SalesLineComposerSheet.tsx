"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { fmtAmount } from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import {
  buildCreatePayload,
  buildLinePatch,
  fieldLabel,
  fieldOptions,
  formatFieldValue,
  initialDraft,
  recordId,
  recordValue,
  resolveTitleField,
  useCompiledEntityMetadata,
} from "../meta";
import type { LineItemComposerProps, LineItemSection, LineRecord } from "../types";
import {
  resolveSalesComposerSections,
  resolveSalesAmountConfig,
  normalizeSalesDraftLine,
} from "../variants/sales";
import { fieldsForGroups } from "../variants/procure";
import { MetaFieldInput } from "./MetaFieldInput";
import { MetaLineForm } from "./MetaLineForm";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABEL_CLASS   = "text-sm font-medium leading-normal text-muted-foreground";
const SECTION_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function collectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

function itemUrl(entityCode: string, parentId: string, lineId: string): string {
  return `${collectionUrl(entityCode, parentId)}/${encodeURIComponent(lineId)}`;
}

type SaveErrorBody = { error?: string; message?: string; detail?: string; details?: unknown };

function saveErrorMessage(body: SaveErrorBody, status: number): string {
  const main = body.message ?? body.detail ?? body.error;
  if (main) return body.error && body.error !== main ? `${main} (${body.error})` : main;
  return `Save failed (${status})`;
}

function nonEmptyText(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function displayLabel(value: string | null | undefined): string {
  const text = String(value ?? "").replace(/_/g, " ").replace(/[\s/]+/g, " ").trim();
  if (!text) return "";
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function compactTitle(value: string, limit = 50): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}

function titleFor(entity: CompiledEntity | null, line: DocumentLine | null | undefined, draft: Record<string, unknown>): string {
  const fallback = line ? `Edit ${entity?.entity_name ?? "line"}` : `Add ${entity?.entity_name ?? "line"}`;
  const tf    = resolveTitleField(entity);
  const value = tf ? (draft[tf.name] ?? (line ? recordValue(line as LineRecord, tf) : undefined)) : undefined;
  return nonEmptyText(value) ?? fallback;
}

function uniqueEntityFields(fields: EntityField[]): EntityField[] {
  const seen = new Set<string>();
  return fields.filter((f) => { if (seen.has(f.name)) return false; seen.add(f.name); return true; });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE PILLS
// ─────────────────────────────────────────────────────────────────────────────

function TypePillsField({
  field, value, onChange, disabled,
}: {
  field: EntityField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean;
}) {
  const opts = fieldOptions(field);
  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-input bg-background p-0.5">
      {opts.map((opt) => {
        const active = String(value ?? "") === opt.value;
        return (
          <button key={opt.value} type="button" disabled={disabled}
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CELL
// ─────────────────────────────────────────────────────────────────────────────

function FieldCell({
  field, draft, onDraftChange, disabled, formData,
}: {
  field: EntityField; draft: Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?: boolean; formData?: Record<string, unknown>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>
        {fieldLabel(field)}{field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {field.data_type === "enum" || field.data_type === "lifecycle_state" ? (
        <TypePillsField field={field} value={draft[field.name]} disabled={disabled}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })} />
      ) : (
        <MetaFieldInput field={field} value={draft[field.name]} disabled={disabled}
          formData={formData ?? draft} onChange={(v) => onDraftChange({ ...draft, [field.name]: v })} />
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCORDION SECTION
// ─────────────────────────────────────────────────────────────────────────────

function AccordionSection({
  section, entity, draft, onDraftChange, disabled, formData,
}: {
  section: LineItemSection; entity: CompiledEntity;
  draft: Record<string, unknown>; onDraftChange: (next: Record<string, unknown>) => void;
  disabled?: boolean; formData?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(section.defaultOpen);

  const fields = useMemo(() => {
    const byName = new Map(entity.fields.map((f) => [f.name, f]));
    const explicit = section.fields.flatMap((name) => byName.get(name) ? [byName.get(name)!] : []);
    const fromGroups = fieldsForGroups(entity, section.groups)
      .filter((f) => !section.fields.includes(f.name));
    return uniqueEntityFields([...explicit, ...fromGroups]);
  }, [entity, section]);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/20">
        <span className={SECTION_LABEL_CLASS}>{displayLabel(section.label)}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/50 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {fields.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <FieldCell key={field.name} field={field} draft={draft}
                  onDraftChange={onDraftChange} disabled={disabled} formData={formData} />
              ))}
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground/50">No configurable fields.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES LINE COMPOSER SHEET
// ─────────────────────────────────────────────────────────────────────────────

export function SalesLineComposerSheet({
  open,
  onOpenChange,
  line,
  entityCode,
  recordId:       parentRecordId,
  currencyCode,
  companyCodeId,
  record,
  lineEntity,
  lineEntityCode,
  composerMode = "manual",
  onMutated,
  onDraftSubmit,
}: LineItemComposerProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;

  const sections    = useMemo(() => resolveSalesComposerSections(resolvedEntity), [resolvedEntity]);
  const amountConfig = useMemo(() => resolveSalesAmountConfig(resolvedEntity), [resolvedEntity]);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isNew   = !line;
  const lineKey = recordId(line as LineRecord | null | undefined);

  const fieldFormData = useMemo(() => ({
    ...(record ?? {}),
    ...draft,
    ...(companyCodeId ? { company_code_id: companyCodeId } : {}),
  }), [companyCodeId, draft, record]);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    setDraft(initialDraft(resolvedEntity, line as LineRecord | null | undefined));
    setSaveError(null);
  }, [lineKey, open, resolvedEntity]);

  const title = useMemo(() => titleFor(resolvedEntity, line, draft), [draft, line, resolvedEntity]);

  async function save() {
    if (!resolvedEntity) return;
    let payload = isNew
      ? buildCreatePayload(resolvedEntity, draft)
      : buildLinePatch(resolvedEntity, draft, line as LineRecord);

    payload = normalizeSalesDraftLine(payload);

    if (!isNew && Object.keys(payload).length === 0) { onOpenChange(false); return; }

    if (onDraftSubmit) {
      setSaving(true);
      setSaveError(null);
      try { await onDraftSubmit(payload); onOpenChange(false); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to update draft line"); }
      finally { setSaving(false); }
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await relayMutate(
        isNew ? collectionUrl(entityCode, parentRecordId) : itemUrl(entityCode, parentRecordId, lineKey),
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as SaveErrorBody;
        setSaveError(saveErrorMessage(body, res.status));
        return;
      }
      onMutated?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey={`${entityCode}:sales-line-composer`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badgeDetail={
        <span className="inline-flex h-8 max-w-[12rem] items-center overflow-hidden rounded-lg bg-foreground text-background shadow-sm ring-1 ring-border/20">
          <span className="min-w-0 px-3 text-xs font-medium leading-none">
            <span className="block truncate">{isNew ? "Add Line" : displayLabel(resolvedEntity?.entity_name ?? "Line")}</span>
          </span>
        </span>
      }
      title={<span title={title}>{compactTitle(title)}</span>}
      footerStart={
        saveError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />{saveError}
          </span>
        ) : undefined
      }
      footerEnd={
        <>
          <button type="button" onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving || !resolvedEntity}
            className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40">
            {saving ? "Saving…" : isNew ? "Add line" : "Save"}
          </button>
        </>
      }
    >
      {resolvedEntity ? (
        sections.length > 0 ? (
          <div>
            {sections.map((section) => (
              <AccordionSection key={section.key} section={section} entity={resolvedEntity}
                draft={draft} onDraftChange={setDraft} disabled={saving} formData={fieldFormData} />
            ))}
          </div>
        ) : (
          <MetaLineForm entity={resolvedEntity} draft={draft} onDraftChange={setDraft}
            disabled={saving} formData={fieldFormData} />
        )
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          Line metadata is not configured for this document.
        </div>
      )}
    </DrawerShell>
  );
}
