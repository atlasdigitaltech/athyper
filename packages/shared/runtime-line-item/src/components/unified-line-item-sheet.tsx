"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button, DrawerShell } from "@athyper/ui/primitives";
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
  resolveAsyncCreateLineDefaults,
  recordValue,
  useCompiledEntityMetadata,
} from "../meta";
import type {
  LineItemAmountConfig,
  LineItemPanel,
  LineItemPanelContext,
  LineItemPanelProps,
  LineFieldChangeResolveResult,
  LineFieldChangeResolver,
  LineRecord,
} from "../types";
import {
  LineItemFooterAmountStrip,
  type LineItemFooterAmountStripStatus,
} from "./line-item-footer-amount-strip";

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedLineItemSheetProps {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  /** Shared drawer presentation mode. */
  mode:            "compose" | "view" | "edit";
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
  canEdit?:        boolean;
  onPromoteToEdit?: () => void;
  /** Server-write mode — skip relayMutate, hand payload to caller instead */
  onDraftSubmit?:  (payload: Record<string, unknown>) => void | Promise<void>;
  onMutated?:      () => void;
  lineFieldChangeResolver?: LineFieldChangeResolver;
  /** Line navigation (editor mode) */
  hasPreviousLine?: boolean;
  hasNextLine?:    boolean;
  linePositionLabel?: string;
  stagedPatch?:    Record<string, unknown>;
  stagedLineCount?: number;
  onStageLinePatch?:  (lineId: string, patch: Record<string, unknown>) => void;
  onSaveStagedLines?: (lineId: string, patch: Record<string, unknown>) => void | Promise<void>;
  onPreviousLine?: () => void;
  onNextLine?:     () => void;
  /**
   * Amount summary strip resolver (Net / Discount / Tax / Gross).
   * When provided, the resolved config is rendered as an inline bar in the
   * footer (left of the Cancel/Save buttons), tracking the running money
   * breakdown for this line as the draft changes.
   *
   * Pass one of `resolveProcureAmountConfig`, `resolveSalesAmountConfig`, or
   * `resolveGenericAmountConfig` from the runtime-line-item variant module.
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
              "relative flex h-11 shrink-0 items-center whitespace-nowrap px-5 text-sm font-medium transition-colors",
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

function compactSheetTitle(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 96 ? `${normalized.slice(0, 95)}...` : normalized;
}

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
  canEdit,
  onPromoteToEdit,
  onDraftSubmit,
  onMutated,
  lineFieldChangeResolver,
  hasPreviousLine,
  hasNextLine,
  linePositionLabel,
  stagedPatch,
  stagedLineCount,
  onStageLinePatch,
  onSaveStagedLines,
  onPreviousLine,
  onNextLine,
  amountConfigResolver,
  summaryStatus,
}: UnifiedLineItemSheetProps) {
  const fetchedEntity  = useCompiledEntityMetadata(lineEntityProp ? null : lineEntityCode);
  const entity         = lineEntityProp ?? fetchedEntity;

  const isNew    = mode === "compose" || !line;
  const isReadOnly = mode === "view" || readOnly === true;
  const lineId   = recordId(line as LineRecord | null | undefined);

  const [draft,     setDraft]     = useState<Record<string, unknown>>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>("");
  const draftRef = useRef<Record<string, unknown>>({});
  const resolverTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const draftRevisionRef = useRef(0);

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
        .filter((p) => !p.modes || p.modes.includes(mode))
        .filter((p) => !p.isVisible || p.isVisible(ctx, draft))
        .sort((a, b) => a.order - b.order),
    [panels, ctx, draft, mode],
  );

  // ── Initialise draft + active panel on open/line change ──
  useEffect(() => {
    if (!open) return;
    draftRevisionRef.current += 1;
    const revision = draftRevisionRef.current;
    clearResolverTimers(resolverTimersRef.current);
    const nextDraft = entity
      ? {
          ...withParentResolverContext(
            entity,
            initialDraft(entity, line as LineRecord | null | undefined, record),
            record,
          ),
          ...(stagedPatch ?? {}),
        }
      : {};
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setSaveError(null);

    if (entity && isNew) {
      void resolveAsyncCreateLineDefaults(entity, nextDraft)
        .then((patch) => {
          if (draftRevisionRef.current !== revision || Object.keys(patch).length === 0) return;
          setDraft((current) => {
            if (draftRevisionRef.current !== revision) return current;
            const next = { ...current };
            let changed = false;
            for (const [fieldName, value] of Object.entries(patch)) {
              if (isBlankDraftValue(next[fieldName])) {
                next[fieldName] = value;
                changed = true;
              }
            }
            if (!changed) return current;
            draftRef.current = next;
            return next;
          });
        })
        .catch(() => {
          // Best-effort: server create defaults remain authoritative.
        });
    }

    if (entity && lineFieldChangeResolver) {
      for (const fieldName of initialResolverSourceFields(entity, nextDraft)) {
        scheduleLineFieldResolve({
          resolver: lineFieldChangeResolver,
          fieldName,
          newValue: nextDraft[fieldName],
          nextDraft,
          revision,
          forceSourceChanged: true,
        });
      }
    }

    const requestedPanel = initialPanel
      ? visiblePanels.find((panel) => panel.key === initialPanel)?.key
      : undefined;
    const firstKey = requestedPanel ?? visiblePanels[0]?.key ?? "";
    setActiveKey(firstKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineId, entity, isNew]);

  // Re-check active panel when panels become visible
  useEffect(() => {
    if (visiblePanels.length > 0 && !visiblePanels.some((panel) => panel.key === activeKey)) {
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
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    draftRevisionRef.current += 1;
    const revision = draftRevisionRef.current;
    setDraft(next);
    if (!isNew && entity && lineId && onStageLinePatch) {
      onStageLinePatch(lineId, buildLinePatch(entity, next, line as LineRecord));
    }

    if (!lineFieldChangeResolver) return;
    for (const [fieldName, newValue] of Object.entries(patch)) {
      scheduleLineFieldResolve({
        resolver: lineFieldChangeResolver,
        fieldName,
        newValue,
        nextDraft: next,
        revision,
      });
    }
  }, [
    activeKey,
    ctx.lineEntityCode,
    entity,
    entityCode,
    isNew,
    line,
    lineFieldChangeResolver,
    lineId,
    mode,
    onStageLinePatch,
    parentRecordId,
  ]);

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    handleDraftChange({ [fieldName]: value });
  }, [handleDraftChange]);

  useEffect(() => () => {
    clearResolverTimers(resolverTimersRef.current);
  }, []);

  function scheduleLineFieldResolve({
    resolver,
    fieldName,
    newValue,
    nextDraft,
    revision,
    forceSourceChanged = false,
  }: {
    resolver: LineFieldChangeResolver;
    fieldName: string;
    newValue: unknown;
    nextDraft: Record<string, unknown>;
    revision: number;
    forceSourceChanged?: boolean;
  }) {
    const existing = resolverTimersRef.current[fieldName];
    if (existing) clearTimeout(existing);
    resolverTimersRef.current[fieldName] = setTimeout(() => {
      delete resolverTimersRef.current[fieldName];
      if (draftRevisionRef.current !== revision) return;

      void resolver({
        fieldName,
        newValue,
        draft: forceSourceChanged ? { ...nextDraft, [fieldName]: null } : nextDraft,
        lineId: lineId ?? null,
        lineEntityCode: ctx.lineEntityCode,
        parentEntityCode: entityCode,
        parentRecordId,
        mode: mode === "view" ? "edit" : mode,
        panelKey: activeKey || undefined,
      })
        .then((result) => {
          if (!result || draftRevisionRef.current !== revision) return;
          applyLineResolveResult(result, revision);
        })
        .catch(() => {
          // Best-effort: dependent line defaults should never block typing.
        });
    }, 250);
  }

  function applyLineResolveResult(result: LineFieldChangeResolveResult, revision: number) {
    if (result.accepted === false) return;
    const patch: Record<string, unknown> = {};
    for (const field of result.clearedFields ?? []) patch[field] = null;
    Object.assign(patch, result.patch ?? {});
    if (Object.keys(patch).length === 0) return;
    if (draftRevisionRef.current !== revision) return;

    const next = { ...draftRef.current, ...patch };
    draftRevisionRef.current += 1;
    const nextRevision = draftRevisionRef.current;
    draftRef.current = next;
    setDraft(next);

    if (!isNew && entity && lineId && onStageLinePatch) {
      onStageLinePatch(lineId, buildLinePatch(entity, next, line as LineRecord));
    }

    if (!entity || !lineFieldChangeResolver) return;
    for (const [fieldName, value] of Object.entries(patch)) {
      if (isBlankDraftValue(value) || !isLineResolverSourceField(entity, fieldName)) continue;
      scheduleLineFieldResolve({
        resolver: lineFieldChangeResolver,
        fieldName,
        newValue: value,
        nextDraft: next,
        revision: nextRevision,
        forceSourceChanged: true,
      });
    }
  }

  // ── Save ──
  async function save() {
    if (!entity) return;
    const currentDraft = draftRef.current;
    const payload = isNew
      ? buildCreatePayload(entity, currentDraft)
      : buildLinePatch(entity, currentDraft, line as LineRecord);
    if (isNew && currentDraft["__create_graph"] && typeof currentDraft["__create_graph"] === "object") {
      payload["__create_graph"] = currentDraft["__create_graph"];
    }
    if (isNew) {
      const contract = entity.feature_flags?.create_graph;
      const graph = payload["__create_graph"] && typeof payload["__create_graph"] === "object"
        ? { ...payload["__create_graph"] as Record<string, unknown> }
        : {};
      for (const child of contract?.children ?? []) {
        if (graph[child.child_entity] || !child.draft_mapping) continue;
        const row: Record<string, unknown> = {};
        for (const [targetField, sourceField] of Object.entries(child.draft_mapping)) {
          const value = currentDraft[sourceField];
          if (value !== undefined && value !== null && value !== "") row[targetField] = value;
        }
        if (Object.keys(row).length > 0) {
          graph[child.child_entity] = { mode: child.mode ?? "replace_default", rows: [row] };
        }
      }
      if (Object.keys(graph).length > 0) payload["__create_graph"] = graph;
    }

    if (!isNew && onSaveStagedLines) {
      setSaving(true); setSaveError(null);
      try { await onSaveStagedLines(lineId, payload); onOpenChange(false); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Save failed"); }
      finally { setSaving(false); }
      return;
    }

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
      await onMutated?.();
      onOpenChange(false);
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  // ── Title ──
  const title = useMemo(() => {
    if (isNew) return `New ${entity?.entity_name ?? "Line"}`;
    const tf = resolveTitleField(entity);
    const v  = tf ? (line ? recordValue(line as LineRecord, tf) : undefined) : undefined;
    const fallback = `${mode === "view" ? "View" : "Edit"} ${entity?.entity_name ?? "Line"}`;
    return compactSheetTitle(v, fallback);
  }, [isNew, line, entity, mode]);

  // ── Panel props ──
  const panelProps: LineItemPanelProps = {
    ...ctx,
    line: line ?? null,
    draft,
    onDraftChange: handleDraftChange,
    onFieldChange: handleFieldChange,
    recordId: parentRecordId,
    saving,
    readOnly: isReadOnly,
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
        mode === "edit" && (linePositionLabel || hasPreviousLine || hasNextLine) ? (
          <div className="flex items-center gap-2">
            {linePositionLabel ? (
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {linePositionLabel}
              </span>
            ) : null}
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
      footerClassName="px-7 py-2.5"
      footerEnd={
        isReadOnly ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              className="min-w-[88px] border-border/60 px-4 text-sm font-normal text-foreground hover:border-border"
            >
              Close
            </Button>
            {canEdit && onPromoteToEdit ? (
              <Button type="button" variant="primary" size="lg" onClick={onPromoteToEdit}>
                Edit
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => onOpenChange(false)}
              className="min-w-[88px] border-border/60 px-4 text-sm font-normal text-foreground hover:border-border"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void save()}
              disabled={saving || !entity}
              className="min-w-[96px] bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              {saving
                ? "Saving..."
                : isNew
                  ? "Add Line"
                  : (stagedLineCount ?? 0) > 1
                    ? `Save ${stagedLineCount} lines`
                    : "Save"}
            </Button>
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

function clearResolverTimers(timers: Record<string, ReturnType<typeof setTimeout>>) {
  for (const timer of Object.values(timers)) clearTimeout(timer);
  for (const key of Object.keys(timers)) delete timers[key];
}

function isBlankDraftValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function withParentResolverContext(
  entity: CompiledEntity,
  draft: Record<string, unknown>,
  parentRecord: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!parentRecord) return draft;
  const next = { ...draft };

  for (const field of entity.fields) {
    const defaults = objectValue((field as { defaults?: unknown }).defaults);
    const source = objectValue(defaults?.["default_value_source"] ?? defaults?.["defaultValueSource"]);
    const kind = typeof source?.["kind"] === "string" ? source["kind"].toLowerCase() : "";
    if (kind !== "parent_field") continue;
    if (!source) continue;

    const parentField =
      readStringValue(source["parent_field"])
      ?? readStringValue(source["parentField"]);
    if (!parentField || !isBlankDraftValue(next[field.name])) continue;

    const parentValue = readParentValue(parentRecord, parentField);
    if (!isBlankDraftValue(parentValue)) next[field.name] = parentValue;
  }

  for (const fieldName of lineResolverSourceFields(entity)) {
    if (!isBlankDraftValue(next[fieldName])) continue;
    const parentValue = readParentValue(parentRecord, fieldName);
    if (!isBlankDraftValue(parentValue)) next[fieldName] = parentValue;
  }
  return next;
}

function readParentValue(parentRecord: Record<string, unknown>, fieldName: string): unknown {
  if (Object.prototype.hasOwnProperty.call(parentRecord, fieldName)) {
    return parentRecord[fieldName];
  }
  for (const alias of parentFieldAliases(fieldName)) {
    if (Object.prototype.hasOwnProperty.call(parentRecord, alias)) {
      return parentRecord[alias];
    }
  }
  return undefined;
}

function parentFieldAliases(fieldName: string): string[] {
  switch (fieldName) {
    case "supplier_id":
      return ["party_id", "vendor_id"];
    case "party_id":
      return ["supplier_id", "vendor_id"];
    default:
      return [];
  }
}

function initialResolverSourceFields(entity: CompiledEntity, draft: Record<string, unknown>): string[] {
  return lineResolverSourceFields(entity).filter((fieldName) => !isBlankDraftValue(draft[fieldName]));
}

function isLineResolverSourceField(entity: CompiledEntity, fieldName: string): boolean {
  return lineResolverSourceFields(entity).includes(fieldName);
}

function lineResolverSourceFields(entity: CompiledEntity): string[] {
  const out = new Set<string>();
  for (const field of entity.fields) {
    const defaults = objectValue((field as { defaults?: unknown }).defaults);
    const changes = arrayValue(defaults?.["on_source_change"] ?? defaults?.["onSourceChange"]);
    for (const raw of changes) {
      const change = objectValue(raw);
      for (const source of arrayValue(change?.["sources"])) {
        if (typeof source === "string" && source) out.add(source);
      }
    }

    const source = objectValue(defaults?.["default_value_source"] ?? defaults?.["defaultValueSource"]);
    for (const rawSource of arrayValue(source?.["sources"])) {
      if (typeof rawSource === "string" && rawSource) out.add(rawSource);
    }
  }
  return [...out];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [];
}
