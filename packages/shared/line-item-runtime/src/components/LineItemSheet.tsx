"use client";

import { LineItemVariantRegistry } from "../registry";
import type { LineItemComposerProps, LineItemEditorProps, LineItemVariantKey } from "../types";
import { ProcureLineComposerSheet } from "./ProcureLineComposerSheet";
import { ProcureLineEditorSheet } from "./ProcureLineEditorSheet";
import { SalesLineComposerSheet } from "./SalesLineComposerSheet";
import { SalesLineEditorSheet } from "./SalesLineEditorSheet";
import { MetaLineForm } from "./MetaLineForm";
import { UnifiedLineItemSheet } from "./UnifiedLineItemSheet";
import { PROCURE_PANELS } from "../variants/procure-panels";
import { SALES_PANELS } from "../variants/sales-panels";

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC FALLBACK SHEETS (thin wrappers that just use MetaLineForm)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DrawerShell } from "@athyper/ui/primitives";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  buildCreatePayload,
  buildLinePatch,
  fieldLabel,
  initialDraft,
  recordId,
  resolveTitleField,
  recordValue,
  useCompiledEntityMetadata,
} from "../meta";
import type { LineRecord } from "../types";

function genericCollectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}
function genericItemUrl(entityCode: string, parentId: string, lineId: string): string {
  return `${genericCollectionUrl(entityCode, parentId)}/${encodeURIComponent(lineId)}`;
}

function GenericLineComposerSheet({
  open, onOpenChange, line, entityCode, recordId: parentRecordId,
  currencyCode, lineEntity, lineEntityCode, companyCodeId, record,
  onMutated, onDraftSubmit,
}: LineItemComposerProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntity ? null : lineEntityCode);
  const resolvedEntity = lineEntity ?? fetchedEntity;
  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isNew   = !line;
  const lineKey = recordId(line as LineRecord | null | undefined);
  const title   = useMemo(() => {
    const fallback = isNew ? `Add ${resolvedEntity?.entity_name ?? "line"}` : `Edit ${resolvedEntity?.entity_name ?? "line"}`;
    const tf = resolveTitleField(resolvedEntity);
    const v  = tf ? (line ? recordValue(line as LineRecord, tf) : undefined) : undefined;
    return v != null && String(v).trim() ? String(v) : fallback;
  }, [isNew, line, resolvedEntity]);

  useEffect(() => {
    if (!open || !resolvedEntity) return;
    setDraft(initialDraft(resolvedEntity, line as LineRecord | null | undefined));
    setSaveError(null);
  }, [lineKey, open, resolvedEntity]);

  async function save() {
    if (!resolvedEntity) return;
    const payload = isNew ? buildCreatePayload(resolvedEntity, draft) : buildLinePatch(resolvedEntity, draft, line as LineRecord);
    if (!isNew && Object.keys(payload).length === 0) { onOpenChange(false); return; }
    if (onDraftSubmit) {
      setSaving(true); setSaveError(null);
      try { await onDraftSubmit(payload); onOpenChange(false); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Save failed"); }
      finally { setSaving(false); }
      return;
    }
    setSaving(true); setSaveError(null);
    try {
      const res = await relayMutate(
        isNew ? genericCollectionUrl(entityCode, parentRecordId) : genericItemUrl(entityCode, parentRecordId, lineKey),
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) },
      );
      if (!res.ok) { setSaveError(`Save failed (${res.status})`); return; }
      onMutated?.(); onOpenChange(false);
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} intent="transactional"
      widthKey={`${entityCode}:generic-line-composer`} defaultWidth={560} expandedWidth={880}
      minWidth={380} maxWidth="92vw" resizable expandable
      badge={resolvedEntity?.entity_name} title={title}
      footerStart={saveError ? <span className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{saveError}</span> : undefined}
      footerEnd={<>
        <button type="button" onClick={() => onOpenChange(false)} className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || !resolvedEntity} className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40">{saving ? "Saving…" : isNew ? "Add" : "Save"}</button>
      </>}
    >
      {resolvedEntity ? (
        <MetaLineForm entity={resolvedEntity} draft={draft} onDraftChange={setDraft} disabled={saving} formData={{ ...(record ?? {}), ...draft, ...(companyCodeId ? { company_code_id: companyCodeId } : {}) }} />
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">Line metadata not configured.</div>
      )}
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT-AWARE LINE ITEM COMPOSER SHEET
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemComposerSheetProps extends LineItemComposerProps {
  /** Override the variant key; defaults to resolving via registry from display_config */
  variantKey?: LineItemVariantKey;
}

