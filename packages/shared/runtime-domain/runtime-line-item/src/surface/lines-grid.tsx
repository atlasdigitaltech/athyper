"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import { fmtAmount } from "@athyper/runtime-shared/core";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@athyper/ui";
import type { RowSelectionState } from "@athyper/ui/data";
import type { MetaEntityCollectionConfig } from "@athyper/runtime-contracts";
import { recordId, resolveCopyFields, useCompiledEntityMetadata } from "../meta";
import type {
  LinesGridProps,
  LinePricingComponentKind,
  LinePricingComponentLaunch,
  LineItemVariantKey,
  LineRecord,
} from "../types";
import {
  normalizeProcureDraftLine,
  resolveProcureGridSummary,
} from "../variants/procure";
import { LineItemComposerSheet, LineItemEditorSheet } from "../components/line-item-sheet";
import { createManualInvoiceLineAdapter } from "../adapters/manual-invoice-line";
import { AddItemDropdown } from "./add-item-dropdown";
import { LineItemMobileRow } from "./line-item-mobile-row";
import { LineItemsSelectionBar } from "./line-items-selection-bar";
import { SourceAdapterPicker, type SourceAdapter } from "@athyper/runtime-add-item";
import { relayMutate } from "@athyper/runtime-shared/client";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import {
  AccountingDistributionDrawer,
  deriveDistributableCost,
  projectAccountingDistributions,
  projectPricingComponents,
  type AccountingDistributionDraft,
  type AccountingDistributionSplitDraft,
} from "@athyper/content-ui";
import {
  ChildCollectionGrid,
} from "../embedded";

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT KEY INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function resolveVariantKey(
  displayConfig: Record<string, unknown> | null | undefined,
  entityCode: string,
  lineEntityCode: string,
): LineItemVariantKey {
  const configured = displayConfig?.["line_ui_variant"];
  if (typeof configured === "string" && configured.trim()) return configured as LineItemVariantKey;

  const code = `${entityCode} ${lineEntityCode}`.toLowerCase();
  if (code.includes("sales") || code.includes("so_line") || code.includes("order_line")) return "sales";
  if (code.includes("purchase") || code.includes("invoice_line") || code.includes("po_line")) return "procure";
  return "generic";
}

// AddItemDropdown lives in its own module so it can be tested in isolation
// and reused. See ./AddItemDropdown.tsx.

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT TOTALS FOOTER
// ─────────────────────────────────────────────────────────────────────────────

const NUMERIC_DATA_TYPES = new Set(["money", "decimal", "integer", "numeric", "bigint"]);
const LINE_SEARCH_KEYS = [
  "description",
  "item_description",
  "item_code",
  "item_id",
  "line_no",
  "line_number",
];
const LINE_IDENTITY_COLUMN_KEYS = ["line_no", "line_number", "line_num"];
const LINE_GRID_PINNED_COLUMNS = [
  "select",
  "line_number",
  "line_no",
  "line_num",
  "description",
  "item_description",
];
const OPTIONAL_ITEM_COLUMN_KEYS = new Set([
  "item",
  "item_id",
  "item_code",
  "item_name",
  "material_id",
  "material_code",
]);
const UUID_VALUE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICING_PROJECTION_COLUMN_KEYS = [
  "pricing_net_amount",
  "pricing_tax_amount",
  "pricing_total_amount",
];
const LEGACY_AMOUNT_COLUMN_KEYS = [
  "net_amount",
  "tax_amount",
  "gross_amount",
];
const PROCURE_AUTHORING_COLUMN_CANDIDATES = [
  ["line_no", "line_number", "line_num"],
  ["item_description", "description"],
  ["quantity", "qty"],
  ["unit_price"],
  ["pricing_net_amount", "net_amount"],
  ["status"],
];
const COPY_FIELD_EXCLUSIONS = new Set([
  "id",
  "tenant_id",
  "line_number",
  "line_no",
  "line_num",
  "status",
  "row_version",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "received_qty",
  "invoiced_qty",
  "matched_qty",
  "source_binding",
  "sourceBinding",
]);
const COPY_FALLBACK_FIELDS = [
  "item_id",
  "item_code",
  "item_description",
  "description",
  "line_type",
  "procurement_type",
  "quantity",
  "qty",
  "uom_id",
  "uom_code",
  "unit_price",
  "price_per",
  "currency_code",
  "cost_centre_id",
  "cost_center_id",
  "profit_centre_id",
  "profit_center_id",
  "project_id",
  "site_id",
  "gl_account_id",
];

function hasRenderableLineValue(value: unknown, key?: string): boolean {
  if (value == null || value === "") return false;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["label", "name", "code", "value", "id"].some((key) => hasRenderableLineValue(record[key]));
  }
  const text = String(value).trim();
  if (!text || text === "-") return false;
  if (key && key.endsWith("_id") && UUID_VALUE_RE.test(text)) return false;
  return true;
}

function lineHasItemValue(line: LineRecord): boolean {
  const row = line as Record<string, unknown>;
  for (const key of OPTIONAL_ITEM_COLUMN_KEYS) {
    if (hasRenderableLineValue(row[key], key)) return true;
  }
  return false;
}

function resolveLineIdentityColumnKey(entity: CompiledEntity | null): string | null {
  if (!entity) return null;
  const fields = new Set(entity.fields.map((field) => field.name));
  return LINE_IDENTITY_COLUMN_KEYS.find((key) => fields.has(key)) ?? null;
}

function resolveRequiredFinancialColumnKeys(entity: CompiledEntity | null): string[] {
  if (!entity) return [];
  const fields = new Set(entity.fields.map((field) => field.name));
  const preferred = PRICING_PROJECTION_COLUMN_KEYS.find((key) => key === "pricing_net_amount" && fields.has(key));
  if (preferred) return [preferred];
  const fallback = LEGACY_AMOUNT_COLUMN_KEYS.find((key) => key === "net_amount" && fields.has(key));
  return fallback ? [fallback] : [];
}

