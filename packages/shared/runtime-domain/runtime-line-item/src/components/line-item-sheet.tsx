"use client";

import { LineItemVariantRegistry } from "../registry";
import type { LineItemComposerProps, LineItemEditorProps } from "../types";
import { MetaLineForm } from "./meta-line-form";
import { UnifiedLineItemSheet } from "./unified-line-item-sheet";
import { LineItemFooterAmountStrip } from "./line-item-footer-amount-strip";
import { PROCURE_PANELS } from "../variants/procure-panels";
import { SALES_PANELS } from "../variants/sales-panels";
import { resolveProcureAmountConfig } from "../variants/procure";
import { resolveSalesAmountConfig }   from "../variants/sales";
import { resolveGenericAmountConfig } from "../variants/generic";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { LineItemAmountConfig, LineItemVariantKey } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Variant → amount config resolver dispatch.
// Each resolver already reads entity display_config.line_summary_strip and
// per-field ui_hint.line_summary, so the strip is fully meta-driven and the
// variant just supplies the fallback heuristic.
// ─────────────────────────────────────────────────────────────────────────────
function amountConfigResolverFor(
  key: LineItemVariantKey,
): (entity: CompiledEntity | null) => LineItemAmountConfig | null {
  if (key === "procure") return resolveProcureAmountConfig;
  if (key === "sales")   return resolveSalesAmountConfig;
  return resolveGenericAmountConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC FALLBACK SHEETS (thin wrappers that just use MetaLineForm)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { DrawerShell } from "@athyper/platform-ui/primitives";
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
      await onMutated?.();
      onOpenChange(false);
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  const amountConfig = resolvedEntity ? resolveGenericAmountConfig(resolvedEntity) : null;

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} intent="transactional"
      widthKey={`${entityCode}:generic-line-composer`} defaultWidth={560} expandedWidth={880}
      minWidth={380} maxWidth="92vw" resizable expandable
      badge={resolvedEntity?.entity_name} title={title}
      footerStart={amountConfig || saveError ? (
        <div className="flex min-w-0 flex-col gap-1">
          {saveError && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {saveError}
            </span>
          )}
          {amountConfig && (
            <LineItemFooterAmountStrip
              amountConfig={amountConfig}
              entity={resolvedEntity}
              draft={draft}
              line={(line as LineRecord | null | undefined) ?? null}
              currencyCode={currencyCode}
            />
          )}
        </div>
      ) : undefined}
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
            amountConfigResolver={definition.resolveAmountConfig ?? amountConfigResolverFor(variantKey)}
            onDraftSubmit={props.onDraftSubmit}
            onMutated={props.onMutated}
            lineFieldChangeResolver={props.lineFieldChangeResolver}
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
        amountConfigResolver={resolveProcureAmountConfig}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        lineFieldChangeResolver={props.lineFieldChangeResolver}
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
        amountConfigResolver={resolveSalesAmountConfig}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        lineFieldChangeResolver={props.lineFieldChangeResolver}
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
  const drawerMode = props.mode ?? (props.readOnly || props.canEdit === false ? "view" : "edit");
  const drawerReadOnly = drawerMode === "view" || props.readOnly === true || props.canEdit === false;

  // Check registry first for custom variants
  if (variantKey) {
    const definition = LineItemVariantRegistry.resolve(variantKey);
    if (definition) {
      if (definition.panels?.length) {
        return (
          <UnifiedLineItemSheet
            mode={drawerMode}
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
            amountConfigResolver={definition.resolveAmountConfig ?? amountConfigResolverFor(variantKey)}
            readOnly={drawerReadOnly}
            canEdit={props.canEdit}
            onPromoteToEdit={props.onPromoteToEdit}
            initialPanel={props.initialTab}
            onDraftSubmit={props.onDraftSubmit}
            onMutated={props.onMutated}
            hasPreviousLine={props.hasPreviousLine}
            hasNextLine={props.hasNextLine}
            linePositionLabel={props.linePositionLabel}
            stagedPatch={props.stagedPatch}
            stagedLineCount={props.stagedLineCount}
            onStageLinePatch={props.onStageLinePatch}
            onSaveStagedLines={props.onSaveStagedLines}
            onPreviousLine={props.onPreviousLine}
            onNextLine={props.onNextLine}
            lineFieldChangeResolver={props.lineFieldChangeResolver}
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
        mode={drawerMode}
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
        amountConfigResolver={resolveProcureAmountConfig}
        readOnly={drawerReadOnly}
        canEdit={props.canEdit}
        onPromoteToEdit={props.onPromoteToEdit}
        initialPanel={props.initialTab}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        hasPreviousLine={props.hasPreviousLine}
        hasNextLine={props.hasNextLine}
        linePositionLabel={props.linePositionLabel}
        stagedPatch={props.stagedPatch}
        stagedLineCount={props.stagedLineCount}
        onStageLinePatch={props.onStageLinePatch}
        onSaveStagedLines={props.onSaveStagedLines}
        onPreviousLine={props.onPreviousLine}
        onNextLine={props.onNextLine}
        lineFieldChangeResolver={props.lineFieldChangeResolver}
      />
    );
  }
  if (key === "sales") {
    return (
      <UnifiedLineItemSheet
        mode={drawerMode}
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
        amountConfigResolver={resolveSalesAmountConfig}
        readOnly={drawerReadOnly}
        canEdit={props.canEdit}
        onPromoteToEdit={props.onPromoteToEdit}
        initialPanel={props.initialTab}
        onDraftSubmit={props.onDraftSubmit}
        onMutated={props.onMutated}
        hasPreviousLine={props.hasPreviousLine}
        hasNextLine={props.hasNextLine}
        linePositionLabel={props.linePositionLabel}
        stagedPatch={props.stagedPatch}
        stagedLineCount={props.stagedLineCount}
        onStageLinePatch={props.onStageLinePatch}
        onSaveStagedLines={props.onSaveStagedLines}
        onPreviousLine={props.onPreviousLine}
        onNextLine={props.onNextLine}
        lineFieldChangeResolver={props.lineFieldChangeResolver}
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
      headerRight={
        props.linePositionLabel || props.hasPreviousLine || props.hasNextLine ? (
          <div className="flex items-center gap-2">
            {props.linePositionLabel ? (
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {props.linePositionLabel}
              </span>
            ) : null}
            <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!props.hasPreviousLine}
              onClick={props.onPreviousLine}
              aria-label="Previous line"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={!props.hasNextLine}
              onClick={props.onNextLine}
              aria-label="Next line"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            </div>
          </div>
        ) : undefined
      }
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
