"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { DrawerShell } from "@athyper/ui/primitives";
import { relayMutate } from "@athyper/runtime-shared/client";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
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
import type {
  LineItemAmountConfig,
  LineItemPanel,
  LineItemPanelContext,
  LineItemPanelProps,
  LineRecord,
} from "../types";
import {
  LineItemFooterAmountStrip,
  type LineItemFooterAmountStripStatus,
} from "./LineItemFooterAmountStrip";

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedLineItemSheetProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  /** "compose" = new line creation, "edit" = existing line editing */
  mode:            "compose" | "edit";
  /** Parent document entity code */
  entityCode:      string;
  /** Parent document record ID */
  recordId:        string;
  /** Line entity code (e.g. "purchase_invoice_line") */
  lineEntityCode?: string | null;
  /** Pre-fetched line entity — skips the metadata fetch when provided */
  lineEntity?:     import("@athyper/api-contracts/metadata").CompiledEntity | null;
  /** Parent document header record */
  record?:         Record<string, unknown>;
  currencyCode?:   string;
  companyCodeId?:  string;
  /** Existing line being edited (null/undefined = new line) */
  line?:           DocumentLine | null;
  /** Ordered panel tab definitions for this variant */
  panels:          LineItemPanel[];
  /** Initial active panel key — defaults to first visible panel */
  initialPanel?:   string;
  readOnly?:       boolean;
  /** Server-write mode — skip relayMutate, hand payload to caller instead */
  onDraftSubmit?:  (payload: Record<string, unknown>) => void | Promise<void>;
  onMutated?:      () => void;
  /** Line navigation (editor mode) */
  hasPreviousLine?: boolean;
  hasNextLine?:    boolean;
  onPreviousLine?: () => void;
  onNextLine?:     () => void;
  /**
   * Amount summary strip resolver (Net / Discount / Tax / Gross).
   * When provided, the resolved config is rendered as an inline bar in the
   * footer (left of the Cancel/Save buttons), tracking the running money
   * breakdown for this line as the draft changes.
   *
   * Pass one of `resolveProcureAmountConfig`, `resolveSalesAmountConfig`, or
   * `resolveGenericAmountConfig` from the line-item-runtime variant module.
   * Each resolver already honours entity-level + field-level metadata
   * overrides (display_config.line_summary_strip, ui_hint.line_summary).
   */
  amountConfigResolver?: (entity: CompiledEntity | null) => LineItemAmountConfig | null;
  /** Optional trailing status chip on the summary strip (e.g. "unallocated"). */
  summaryStatus?:        LineItemFooterAmountStripStatus | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// URLS
// ─────────────────────────────────────────────────────────────────────────────