export function LineItemComposerSheet({ variantKey, ...props }: LineItemComposerSheetProps) {
  const key = variantKey ?? inferVariantKey(props.lineEntity, props.lineEntityCode, props.entityCode);

  // Check registry first for custom variants
  if (variantKey) {
    const definition = LineItemVariantRegistry.resolve(variantKey);
    if (definition) {
      if (definition.panels?.length) {
        return (
          <UnifiedLineItemSheet
            mode="compose"
            open={props.open}
            onOpenChange={props.onOpenChange}
            entityCode={props.entityCode}
            recordId={props.recordId}
            lineEntityCode={props.lineEntityCode}
            lineEntity={props.lineEntity}
            record={props.record}
            currencyCode={props.currencyCode}
            companyCodeId={props.companyCodeId}
            line={props.line}
            panels={definition.panels}
            onDraftSubmit={props.onDraftSubmit}
            onMutated={props.onMutated}
          />
        );
      }
      if (definition.ComposerSheet) return <definition.ComposerSheet {...props} />;
    }
  }

  // Built-in panel-based variants
  if (key === "procure") {
    return (
      <UnifiedLineItemSheet
        mode="compose"
        open={props.open}
        onOpenChange={props.onOpenChange}
        entityCode={props.entityCode}
        recordId={props.recordId}
        lineEntityCode={props.lineEntityCode}
        lineEntity={props.lineEntity}
        record={props.record}
        currencyCode={props.currencyCode}
        companyCodeId={props.companyCodeId}
        line={props.line ?? undefined}
        panels={PROCURE_PANELS}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
      />
    );
  }
  if (key === "sales") {
    return (
      <UnifiedLineItemSheet
        mode="compose"
        open={props.open}
        onOpenChange={props.onOpenChange}
        entityCode={props.entityCode}
        recordId={props.recordId}
        lineEntityCode={props.lineEntityCode}
        lineEntity={props.lineEntity}
        record={props.record}
        currencyCode={props.currencyCode}
        companyCodeId={props.companyCodeId}
        line={props.line ?? undefined}
        panels={SALES_PANELS}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
      />
    );
  }
  return <GenericLineComposerSheet {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT-AWARE LINE ITEM EDITOR SHEET
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemEditorSheetProps extends LineItemEditorProps {
  variantKey?: LineItemVariantKey;
}

export function LineItemEditorSheet({ variantKey, ...props }: LineItemEditorSheetProps) {
  const key = variantKey ?? inferVariantKey(props.lineEntity, props.lineEntityCode, props.entityCode);

  // Check registry first for custom variants
  if (variantKey) {
    const definition = LineItemVariantRegistry.resolve(variantKey);
    if (definition) {
      if (definition.panels?.length) {
        return (
          <UnifiedLineItemSheet
            mode="edit"
            open={props.open}
            onOpenChange={props.onOpenChange}
            entityCode={props.entityCode}
            recordId={props.recordId}
            lineEntityCode={props.lineEntityCode}
            lineEntity={props.lineEntity}
            record={props.record}
            currencyCode={props.currencyCode}
            companyCodeId={props.companyCodeId}
            line={props.line}
            panels={definition.panels}
            readOnly={props.readOnly && !props.canEdit}
            initialPanel={props.initialTab}
            onDraftSubmit={props.onDraftSubmit}
            onMutated={props.onMutated}
            hasPreviousLine={props.hasPreviousLine}
            hasNextLine={props.hasNextLine}
            onPreviousLine={props.onPreviousLine}
            onNextLine={props.onNextLine}
          />
        );
      }
      if (definition.EditorSheet) return <definition.EditorSheet {...props} />;
    }
  }

  // Built-in panel-based variants
  if (key === "procure") {
    return (
      <UnifiedLineItemSheet
        mode="edit"
        open={props.open}
        onOpenChange={props.onOpenChange}
        entityCode={props.entityCode}
        recordId={props.recordId}
        lineEntityCode={props.lineEntityCode}
        lineEntity={props.lineEntity}
        record={props.record}
        currencyCode={props.currencyCode}
        companyCodeId={props.companyCodeId}
        line={props.line}
        panels={PROCURE_PANELS}
        readOnly={props.readOnly && !props.canEdit}
        initialPanel={props.initialTab}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        hasPreviousLine={props.hasPreviousLine}
        hasNextLine={props.hasNextLine}
        onPreviousLine={props.onPreviousLine}
        onNextLine={props.onNextLine}
      />
    );
  }
  if (key === "sales") {
    return (
      <UnifiedLineItemSheet
        mode="edit"
        open={props.open}
        onOpenChange={props.onOpenChange}
        entityCode={props.entityCode}
        recordId={props.recordId}
        lineEntityCode={props.lineEntityCode}
        lineEntity={props.lineEntity}
        record={props.record}
        currencyCode={props.currencyCode}
        companyCodeId={props.companyCodeId}
        line={props.line}
        panels={SALES_PANELS}
        readOnly={props.readOnly && !props.canEdit}
        initialPanel={props.initialTab}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        hasPreviousLine={props.hasPreviousLine}
        hasNextLine={props.hasNextLine}
        onPreviousLine={props.onPreviousLine}
        onNextLine={props.onNextLine}
      />
    );
  }

  // Generic fallback — read-only field grid
  return (
    <DrawerShell
      open={props.open}
      onOpenChange={props.onOpenChange}
      intent="transactional"
      widthKey={`${props.entityCode}:generic-line-editor`}
      defaultWidth={560}
      expandedWidth={880}
      minWidth={380}
      maxWidth="92vw"
      resizable
      expandable
      badge={props.lineEntity?.entity_name}
      title="Line Detail"
      footerEnd={
        <button type="button" onClick={() => props.onOpenChange(false)}
          className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground">
          Close
        </button>
      }
    >
      {props.lineEntity ? (
        <MetaLineForm
          entity={props.lineEntity}
          draft={Object.fromEntries(props.lineEntity.fields.map((f) => [f.name, recordValue(props.line as LineRecord, f)]))}
          onDraftChange={() => {}}
          mode="view"
          currencyCode={props.currencyCode}
        />
      ) : (
        <div className="px-5 py-8 text-sm text-muted-foreground">Line metadata not configured.</div>
      )}
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT KEY INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function inferVariantKey(
  lineEntity?:    { display_config?: unknown } | null,
  lineEntityCode?: string | null,
  parentEntityCode?: string,
): LineItemVariantKey {
  const displayConfig = lineEntity?.display_config as Record<string, unknown> | null | undefined;
  const configured = displayConfig?.["line_ui_variant"];
  if (typeof configured === "string" && configured.trim()) return configured as LineItemVariantKey;

  // Heuristic: entity code prefix suggests variant
  const code = String(lineEntityCode ?? parentEntityCode ?? "").toLowerCase();
  if (code.includes("sales") || code.includes("order_line") || code.includes("so_line")) return "sales";
  if (
    code.includes("purchase") || code.includes("invoice_line") || code.includes("po_line") ||
    code.includes("gr_line") || code.includes("pr_line") || code.includes("ses_line")
  ) return "procure";

  return "generic";
}