function resolveProcureAuthoringColumnKeys(entity: CompiledEntity): string[] {
  const fields = new Set(entity.fields.map((field) => field.name));
  return PROCURE_AUTHORING_COLUMN_CANDIDATES
    .map((candidates) => candidates.find((key) => fields.has(key)))
    .filter((key): key is string => Boolean(key));
}

function AmountTotalsFooter({
  lines,
  entity,
  currencyCode,
}: {
  lines:        LineRecord[];
  /** Compiled line entity; when null (still loading) the footer hides. */
  entity:       CompiledEntity | null;
  currencyCode?: string;
}) {
  // Mirror the column projection EmbeddedEntityList renders — same source of
  // truth (resolveListConfig), so the totals row stays aligned with what
  // the user sees in the grid.
  const totals = useMemo(() => {
    if (!entity) return [];
    return resolveListConfig(entity).columns
      .filter((field) => NUMERIC_DATA_TYPES.has(field.data_type))
      .map((field) => ({
        key:   field.name,
        label: field.label ?? field.name,
        total: lines.reduce((sum, line) => {
          const n = Number((line as Record<string, unknown>)[field.name] ?? 0);
          return Number.isFinite(n) ? sum + n : sum;
        }, 0),
      }));
  }, [entity, lines]);

  const nonZero = totals.filter((t) => Math.abs(t.total) > 0.001);
  if (nonZero.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border/40 px-4 py-2.5">
      {nonZero.map(({ key, label, total }) => (
        <span key={key} className="flex items-baseline gap-1.5 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums text-foreground">{fmtAmount(total, currencyCode)}</span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES GRID COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function LinesGrid({
  surface,
  entity,
  entityCode,
  recordId: parentRecordId,
  lineEntityCode,
  currencyCode,
  companyCodeId,
  record,
  lines,
  distributions,
  pricingComponents = [],
  isLoading,
  onRefresh,
  editMode = true,
  draftMode = false,
  onDraftLinesChange,
  mobileColumns,
  renderRowExpansion,
  selectionOperations = [],
  lineFieldChangeResolver,
  submitWorkspaceChanges,
}: LinesGridProps) {
  // Plan v5 amendment 2 — expanded row state owned by the grid. Single-row
  // expansion only: opening a second line collapses the first, matching the
  // PI v1.2 spec §4.3 row drawer pattern. Mobile branch ignores expansion
  // today; the card layout already exposes line context per row.
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [componentLaunch, setComponentLaunch] = useState<(LinePricingComponentLaunch & { lineId: string }) | null>(null);
  const expansionEnabled = Boolean(renderRowExpansion);
  const [composerOpen,  setComposerOpen]  = useState(false);
  const [composerMode,  setComposerMode]  = useState<"manual" | "catalog">("manual");
  const [editorOpen,    setEditorOpen]    = useState(false);
  const [editorMode,    setEditorMode]    = useState<"view" | "edit">(editMode ? "edit" : "view");
  const [editorInitialTab, setEditorInitialTab] = useState<string | undefined>();
  const [accountingLine, setAccountingLine] = useState<LineRecord | null>(null);
  const [accountingTargetLines, setAccountingTargetLines] = useState<LineRecord[]>([]);
  const [accountingDrawerOpen, setAccountingDrawerOpen] = useState(false);
  const [accountingDrawerReadOnly, setAccountingDrawerReadOnly] = useState(false);
  const [activeLine,    setActiveLine]    = useState<LineRecord | null>(null);
  const [copyingSelected, setCopyingSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingLinePatches, setPendingLinePatches] = useState<Record<string, Record<string, unknown>>>({});
  const [latestRecordEtag, setLatestRecordEtag] = useState<string | null>(null);
  // Selection state — owned here, threaded into EmbeddedEntityList controlled.
  // Keyed by `recordId(line) || String(index)` via the getRowId prop on the
  // embedded grid, so selection survives sort and search changes. The
  // FloatingSelectionBar below derives its count + clear handler from this.
  const [rowSelection,  setRowSelection]  = useState<RowSelectionState>({});
  const [draftLines,    setDraftLines]    = useState<LineRecord[]>([]);

  // Manual-line source adapter — used by draft-mode composer submits so each
  // local draft line carries a sourceBinding. Held in a ref so re-renders
  // don't recreate it.
  const manualInvoiceLineAdapterRef = useRef(createManualInvoiceLineAdapter());

  // Picker-adapter state: which adapter (if any) currently has its picker
  // open. The picker is rendered conditionally below; selections route
  // through onPickerCommit which mirrors the draft / non-draft persistence
  // already used by handleDraftComposerSubmit.
  const [activePickerAdapter, setActivePickerAdapter] = useState<SourceAdapter | null>(null);

  useEffect(() => {
    setLatestRecordEtag(null);
  }, [parentRecordId]);

  useEffect(() => {
    const incoming = readEtagFromRecord(record);
    if (!incoming) return;
    setLatestRecordEtag((current) => {
      if (!current) return incoming;
      const currentNo = Number(current);
      const incomingNo = Number(incoming);
      if (Number.isFinite(currentNo) && Number.isFinite(incomingNo)) {
        return incomingNo > currentNo ? incoming : current;
      }
      return incoming === current ? current : incoming;
    });
  }, [record]);

  // parentCtx — assembled from existing props. Read by the picker hook
  // (validateSelection, isStillValid, toDraftShape) so adapters can scope
  // queries (e.g. open_po_line filters by supplierId from the parent
  // invoice's supplier).
  const supplierId = useMemo(() => {
    const value = record?.supplier_id ?? record?.supplierId;
    return typeof value === "string" ? value : undefined;
  }, [record]);
  const parentCtx = useMemo(
    () => ({
      parentEntityCode: entityCode,
      parentRecordId,
      lineEntityCode,
      currencyCode,
      supplierId,
    }),
    [entityCode, parentRecordId, lineEntityCode, currencyCode, supplierId],
  );

  const displayConfig = entity ? (entity.display_config as Record<string, unknown> | null | undefined) : null;
  const configuredVariant = surface.line?.variant;
  const variantKey = (typeof configuredVariant === "string" && configuredVariant.trim()
    ? configuredVariant
    : resolveVariantKey(displayConfig, entityCode, lineEntityCode)) as LineItemVariantKey;

  // For draft mode, merge server lines + draft lines
  const allLines = draftMode ? [...lines, ...draftLines] : lines;

  // Compiled metadata used by AmountTotalsFooter — column rendering itself
  // is driven by EmbeddedEntityList's own useCompiledEntity call (it reads
  // display_config.list_columns directly from the descriptor). This local
  // fetch hits the same backend endpoint as useCompiledEntity; both layers
  // tolerate the duplicate request, but react-query's cache (used by
  // EmbeddedEntityList) and this hook's own cancellation keep it cheap.
  const lineEntity = useCompiledEntityMetadata(lineEntityCode);
  // Accounting metadata is only needed by the split-accounting drawer. Do not
  // fetch it for an untouched or empty line grid.
  const accountingEntity = useCompiledEntityMetadata(
    accountingLine ? "accounting_distribution" : null,
  );

  const defaultVisibleColumnKeys = useMemo(() => {
    if (!lineEntity) return undefined;
    if (variantKey === "procure") return resolveProcureAuthoringColumnKeys(lineEntity);
    const keys = resolveListConfig(lineEntity).columns.map((field) => field.name);
    if (allLines.some(lineHasItemValue)) return keys;
    return keys.filter((key) => !OPTIONAL_ITEM_COLUMN_KEYS.has(key));
  }, [allLines, lineEntity, variantKey]);
  const requiredVisibleColumnKeys = useMemo(() => {
    const identityKey = resolveLineIdentityColumnKey(lineEntity);
    const financialKeys = variantKey === "procure"
      ? resolveRequiredFinancialColumnKeys(lineEntity)
      : [];
    const keys = [...(identityKey ? [identityKey] : []), ...financialKeys];
    return keys.length > 0 ? keys : undefined;
  }, [lineEntity, variantKey]);

  // Column visibility — descriptor's list_columns provides the default; users
  // can add/remove columns via the popover and the choice persists across
  // sessions via localStorage. `null` in storage means "use descriptor
  // defaults" so future seed changes flow through to users who never opened
  // the picker.
  const summaryItems = useMemo(() => {
    if (variantKey !== "procure") return null;
    return resolveProcureGridSummary(allLines);
  }, [allLines, variantKey]);

  const lineCollection = useMemo<MetaEntityCollectionConfig>(() => {
    const configured = surface.collection;
    return {
      ...configured,
      title: {
        showCount: true,
        ...configured?.title,
      },
      toolbar: {
        search: { placeholder: "Search lines...", keys: LINE_SEARCH_KEYS },
        columns: true,
        primaryAction: "add_item",
        ...configured?.toolbar,
      },
      table: {
        pinnedColumns: LINE_GRID_PINNED_COLUMNS,
        virtualized: true,
        ...configured?.table,
      },
      row: {
        selection: true,
        clickAction: expansionEnabled ? "none" : "edit",
        ...configured?.row,
      },
    };
  }, [surface.collection, expansionEnabled]);

  function handleRowClick(row: Record<string, unknown>) {
    if (lineCollection.row?.clickAction === "none") return;
    // When the parent surface provides `renderRowExpansion`, the row drawer
    // is the primary detail affordance — clicking toggles inline expansion.
    // The line editor sheet stays reachable via per-row "Edit" affordances
    // (LineItemEditorSheet open path) and the mobile-row openRow handler.
    if (lineCollection.row?.clickAction === "expand") {
      const rowId = recordId(row as LineRecord);
      if (!rowId) return;
      setExpandedLineId((current) => (current === rowId ? null : rowId));
      return;
    }
    setEditorInitialTab(undefined);
    setActiveLine(row as LineRecord);
    setEditorMode(editMode ? "edit" : "view");
    setEditorOpen(true);
  }

  function toggleLineExpansion(row: Record<string, unknown>, event?: MouseEvent<HTMLButtonElement>): void {
    event?.stopPropagation();
    if (!expansionEnabled) return;
    const rowId = recordId(row as LineRecord);
    if (!rowId) return;
    setExpandedLineId((current) => (current === rowId ? null : rowId));
  }

  const selectionCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection],
  );
  const selectedLines = useMemo(
    () => allLines.filter((line, index) => {
      const key = recordId(line) || String(index);
      return Boolean(rowSelection[key]);
    }),
    [allLines, rowSelection],
  );

  function handleAddComponentSelected(kind: LinePricingComponentKind): void {
    const selectedLine = selectedLines[0];
    if (!selectedLine || selectedLines.length !== 1 || !renderRowExpansion) return;
    const lineId = recordId(selectedLine);
    if (!lineId) return;
    setExpandedLineId(lineId);
    setComponentLaunch((current) => ({
      kind,
      lineId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function handleManageComponentsSelected(): void {
    const selectedLine = selectedLines[0];
    if (!selectedLine || selectedLines.length !== 1 || !renderRowExpansion) return;
    const lineId = recordId(selectedLine);
    if (lineId) setExpandedLineId(lineId);
  }
  const activeLineIndex = useMemo(() => {
    if (!activeLine) return -1;
    const activeId = recordId(activeLine);
    if (activeId) {
      return allLines.findIndex((line) => recordId(line) === activeId);
    }
    return allLines.findIndex((line) => line === activeLine);
  }, [activeLine, allLines]);
  const hasPreviousLine = editorOpen && activeLineIndex > 0;
  const hasNextLine = editorOpen && activeLineIndex >= 0 && activeLineIndex < allLines.length - 1;
  const activeLineId = activeLine ? recordId(activeLine) : "";
  const activeStagedPatch = activeLineId ? pendingLinePatches[activeLineId] : undefined;
  const stagedLineCount = Object.keys(pendingLinePatches).length;
  const linePositionLabel = activeLineIndex >= 0
    ? `Line ${activeLineIndex + 1} of ${allLines.length}${stagedLineCount > 0 ? ` · Unsaved ${stagedLineCount}` : ""}`
    : undefined;

  function openLineAtIndex(index: number): void {
    const line = allLines[index];
    if (!line) return;
    setActiveLine(line);
    setEditorOpen(true);
  }

  function openPreviousLine(): void {
    if (!hasPreviousLine) return;
    openLineAtIndex(activeLineIndex - 1);
  }

  function openNextLine(): void {
    if (!hasNextLine) return;
    openLineAtIndex(activeLineIndex + 1);
  }

  function buildCopiedLinePayload(line: LineRecord): Record<string, unknown> {
    const copyFields = resolveCopyFields(lineEntity);
    const fieldNames = copyFields.length > 0
      ? copyFields.map((field) => field.name)
      : COPY_FALLBACK_FIELDS;
    const payload: Record<string, unknown> = {};
    for (const fieldName of fieldNames) {
      if (COPY_FIELD_EXCLUSIONS.has(fieldName)) continue;
      const value = (line as Record<string, unknown>)[fieldName];
      if (value === undefined) continue;
      payload[fieldName] = value;
    }
    return payload;
  }

  /**
   * Composer submit handler — runs the form payload through the
   * manual_invoice_line adapter to attach sourceBinding, then routes:
   *   • Draft mode  → appends to local draftLines, bubbles up
   *   • Non-draft mode → POSTs to /api/records/<entity>/<id>/lines
   *
   * Both flows now carry sourceBinding end-to-end. Draft mode keeps it on
   * the in-memory line for the eventual bulk save; non-draft mode persists
   * it via the backend's source_binding column (DDL 01s_).
   */
  async function handleComposerSubmit(payload: Record<string, unknown>): Promise<void> {
    const normalized = variantKey === "procure"
      ? normalizeProcureDraftLine(payload, null)
      : payload;
    if (variantKey === "procure" && !draftMode) {
      delete normalized["net_amount"];
      delete normalized["gross_amount"];
      delete normalized["line_amount"];
    }
    const draftId = `draft-${Date.now()}`;
    const adapter = manualInvoiceLineAdapterRef.current;
    const draft = adapter.toDraftShape(
      { draftId, payload: normalized },
      {
        parentEntityCode: entityCode,
        parentRecordId,
        lineEntityCode,
        currencyCode,
      },
    );

    if (draftMode) {
      const newLine = {
        id: draftId,
        line_number: allLines.length + 1,
        ...draft,
      } as unknown as LineRecord;
      const next = [...draftLines, newLine];
      setDraftLines(next);
      onDraftLinesChange?.([...lines, ...next]);
      return;
    }

    // Non-draft persistence — POST the line with sourceBinding included.
    // The backend route accepts the camelCase `sourceBinding` field (the
    // alias maps to the snake_case DB column).
    const collectionUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines`;
    const body = {
      ...normalized,
      sourceBinding: draft.sourceBinding,
    };
    if (submitWorkspaceChanges) {
      const etag = readRecordEtag();
      if (!etag) throw new Error("Cannot create a line: document version is missing.");
      const submitted = await submitWorkspaceChanges({ etag, lines: { create: [body] } });
      const nextEtag = submitted.etag.trim() || readEtagFromRecord(submitted.record);
      if (nextEtag) setLatestRecordEtag(nextEtag);
      await onRefresh?.();
      return;
    }
    const res = await relayMutate(collectionUrl, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Line save failed (${res.status})`);
    }
    await onRefresh?.();
  }

  async function copyPersistedLine(line: LineRecord): Promise<boolean> {
    if (submitWorkspaceChanges) return false;
    if (lineEntityCode !== "commitment_line") return false;
    const lineId = recordId(line);
    if (!lineId || lineId.startsWith("draft-")) return false;

    const copyUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}/copy`;
    const res = await relayMutate(copyUrl, {
      method: "POST",
      body: JSON.stringify({
        includeChildren: {
          accountingDistributions: true,
          pricingComponents: true,
          schedules: true,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Line copy failed (${res.status})`);
    }
    return true;
  }

  async function handleCopySelected(): Promise<void> {
    if (!editMode || copyingSelected || selectedLines.length === 0) return;
    setCopyingSelected(true);
    let copiedPersisted = false;
    try {
      for (const line of selectedLines) {
        if (await copyPersistedLine(line)) {
          copiedPersisted = true;
          continue;
        }
        const payload = buildCopiedLinePayload(line);
        await handleComposerSubmit(payload);
      }
      setRowSelection({});
      if (copiedPersisted) await onRefresh?.();
    } finally {
      setCopyingSelected(false);
    }
  }

  function handleEditSelected(): void {
    if (!editMode || selectedLines.length !== 1) return;
    setEditorInitialTab(undefined);
    setActiveLine(selectedLines[0] as LineRecord);
    setEditorMode("edit");
    setEditorOpen(true);
    setRowSelection({});
  }

  function handleViewSelected(): void {
    if (selectedLines.length !== 1) return;
    setEditorInitialTab(undefined);
    setActiveLine(selectedLines[0] as LineRecord);
    setEditorMode("view");
    setEditorOpen(true);
    setRowSelection({});
  }

  function handleEditAccountingSelected(): void {
    if (!editMode || selectedLines.length === 0) return;
    setAccountingTargetLines(selectedLines);
    setAccountingLine(selectedLines[0] as LineRecord);
    setAccountingDrawerReadOnly(false);
    setAccountingDrawerOpen(true);
  }

  function handleViewAccountingSelected(): void {
    if (editMode || selectedLines.length !== 1) return;
    setAccountingTargetLines(selectedLines);
    setAccountingLine(selectedLines[0] as LineRecord);
    setAccountingDrawerReadOnly(true);
    setAccountingDrawerOpen(true);
    setRowSelection({});
  }

  const accountingLineId = accountingLine ? recordId(accountingLine) : "";
  const accountingDistributions = useMemo(() => {
    if (!accountingLineId) return [];
    return projectAccountingDistributions(
      distributions.filter((distribution) => {
        const row = distribution as unknown as Record<string, unknown>;
        return String(row["source_line_id"] ?? row["line_id"] ?? "") === accountingLineId;
      }) as unknown as Parameters<typeof projectAccountingDistributions>[0],
    );
  }, [accountingLineId, distributions]);
  const accountingDistributionTarget = useMemo(() => {
    if (!accountingLine || !accountingLineId) return undefined;
    const row = accountingLine as Record<string, unknown>;
    const netAmount = Number(row["pricing_net_amount"] ?? row["net_amount"] ?? 0);
    if (!Number.isFinite(netAmount)) return undefined;
    const lineComponents = projectPricingComponents(
      pricingComponents.filter((component) => String(component["source_line_id"] ?? "") === accountingLineId),
    );
    return deriveDistributableCost(netAmount, lineComponents);
  }, [accountingLine, accountingLineId, pricingComponents]);

  const accountingTemplateOptions = useMemo(() => accountingTargetLines.flatMap((line, index) => {
    const id = recordId(line);
    if (!id) return [];
    const lineNo = line["line_number"] ?? line["line_no"] ?? index + 1;
    const description = String(line["description"] ?? line["item_description"] ?? line["name"] ?? "").trim();
    const shortDescription = description.length > 72 ? `${description.slice(0, 69)}...` : description;
    return [{ id, label: `Line ${String(lineNo)}${shortDescription ? ` — ${shortDescription}` : ""}` }];
  }), [accountingTargetLines]);

  function selectAccountingTemplate(lineId: string): void {
    const next = accountingTargetLines.find((line) => recordId(line) === lineId);
    if (next) setAccountingLine(next);
  }

  async function submitDirectAccountingDistribution(draft: AccountingDistributionDraft): Promise<void> {
    if (!accountingLineId) return;
    if (accountingTargetLines.length > 1) {
      const glAccountId = draft.gl_account_id ?? accountingDistributions[0]?.gl_account_id ?? null;
      const body = {
        distributions: [{
          ...draft,
          gl_account_id: glAccountId,
          reason_code: draft.reason_code ?? "manual_account_override",
        }],
      };
      const targets = accountingTargetLines.map((line) => recordId(line)).filter(Boolean);
      const responses = await Promise.all(targets.map(async (lineId) => {
        const url = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}`
          + `/lines/${encodeURIComponent(lineId)}/distributions`;
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
          body: JSON.stringify(body),
        });
        return { lineId, response };
      }));
      const failed = responses.find(({ response }) => !response.ok);
      if (failed) {
        const errorBody = await failed.response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(errorBody?.message ?? errorBody?.error ?? `Accounting save failed (${failed.response.status}).`);
      }
      await onRefresh?.();
      setAccountingDrawerOpen(false);
      setAccountingTargetLines([]);
      setRowSelection({});
      return;
    }
    const editing = accountingDistributions[0] ?? null;
    const base = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}`
      + `/lines/${encodeURIComponent(accountingLineId)}/distributions`;
    const response = await fetch(editing ? `${base}/${encodeURIComponent(editing.id)}` : base, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      throw new Error(body?.message ?? body?.error ?? `Accounting save failed (${response.status}).`);
    }
    await onRefresh?.();
    setAccountingDrawerOpen(false);
    setAccountingTargetLines([]);
    setRowSelection({});
  }

  async function replaceDirectAccountingDistributions(drafts: AccountingDistributionSplitDraft[]): Promise<void> {
    if (!accountingLineId) return;
    const targets = accountingTargetLines.length > 1
      ? accountingTargetLines.map((line) => recordId(line)).filter(Boolean)
      : [accountingLineId];
    if (targets.length > 1 && drafts.some((draft) => draft.distribution_basis !== "PERCENT")) {
      throw new Error("Mass split accounting supports Percent basis only. Amount and Quantity splits must be edited per line.");
    }
    const body = {
      distributions: drafts.map((draft) => ({
        distribution_basis: draft.distribution_basis,
        split_pct: draft.split_pct ?? null,
        split_amount: draft.split_amount ?? null,
        split_quantity: draft.split_quantity ?? null,
        gl_account_id: draft.gl_account_id,
        cost_center_id: draft.cost_center_id,
        profit_center_id: draft.profit_center_id,
        project_id: draft.project_id,
        asset_id: draft.asset_id,
        description: draft.description,
        reason_code: draft.reason_code ?? "manual_account_override",
      })),
    };
    const responses = await Promise.all(targets.map(async (lineId) => {
      const url = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}`
        + `/lines/${encodeURIComponent(lineId)}/distributions`;
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify(body),
      });
      return { lineId, response };
    }));
    const failed = responses.find(({ response }) => !response.ok);
    if (failed) {
      const errorBody = await failed.response.json().catch(() => null) as { message?: string; error?: string } | null;
      throw new Error(errorBody?.message ?? errorBody?.error ?? `Accounting split save failed (${failed.response.status}).`);
    }
    await onRefresh?.();
    setAccountingDrawerOpen(false);
    setAccountingTargetLines([]);
    setRowSelection({});
  }

  function isLocalDraftLine(line: LineRecord): boolean {
    const lineId = recordId(line);
    return !lineId || lineId.startsWith("draft-") || lineId.startsWith("picker-");
  }

  async function deletePersistedLine(line: LineRecord): Promise<boolean> {
    const lineId = recordId(line);
    if (!lineId || isLocalDraftLine(line)) return false;

    if (submitWorkspaceChanges) {
      const etag = readRecordEtag();
      if (!etag) throw new Error("Cannot delete a line: document version is missing.");
      const submitted = await submitWorkspaceChanges({ etag, lines: { delete: [lineId] } });
      const nextEtag = submitted.etag.trim() || readEtagFromRecord(submitted.record);
      if (nextEtag) setLatestRecordEtag(nextEtag);
      return true;
    }

    const deleteUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}`;
    const res = await relayMutate(deleteUrl, { method: "DELETE" });
    if (!res.ok) {
      let message = `Line delete failed (${res.status})`;
      try {
        const body = await res.json() as { message?: unknown };
        if (typeof body.message === "string" && body.message.trim()) message = body.message;
      } catch {
        // Keep the status-based fallback.
      }
      throw new Error(message);
    }
    return true;
  }

  function handleDeleteSelected(): void {
    if (!editMode || deletingSelected || selectedLines.length === 0) return;
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteSelected(): Promise<void> {
    if (!editMode || deletingSelected || selectedLines.length === 0) return;
    setDeletingSelected(true);
    let deletedPersisted = false;
    try {
      const selectedIds = new Set(selectedLines.map((line) => recordId(line)).filter(Boolean));
      for (const line of selectedLines) {
        if (await deletePersistedLine(line)) deletedPersisted = true;
      }

      if (draftMode && selectedIds.size > 0) {
        const nextDraftLines = draftLines.filter((line) => {
          const lineId = recordId(line);
          return !lineId || !selectedIds.has(lineId);
        });
        if (nextDraftLines.length !== draftLines.length) {
          setDraftLines(nextDraftLines);
          onDraftLinesChange?.([...lines, ...nextDraftLines]);
        }
      }

      setRowSelection({});
      if (deletedPersisted) await onRefresh?.();
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingSelected(false);
    }
  }

  /**
   * Picker commit — selected Selection rows flow through the adapter's
   * normalization pipeline (toDraftShape → resolveDefaults → applyParentContext),
   * then are persisted via the same path as manual entries:
   *   • Draft mode: appended to draftLines and bubbled up.
   *   • Non-draft mode: POSTed to the records collection endpoint, then
   *     onRefresh fires so the parent re-fetches.
   */
  async function handlePickerCommit(
    adapter: SourceAdapter,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (rows.length === 0) {
      setActivePickerAdapter(null);
      return;
    }
    const drafts: Record<string, unknown>[] = [];
    for (const row of rows) {
      // Each row goes through the adapter's three-stage normalization. The
      // adapter contract guarantees these are pure / deterministic.
      let draft = adapter.toDraftShape(row, parentCtx as never) as Record<string, unknown>;
      draft = (await adapter.resolveDefaults(draft as never, parentCtx as never)) as Record<string, unknown>;
      draft = adapter.applyParentContext(draft as never, parentCtx as never) as Record<string, unknown>;
      drafts.push(draft);
    }

    if (draftMode) {
      const baseNumber = allLines.length;
      const newLines = drafts.map((d, i) => ({
        id: `picker-${Date.now()}-${i}`,
        line_number: baseNumber + i + 1,
        ...d,
      })) as unknown as LineRecord[];
      const next = [...draftLines, ...newLines];
      setDraftLines(next);
      onDraftLinesChange?.([...lines, ...next]);
      setActivePickerAdapter(null);
      return;
    }

    // Non-draft mode: POST each line via relayMutate. Backend route accepts
    // sourceBinding as part of the body; downstream services persist it
    // into purchase_invoice_line.source_binding (added in DDL 01s_).
    const collectionUrl = `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines`;
    let failureCount = 0;
    for (const draft of drafts) {
      try {
        const res = await relayMutate(collectionUrl, {
          method: "POST",
          body: JSON.stringify(draft),
        });
        if (!res.ok) failureCount += 1;
      } catch {
        failureCount += 1;
      }
    }
    if (failureCount === drafts.length) {
      // Total failure — keep the picker open so the user can retry.
      return;
    }
    await onRefresh?.();
    setActivePickerAdapter(null);
  }

  function handleDraftEditorSubmit(payload: Record<string, unknown>): void {
    if (!activeLine) return;
    const lineId = recordId(activeLine);
    const next = draftLines.map((l) =>
      recordId(l) === lineId ? { ...l, ...payload } as LineRecord : l,
    );
    setDraftLines(next);
    onDraftLinesChange?.([...lines, ...next]);
  }

  function stageLinePatch(lineId: string, patch: Record<string, unknown>): void {
    setPendingLinePatches((current) => {
      const next = { ...current };
      if (Object.keys(patch).length === 0) {
        delete next[lineId];
      } else {
        next[lineId] = patch;
      }
      return next;
    });
  }

  function readEtagFromRecord(value: unknown): string {
    const source = value as Record<string, unknown> | null | undefined;
    const data = source?.["data"];
    const version = source?.["row_version"]
      ?? source?.["etag"]
      ?? (data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)["row_version"] ?? (data as Record<string, unknown>)["etag"]
        : undefined);
    return version == null ? "" : String(version);
  }

  function readRecordEtag(): string {
    return latestRecordEtag || readEtagFromRecord(record);
  }

  async function saveStagedLinePatches(lineId: string, patch: Record<string, unknown>): Promise<void> {
    const patches = { ...pendingLinePatches };
    if (Object.keys(patch).length === 0) {
      delete patches[lineId];
    } else {
      patches[lineId] = patch;
    }

    const updates = Object.entries(patches).map(([id, data]) => ({ id, data }));
    if (updates.length === 0) {
      setPendingLinePatches({});
      return;
    }

    if (draftMode) {
      const patchById = new Map(updates.map((entry) => [entry.id, entry.data]));
      const nextDraftLines = draftLines.map((line) => {
        const id = recordId(line);
        const linePatch = id ? patchById.get(id) : undefined;
        return linePatch ? { ...line, ...linePatch } as LineRecord : line;
      });
      setDraftLines(nextDraftLines);
      setPendingLinePatches({});
      onDraftLinesChange?.([...lines, ...nextDraftLines]);
      return;
    }

    const etag = readRecordEtag();
    if (!etag) throw new Error("Cannot save staged line changes: document version is missing.");

    if (!submitWorkspaceChanges) {
      throw new Error("Cannot save staged line changes: document workspace submit is unavailable.");
    }
    const submitted = await submitWorkspaceChanges({
      etag,
      lines: { update: updates },
    });
    const nextEtag = submitted.etag.trim() || readEtagFromRecord(submitted.record);
    if (nextEtag) setLatestRecordEtag(nextEtag);
    setPendingLinePatches({});
    await onRefresh?.();
  }

  // Columns are now resolved by EmbeddedEntityList from the compiled line
  // entity's display_config.list_columns (see
  // server/db/seed/platform/003_control/040b_line_grid_list_columns.sql).
  // The variant column catalogs that lived in this package were retired in
  // the DDL/catalog retirement initiative — this component no longer hands
  // over a columnsOverride.

  // The line records are TanStack's row.original — flatten the LineRecord
  // type into a plain record so the controlled callbacks (onRowClick, etc.)
  // can read fields by name without juggling DocumentLine specifics.
  const rowsForGrid = useMemo(
    () => allLines as unknown as Array<Record<string, unknown>>,
    [allLines],
  );

  // Phase 11 #8's `mobileColumns` prop is preserved on the public API but
  // unused for now: the migrated DataTable doesn't support per-column
  // viewport hiding (CSS `hidden md:table-cell`). Re-add via DataTable
  // column visibility or a media-query hook when a real consumer needs it.
  void mobileColumns;

  const summarySlot = (
    <>
      {summaryItems?.map(({ label, count, intent }) => {
        // Map procure summary intents → theme SemanticIntent. Procure emits
        // "info" for soft warnings (e.g. unclassified); the design calls for
        // a muted-warning treatment there, so we route it to the neutral
        // muted token rather than the brighter info chip.
        const themeIntent: SemanticIntent =
          intent === "error"   ? "error"   :
          intent === "warning" ? "warning" :
                                  "neutral";
        const colors = resolveSemanticColors(themeIntent);
        return (
          <span
            key={label}
            className={cn(
              "ml-2 inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              colors.subtleBadge,
            )}
          >
            {count} {label}
          </span>
        );
      })}
    </>
  );

  // Type chip only when the doc actually mixes line types — single-type
  // docs (e.g. all `item` rows) keep the mobile cards quieter.
  const showLineType = useMemo(() => {
    const types = new Set<string>();
    for (const line of allLines) {
      const value = (line as Record<string, unknown>).line_type
                 ?? (line as Record<string, unknown>).type;
      if (typeof value === "string" && value.trim()) types.add(value);
    }
    return types.size > 1;
  }, [allLines]);

  const primaryActionSlot = editMode ? (
    <AddItemDropdown
      onAddManual={() => {
        setActiveLine(null);
        setComposerMode("manual");
        setComposerOpen(true);
      }}
      onPickAdapter={(adapter) => setActivePickerAdapter(adapter)}
    />
  ) : undefined;

  const footerSlot = surface.affectsTotals && allLines.length > 0 ? (
    <AmountTotalsFooter lines={allLines} entity={lineEntity} currencyCode={currencyCode} />
  ) : undefined;

  return (
    <div className="flex flex-col">
      <ChildCollectionGrid
        entityCode={lineEntityCode}
        label={surface.label ?? "Lines"}
        count={allLines.length}
        collection={lineCollection}
        scope={{ parent_id: parentRecordId }}
        dataOverride={rowsForGrid}
        compiledEntity={lineEntity}
        columnPreferenceKey={`line-grid:${lineEntityCode}:columns:v4-authoring-grid`}
        defaultVisibleColumnKeys={defaultVisibleColumnKeys}
        requiredVisibleColumnKeys={requiredVisibleColumnKeys}
        searchKeys={LINE_SEARCH_KEYS}
        loading={isLoading}
        currencyCode={currencyCode}
        quantityDisplay="inline"
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        // Stable selection identity — guards against shuffled selection
        // when the user sorts or searches. Draft rows (no persisted id)
        // fall back to index inside EmbeddedEntityList; we accept that
        // their selection isn't stable across re-sorts.
        getRowId={(row, index) => recordId(row as LineRecord) || String(index)}
        onRowClick={handleRowClick}
        rowExpansionToggle={expansionEnabled
          ? (row) => {
              const rowId = recordId(row as LineRecord);
              const expanded = Boolean(rowId && rowId === expandedLineId);
              return (
                <button
                  type="button"
                  onClick={(event) => toggleLineExpansion(row, event)}
                  aria-label={expanded ? "Hide line details" : "Show line details"}
                  title={expanded ? "Hide details" : "Show details"}
                  aria-expanded={expanded}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
                    aria-hidden
                  />
                </button>
              );
            }
          : undefined}
        renderRowExpansion={expansionEnabled
          ? (row) => {
              const line = row as LineRecord;
              const lineId = recordId(line);
              const launch = componentLaunch?.lineId === lineId
                ? { kind: componentLaunch.kind, requestId: componentLaunch.requestId }
                : undefined;
              return renderRowExpansion!(line, launch);
            }
          : undefined}
        getIsRowExpanded={expansionEnabled
          ? (row) => recordId(row as LineRecord) === expandedLineId
          : undefined}
        paginationMode="none"
        // Mobile branch — single-glance row cards below md (768px). Same
        // rows, same selection, same row-click → opens LineItemSheet.
        mobileRows={{
          renderRow: ({ row, selected, setSelected, openRow, entity: lineEnt, currencyCode: cc }) => (
            <LineItemMobileRow
              row={row}
              selected={selected}
              setSelected={setSelected}
              openRow={openRow}
              entity={lineEnt}
              currencyCode={cc}
              showLineType={showLineType}
            />
          ),
          emptyMessage: "No lines",
          virtualized: true,
          virtualRowEstimate: 88,
          virtualOverscan: 8,
        }}
        // Rounded grid container — the toolbar + table + footer read as one
        // unified card. `overflow-hidden` clips the inner toolbar background
        // and table corners to the outer radius.
        // Flatten DataTable's default `rounded-md border` so the outer
        // grid's border isn't doubled up with the inner table's chrome.
        // The table container owns horizontal scroll because the outer
        // wrapper clips rounded corners with overflow-hidden.
        tableContainerClassName="border-0 rounded-none overflow-x-auto overflow-y-auto max-h-[min(70dvh,42rem)]"
        pinnedColumns={LINE_GRID_PINNED_COLUMNS}
        virtualized
        virtualRowEstimate={44}
        virtualOverscan={8}
        summarySlot={summarySlot}
        primaryActionSlot={primaryActionSlot}
        footerSlot={footerSlot}
      />

      {/* Floating selection action bar — shared @athyper/ui primitive via
          surface adapter. Phase 4a is visual-only (Copy / Delete still
          deferred via undefined handlers); phase 4b wires them to the
          bulk-action engine. */}
      <LineItemsSelectionBar
        selectionCount={selectionCount}
        onClearSelection={() => setRowSelection({})}
        onEditSelected={selectionCount === 1 ? handleEditSelected : undefined}
        onViewSelected={!editMode && selectionCount === 1 ? handleViewSelected : undefined}
        onEditAccountingSelected={selectionCount > 0 ? handleEditAccountingSelected : undefined}
        onViewAccountingSelected={!editMode && selectionCount === 1 ? handleViewAccountingSelected : undefined}
        onManageComponentsSelected={selectionCount === 1 && expansionEnabled ? handleManageComponentsSelected : undefined}
        onAddComponentSelected={selectionCount === 1 && expansionEnabled ? handleAddComponentSelected : undefined}
        onCopySelected={selectionCount > 0 && !copyingSelected ? () => void handleCopySelected() : undefined}
        onDeleteSelected={selectionCount > 0 && !deletingSelected ? handleDeleteSelected : undefined}
        editMode={editMode}
        operations={selectionOperations}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!deletingSelected) setDeleteConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectionCount} selected {selectionCount === 1 ? "line" : "lines"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected purchase order lines. For PO lines, the server also cleans up linked draft children: accounting distributions and pricing components are deleted, and schedules are cancelled so their audit trail remains.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSelected}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingSelected}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteSelected();
              }}
            >
              {deletingSelected ? "Deleting..." : "Delete lines"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Composer sheet — opens via "+ Add Item" button */}
      <LineItemComposerSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        line={activeLine}
        entityCode={entityCode}
        recordId={parentRecordId}
        lineEntityCode={lineEntityCode}
        lineEntity={lineEntity}
        currencyCode={currencyCode}
        companyCodeId={companyCodeId}
        record={record}
        composerMode={composerMode}
        variantKey={variantKey}
        onMutated={onRefresh}
        onDraftSubmit={(payload) => handleComposerSubmit(payload)}
        lineFieldChangeResolver={lineFieldChangeResolver}
      />

      {/* Source-adapter picker. Mounted when the user picks an adapter
          from the AddItemDropdown. Stays mounted as long as the user has
          a picker open; closes on Cancel or after a successful commit. */}
      {activePickerAdapter && (
        <SourceAdapterPicker
          adapter={activePickerAdapter}
          parentCtx={parentCtx}
          open={true}
          bindingLabel={`${activePickerAdapter.manifest.label} · ${entityCode}`}
          onClose={() => setActivePickerAdapter(null)}
          onCommit={(rows) => void handlePickerCommit(activePickerAdapter, rows as Array<Record<string, unknown>>)}
        />
      )}

      {/* Editor sheet */}
      {activeLine && (
        <LineItemEditorSheet
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) {
              setEditorInitialTab(undefined);
              setPendingLinePatches({});
            }
          }}
          line={activeLine as import("@athyper/api-contracts/documents").DocumentLine}
          mode={editorMode}
          readOnly={editorMode === "view"}
          distributions={distributions}
          entityCode={entityCode}
          recordId={parentRecordId}
          lineEntityCode={lineEntityCode}
          lineEntity={lineEntity}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          record={record}
          canEdit={editMode}
          onPromoteToEdit={editMode ? () => setEditorMode("edit") : undefined}
          initialTab={editorInitialTab}
          variantKey={variantKey}
          onMutated={onRefresh}
          onDraftSubmit={draftMode ? (payload) => { handleDraftEditorSubmit(payload); } : undefined}
          lineFieldChangeResolver={lineFieldChangeResolver}
          hasPreviousLine={hasPreviousLine}
          hasNextLine={hasNextLine}
          linePositionLabel={linePositionLabel}
          stagedPatch={activeStagedPatch}
          stagedLineCount={stagedLineCount}
          onStageLinePatch={stageLinePatch}
          onSaveStagedLines={submitWorkspaceChanges ? saveStagedLinePatches : undefined}
          onPreviousLine={openPreviousLine}
          onNextLine={openNextLine}
        />
      )}

      {accountingLine && (
        <AccountingDistributionDrawer
          open={accountingDrawerOpen}
          onOpenChange={(open) => {
            setAccountingDrawerOpen(open);
            if (!open) {
              setAccountingLine(null);
              setAccountingTargetLines([]);
            }
          }}
          editing={accountingDistributions[0] ?? null}
          readOnly={accountingDrawerReadOnly}
          distributions={accountingDistributions}
          documentRecord={record ?? null}
          lineRecord={accountingLine as Record<string, unknown>}
          lineGrossAmount={Number(accountingLine["gross_amount"] ?? accountingLine["total_amount"] ?? accountingLine["net_amount"] ?? 0)}
          distributionTargetAmount={accountingDistributionTarget}
          distributionTargetLabel="Distributable cost"
          lineCurrencyCode={currencyCode ?? ""}
          templateOptions={accountingTemplateOptions}
          templateLineId={accountingLineId}
          onTemplateLineChange={selectAccountingTemplate}
          applyCount={accountingTargetLines.length || 1}
          compiledEntity={accountingEntity}
          onSubmit={submitDirectAccountingDistribution}
          onReplaceDistributions={replaceDirectAccountingDistributions}
        />
      )}
    </div>
  );
}