function collectionUrl(entityCode: string, parentId: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentId)}/lines`;
}

function itemUrl(entityCode: string, parentId: string, lineId: string): string {
  return `${collectionUrl(entityCode, parentId)}/${encodeURIComponent(lineId)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────────────────────

function TabBar({
  panels,
  activeKey,
  ctx,
  draft,
  onSelect,
}: {
  panels:    LineItemPanel[];
  activeKey: string;
  ctx:       LineItemPanelContext;
  draft:     Record<string, unknown>;
  onSelect:  (key: string) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-border/60 bg-background/80 px-1">
      {panels.map((panel) => {
        const label = typeof panel.label === "function" ? panel.label(ctx, draft) : panel.label;
        const active = panel.key === activeKey;
        return (
          <button
            key={panel.key}
            type="button"
            onClick={() => onSelect(panel.key)}
            className={cn(
              "relative flex h-10 shrink-0 items-center whitespace-nowrap px-4 text-xs font-medium transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED LINE ITEM SHEET
// ─────────────────────────────────────────────────────────────────────────────

export function UnifiedLineItemSheet({
  open,
  onOpenChange,
  mode,
  entityCode,
  recordId: parentRecordId,
  lineEntityCode,
  lineEntity: lineEntityProp,
  record,
  currencyCode,
  companyCodeId,
  line,
  panels,
  initialPanel,
  readOnly,
  onDraftSubmit,
  onMutated,
  hasPreviousLine,
  hasNextLine,
  onPreviousLine,
  onNextLine,
  amountConfigResolver,
  summaryStatus,
}: UnifiedLineItemSheetProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntityProp ? null : lineEntityCode);
  const entity         = lineEntityProp ?? fetchedEntity;

  const isNew    = mode === "compose" || !line;
  const lineId   = recordId(line as LineRecord | null | undefined);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>("");

  // ── Context (passed to isVisible and label callbacks) ──
  const ctx: LineItemPanelContext = useMemo(() => ({
    entity,
    mode,
    parentEntityCode: entityCode,
    lineEntityCode: lineEntityCode ?? entity?.entity_code ?? "",
    record,
    currencyCode,
    companyCodeId,
  }), [entity, mode, entityCode, lineEntityCode, record, currencyCode, companyCodeId]);

  // ── Visible panels (isVisible filter + sorted) ──
  const visiblePanels = useMemo(
    () =>
      panels
        .filter((p) => !p.isVisible || p.isVisible(ctx, draft))
        .sort((a, b) => a.order - b.order),
    [panels, ctx, draft],
  );

  // ── Initialise draft + active panel on open/line change ──
  useEffect(() => {
    if (!open) return;
    if (entity) setDraft(initialDraft(entity, line as LineRecord | null | undefined));
    else setDraft({});
    setSaveError(null);

    const firstKey = initialPanel ?? visiblePanels[0]?.key ?? "";
    setActiveKey(firstKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineId, entity]);

  // Re-check active panel when panels become visible
  useEffect(() => {
    if (!activeKey && visiblePanels.length > 0) {
      setActiveKey(visiblePanels[0]!.key);
    }
  }, [activeKey, visiblePanels]);

  const activePanelDef = visiblePanels.find((p) => p.key === activeKey);

  // ── Amount summary strip config (resolved once per entity) ──
  const amountConfig = useMemo(
    () => (amountConfigResolver ? amountConfigResolver(entity) : null),
    [amountConfigResolver, entity],
  );

  // ── Draft change handler (patch merge) ──
  const handleDraftChange = useCallback((patch: Record<string, unknown>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── Save ──
  async function save() {
    if (!entity) return;
    const payload = isNew
      ? buildCreatePayload(entity, draft)
      : buildLinePatch(entity, draft, line as LineRecord);

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
        isNew
          ? collectionUrl(entityCode, parentRecordId)
          : itemUrl(entityCode, parentRecordId, lineId),
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) },
      );
      if (!res.ok) { setSaveError(`Save failed (${res.status})`); return; }
      onMutated?.(); onOpenChange(false);
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  // ── Title ──
  const title = useMemo(() => {
    if (isNew) return `New ${entity?.entity_name ?? "Line"}`;
    const tf = resolveTitleField(entity);
    const v  = tf ? (line ? recordValue(line as LineRecord, tf) : undefined) : undefined;
    const fallback = `Edit ${entity?.entity_name ?? "Line"}`;
    return v != null && String(v).trim() ? String(v) : fallback;
  }, [isNew, line, entity]);

  // ── Panel props ──
  const panelProps: LineItemPanelProps = {
    ...ctx,
    line: line ?? null,
    draft,
    onDraftChange: handleDraftChange,
    recordId: parentRecordId,
    saving,
    readOnly,
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="transactional"
      widthKey={`${entityCode}:${mode}-line`}
      defaultWidth={600}
      expandedWidth={920}
      minWidth={420}
      maxWidth="94vw"
      resizable
      expandable
      badge={entity?.entity_name}
      title={title}
      headerRight={
        mode === "edit" && (hasPreviousLine || hasNextLine) ? (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!hasPreviousLine}
              onClick={onPreviousLine}
              aria-label="Previous line"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={!hasNextLine}
              onClick={onNextLine}
              aria-label="Next line"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        ) : undefined
      }
      headerBottom={
        visiblePanels.length > 1 ? (
          <TabBar
            panels={visiblePanels}
            activeKey={activeKey}
            ctx={ctx}
            draft={draft}
            onSelect={setActiveKey}
          />
        ) : undefined
      }
      footerStart={
        amountConfig || saveError ? (
          <div className="flex min-w-0 flex-col gap-1">
            {saveError && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {saveError}
              </span>
            )}
            {amountConfig && (
              <LineItemFooterAmountStrip
                amountConfig={amountConfig}
                entity={entity}
                draft={draft}
                line={line ?? null}
                currencyCode={currencyCode}
                status={summaryStatus ?? null}
              />
            )}
          </div>
        ) : undefined
      }
      footerEnd={
        readOnly ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Close
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-lg border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !entity}
              className="h-8 rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {saving ? "Saving…" : isNew ? "Add Line" : "Save"}
            </button>
          </>
        )
      }
    >
      {/* Active panel content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!entity ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Loading line configuration…
          </div>
        ) : activePanelDef ? (
          <activePanelDef.Component {...panelProps} />
        ) : visiblePanels.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No panels configured for this variant.
          </div>
        ) : null}
      </div>
    </DrawerShell>
  );
}
