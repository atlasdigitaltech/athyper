"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, ChevronDown, Copy, Download, Eye, FileText, PackagePlus, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@athyper/ui/primitives";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { relayMutate } from "@athyper/runtime-shared/client";
import { useEditSessionContext } from "@athyper/content-ui";
import { ItemsGrid } from "./ItemsGrid";
import { LineComposerSheet } from "./LineComposerSheet";
import { LineEditorSheet } from "./LineEditorSheet";
import { ProcureLineComposerSheet } from "./ProcureLineComposerSheet";
import { ProcureLineEditorSheet } from "./ProcureLineEditorSheet";
import {
  type LineRecord,
  type MetaLineColumn,
  type LineOrganizerConfig,
  buildCopyPayload,
  recordId,
  recordValue,
  resolveLineColumn,
  resolveDefaultSortField,
  resolveLineColumns,
  resolveLineEntityCode,
  resolveLineOrganizer,
  resolveSearchFields,
  useCompiledEntityMetadata,
} from "./metaLineRuntime";
import { resolveLineSheetVariant, resolveProcureAmountConfig } from "./procureLineRuntime";
import { LinesOrganizePalette } from "./LinesOrganizePalette";
import { MassEditSheet } from "./MassEditSheet";

type SortDirection = "asc" | "desc";
type AddLineMode = "manual" | "catalog";

const PROCURE_COLUMN_CANDIDATES: string[][] = [
  ["line_no", "line_number"],
  ["item_id", "item_code"],
  ["commodity_category_id"],
  ["business_intent_id"],
  ["item_description", "description"],
  ["quantity", "qty"],
  ["uom_code", "unit_code", "uom"],
  ["unit_price", "price"],
  ["net_amount"],
  ["discount_amount"],
  ["tax_amount"],
  ["gross_amount"],
  ["retention_amount"],
];

function buildProcureColumnCatalog(
  entity: CompiledEntity | null,
  resolvedColumns: MetaLineColumn[],
): MetaLineColumn[] {
  if (!entity) return [];
  const fromResolved = new Map(resolvedColumns.map((column) => [column.field.name, column]));
  const out: MetaLineColumn[] = [];
  const seen = new Set<string>();

  for (const candidates of PROCURE_COLUMN_CANDIDATES) {
    let chosen: MetaLineColumn | null = null;
    for (const fieldName of candidates) {
      chosen = fromResolved.get(fieldName) ?? resolveLineColumn(entity, fieldName);
      if (chosen) break;
    }
    if (!chosen || seen.has(chosen.field.name)) continue;
    out.push(chosen);
    seen.add(chosen.field.name);
  }
  return out;
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export interface LinesGridProps {
  entity?: CompiledEntity;
  entityCode: string;
  recordId: string;
  lineEntityCode?: string | null;
  recordUuid?: string;
  currencyCode?: string;
  companyCodeId?: string;
  record?: Record<string, unknown>;
  lines: DocumentLine[];
  distributions: AccountingDistribution[];
  isLoading?: boolean;
  onRefresh?: () => void;
  hasAiClassification?: boolean;
  hasLineComposer?: boolean;
  suggestEndpointBase?: string;
  classifyEndpointBase?: string;
  editMode?: boolean;
  draftMode?: boolean;
  onDraftLinesChange?: (lines: DocumentLine[]) => void;
  currencyMinorUnits?: number | null;
}

function collectionUrl(entityCode: string, recordIdValue: string): string {
  return `/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordIdValue)}/lines`;
}

function itemUrl(entityCode: string, recordIdValue: string, lineId: string): string {
  return `${collectionUrl(entityCode, recordIdValue)}/${encodeURIComponent(lineId)}`;
}

function compareValues(a: unknown, b: unknown): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

// OR logic — line passes if it satisfies ANY one of the active quick-filters.
// Kinds without a client-side representation (e.g. high_amount) are treated as
// always-passing so the filter chip renders without hiding unexpected lines.
function applyOrganizerFilter(
  line: DocumentLine,
  activeFilterKeys: Set<string>,
  organizer: LineOrganizerConfig | null,
  distributions: AccountingDistribution[],
): boolean {
  if (!organizer || activeFilterKeys.size === 0) return true;
  const lineRec = line as LineRecord;
  const lineId  = recordId(lineRec);
  const lineDists = distributions.filter((d) => d.source_line_id === lineId);

  for (const filter of organizer.filters) {
    if (!activeFilterKeys.has(filter.key)) continue;
    switch (filter.kind) {
      case "match_status":
        if (recordValue(lineRec, "match_status") === filter.value) return true;
        break;
      case "classification_status":
        if (recordValue(lineRec, "classification_status") === filter.value) return true;
        break;
      case "allocation_status":
        if (recordValue(lineRec, "allocation_status") === filter.value) return true;
        break;
      case "capex":
        if (lineDists.some((d) => d.is_capex)) return true;
        break;
      case "distribution_count": {
        const count = lineDists.length;
        const passes = filter.op === "gt"
          ? count > Number(filter.value ?? 0)
          : count === Number(filter.value ?? 0);
        if (passes) return true;
        break;
      }
      case "missing_classification":
        if (!recordValue(lineRec, "commodity_category_id") && !recordValue(lineRec, "item_id")) return true;
        break;
      default:
        // kind not resolvable client-side — no-op, treat as passing
        return true;
    }
  }
  return false;
}

function applyOrganizerSort(
  lines: DocumentLine[],
  activeSortKey: string,
  organizer: LineOrganizerConfig,
): DocumentLine[] {
  const preset = organizer.sorts.find((s) => s.key === activeSortKey);
  if (!preset) return lines;
  return [...lines].sort((a, b) => {
    const av = recordValue(a as LineRecord, preset.field);
    const bv = recordValue(b as LineRecord, preset.field);
    const na = preset.absolute && Number.isFinite(Number(av)) ? Math.abs(Number(av)) : av;
    const nb = preset.absolute && Number.isFinite(Number(bv)) ? Math.abs(Number(bv)) : bv;
    const delta = compareValues(na, nb);
    return preset.direction === "desc" ? -delta : delta;
  });
}

function matchesSearch(line: DocumentLine, query: string, fields: ReturnType<typeof resolveSearchFields>): boolean {
  if (!query) return true;
  return fields.some((field) => {
    const value = recordValue(line as LineRecord, field);
    return value != null && String(value).toLowerCase().includes(query);
  });
}

function selectedLines(lines: DocumentLine[], selectedIds: Set<string>): DocumentLine[] {
  return lines.filter((line) => selectedIds.has(recordId(line as LineRecord)));
}

function flagValueEnabled(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1" || normalized === "enabled";
}

function catalogFeatureEnabled(entity: CompiledEntity | undefined): boolean {
  const flags = entity?.feature_flags as Record<string, unknown> | undefined;
  if (!flags) return false;
  return flagValueEnabled(
    flags["catalog_feature_enabled"] ??
    flags["catalog_enabled"] ??
    flags["catalog_items_enabled"] ??
    flags["has_catalog_items"] ??
    flags["has_catalog"],
  );
}

function supportsCatalogItemMode(entity: CompiledEntity | null): boolean {
  return Boolean(entity?.fields.some((field) => {
    const ref = field.reference_config as Record<string, unknown> | null | undefined;
    const refEntity = ref?.["target_entity"];
    return field.name === "item_id" || refEntity === "item";
  }));
}

function normalizedText(value: unknown): string {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function lineAmountValue(line: DocumentLine): number | null {
  for (const field of ["line_amount", "gross_amount", "net_amount"]) {
    const value = Number(recordValue(line as LineRecord, field));
    if (Number.isFinite(value)) return Math.abs(value);
  }
  return null;
}

function isUnallocatedLine(line: DocumentLine, distributions: AccountingDistribution[]): boolean {
  const status = normalizedText(recordValue(line as LineRecord, "allocation_status"));
  if (["unallocated", "not_allocated", "partially_allocated", "partial"].includes(status)) return true;
  if (["allocated", "fully_allocated"].includes(status)) return false;

  const lineId = recordId(line as LineRecord);
  const lineDists = lineId ? distributions.filter((d) => d.source_line_id === lineId) : [];
  if (lineDists.length === 0) return true;

  const lineAmount = lineAmountValue(line);
  if (lineAmount == null) return false;

  const distributedAmount = Math.abs(
    lineDists.reduce((sum, dist) => sum + Number(dist.distributed_amount ?? 0), 0),
  );
  return Math.abs(lineAmount - distributedAmount) >= 0.005;
}

function isNotYetClassifiedLine(line: DocumentLine): boolean {
  const explicitStatus = normalizedText(recordValue(line as LineRecord, "classification_status"));
  if (["not_yet_classified", "not_classified", "unclassified", "pending", "missing"].includes(explicitStatus)) return true;
  if (["resolved", "classified", "needs_review", "blocked"].includes(explicitStatus)) return false;

  const decision = recordValue(line as LineRecord, "classification_decision");
  if (!isObjectRecord(decision)) return true;

  return normalizedText(decision["status"]).length === 0;
}

function isUnmatchedLine(line: DocumentLine): boolean {
  return normalizedText(recordValue(line as LineRecord, "match_status")) === "unmatched";
}

let draftLineCounter = 0;
const DRAFT_LINE_ID_FIELD = "__draft_line_id";
const DRAFT_PURCHASE_INVOICE_CLASSIFY_URL = "/api/finance/ap/invoices/draft-lines/classify";

function createDraftLineId(): string {
  draftLineCounter += 1;
  return `draft-line-${Date.now()}-${draftLineCounter}`;
}

function asDraftDocumentLine(record: Record<string, unknown>): DocumentLine {
  return record as unknown as DocumentLine;
}

function ensureDraftLineId(line: DocumentLine): DocumentLine {
  const lineRec = line as LineRecord;
  const existingId = recordId(lineRec);
  if (existingId) return line;

  const hiddenId = recordValue(lineRec, DRAFT_LINE_ID_FIELD);
  const id = hiddenId != null && String(hiddenId).trim()
    ? String(hiddenId)
    : createDraftLineId();

  return asDraftDocumentLine({
    ...lineRec,
    id,
    [DRAFT_LINE_ID_FIELD]: id,
  });
}

function withNewDraftLineId(payload: Record<string, unknown>): DocumentLine {
  const id = createDraftLineId();
  return asDraftDocumentLine({
    ...payload,
    id,
    [DRAFT_LINE_ID_FIELD]: id,
  });
}

function isBlankDraftValue(value: unknown): boolean {
  return value == null || value === "";
}

function isPurchaseInvoiceEntity(entityCode: string): boolean {
  return entityCode.replace(/-/g, "_").toLowerCase() === "purchase_invoice";
}

function draftLineHasSourceDocument(line: DocumentLine): boolean {
  const record = line as LineRecord;
  return Boolean(
    recordValue(record, "commitment_line_id") ||
    recordValue(record, "goods_receipt_line_id") ||
    recordValue(record, "ses_line_id")
  );
}

function classificationDecisionFromResponse(body: Record<string, unknown>): Record<string, unknown> | null {
  const data = isObjectRecord(body["data"]) ? body["data"] : null;
  const candidates = [
    body["classification"],
    body["decision"],
    data?.["classification"] ?? data?.["decision"],
  ];
  for (const candidate of candidates) {
    if (isObjectRecord(candidate) && candidate["status"]) return candidate;
  }
  return null;
}

function applyClassificationDecision(
  line: DocumentLine,
  decision: Record<string, unknown>,
): DocumentLine {
  const lineRecord = line as LineRecord;
  const data = isObjectRecord(lineRecord.data) ? lineRecord.data : {};
  const selected = isObjectRecord(decision["selected"]) ? decision["selected"] : {};
  const commodity = isObjectRecord(selected["line_commodity_code"])
    ? selected["line_commodity_code"]
    : null;
  const nextData: Record<string, unknown> = { ...data };
  const next: Record<string, unknown> = {
    ...lineRecord,
    classification_decision: decision,
    classification_status: decision["status"],
  };

  const commodityCategoryId = selected["commodity_category_id"];
  if (commodityCategoryId != null) next["commodity_category_id"] = commodityCategoryId;
  const businessIntentId = selected["business_intent_id"];
  if (businessIntentId != null) next["business_intent_id"] = businessIntentId;

  const domain = typeof commodity?.["domain_code"] === "string"
    ? commodity["domain_code"].toLowerCase()
    : "";
  const code = commodity?.["code"];
  if (code != null && domain === "unspsc") {
    next["unspsc_code"] = code;
    nextData["unspsc_code"] = code;
  }
  if (code != null && domain === "hs") {
    next["hs_code"] = code;
    next["trade_code"] = code;
    nextData["hs_code"] = code;
  }

  return asDraftDocumentLine({
    ...next,
    data: nextData,
  });
}

function firstDraftValue(record: LineRecord, fieldNames: Array<string | undefined>): unknown {
  for (const fieldName of fieldNames) {
    if (!fieldName) continue;
    const value = recordValue(record, fieldName);
    if (!isBlankDraftValue(value)) return value;
  }
  return undefined;
}

function firstDraftNumber(record: LineRecord, fieldNames: Array<string | undefined>): number | null {
  const value = firstDraftValue(record, fieldNames);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundDraftAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function setDraftAlias(record: Record<string, unknown>, fieldName: string, value: unknown) {
  if (isBlankDraftValue(value)) return;
  if (!isBlankDraftValue(record[fieldName])) return;
  record[fieldName] = value;
}

function nextDraftLineNumber(lines: DocumentLine[], editingLine?: DocumentLine | null): number {
  const editingRecord = editingLine as LineRecord | null | undefined;
  const existing = editingRecord
    ? firstDraftNumber(editingRecord, ["line_number", "line_no"])
    : null;
  if (existing != null && existing > 0) return existing;

  const editingId = editingRecord ? recordId(editingRecord) : "";
  if (editingId) {
    const index = lines.findIndex((line) => recordId(line as LineRecord) === editingId);
    if (index >= 0) return index + 1;
  }

  const maxLineNo = lines.reduce(
    (max, line) => Math.max(max, firstDraftNumber(line as LineRecord, ["line_number", "line_no"]) ?? 0),
    0,
  );
  return Math.max(maxLineNo, lines.length) + 1;
}

function mergeDraftLineRecord(line: DocumentLine, payload: Record<string, unknown>): Record<string, unknown> {
  const lineRecord = line as LineRecord;
  const lineData = isObjectRecord(lineRecord.data) ? lineRecord.data : {};
  const payloadData = isObjectRecord(payload["data"]) ? payload["data"] : {};
  const mergedData = { ...lineData, ...payloadData };
  return {
    ...lineRecord,
    ...payload,
    ...(Object.keys(mergedData).length > 0 ? { data: mergedData } : {}),
  };
}

function normalizeProcureDraftLine(
  payload: Record<string, unknown>,
  entity: CompiledEntity | null,
  lines: DocumentLine[],
  editingLine?: DocumentLine | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const lineRecord = next as LineRecord;
  const lineNumber = nextDraftLineNumber(lines, editingLine);

  setDraftAlias(next, "line_no", lineNumber);
  setDraftAlias(next, "line_number", lineNumber);

  const description = firstDraftValue(lineRecord, ["description", "item_description"]);
  setDraftAlias(next, "description", description);
  setDraftAlias(next, "item_description", description);

  const uomCode = firstDraftValue(lineRecord, ["unit_code", "uom_code", "uom"]);
  setDraftAlias(next, "unit_code", uomCode);
  setDraftAlias(next, "uom_code", uomCode);

  const amountConfig = resolveProcureAmountConfig(entity);
  const amountField = amountConfig?.amountField;
  const configuredAmount = firstDraftNumber(lineRecord, [amountField]);
  const explicitNet = firstDraftNumber(lineRecord, ["net_amount"]);
  const explicitGross = firstDraftNumber(lineRecord, ["gross_amount", "line_amount"]);
  const quantity = firstDraftNumber(lineRecord, ["quantity", "qty"]);
  const unitPrice = firstDraftNumber(lineRecord, ["unit_price", "price"]);
  const priceUnit = firstDraftNumber(lineRecord, ["price_unit"]) ?? 1;
  const formulaNet = quantity != null && unitPrice != null && quantity > 0 && unitPrice >= 0 && priceUnit > 0
    ? roundDraftAmount((quantity * unitPrice) / priceUnit)
    : null;
  const netAmount = explicitNet
    ?? (amountField === "net_amount" ? configuredAmount : null)
    ?? formulaNet
    ?? explicitGross
    ?? configuredAmount;

  if (netAmount != null) {
    const discountPct = firstDraftNumber(lineRecord, ["discount_pct"]);
    const explicitDiscount = firstDraftNumber(lineRecord, ["discount_amount"]);
    const discountAmount = explicitDiscount
      ?? (discountPct != null && discountPct > 0 ? roundDraftAmount((netAmount * discountPct) / 100) : 0);
    const taxAmount = firstDraftNumber(lineRecord, ["tax_amount"]) ?? 0;
    const chargesAmount = firstDraftNumber(lineRecord, ["charges_amount", "charge_amount", "misc_charges_amount"]) ?? 0;
    const grossAmount = explicitGross
      ?? (amountField && amountField !== "net_amount" ? configuredAmount : null)
      ?? roundDraftAmount(netAmount - discountAmount + taxAmount + chargesAmount);

    setDraftAlias(next, "net_amount", netAmount);
    setDraftAlias(next, "discount_amount", discountAmount);
    setDraftAlias(next, "gross_amount", grossAmount);
    setDraftAlias(next, "line_amount", grossAmount);
  }

  return next;
}


export function LinesGrid(props: LinesGridProps) {
  const {
    entity,
    entityCode,
    recordId: parentRecordId,
    lineEntityCode: lineEntityCodeOverride,
    companyCodeId,
    record,
    currencyCode = "USD",
    lines,
    distributions,
    isLoading,
    onRefresh,
    editMode = false,
    draftMode = false,
    onDraftLinesChange,
  } = props;

  const displayLines = useMemo(
    () => draftMode ? lines.map(ensureDraftLineId) : lines,
    [draftMode, lines],
  );
  const lineEntityCode = useMemo(
    () => {
      const override = typeof lineEntityCodeOverride === "string"
        ? lineEntityCodeOverride.trim()
        : lineEntityCodeOverride;
      return override || resolveLineEntityCode(entity, entityCode);
    },
    [entity, entityCode, lineEntityCodeOverride],
  );
  const lineEntity = useCompiledEntityMetadata(lineEntityCode);
  const lineVariant = useMemo(() => resolveLineSheetVariant(lineEntity), [lineEntity]);
  const resolvedColumns = useMemo(() => resolveLineColumns(lineEntity), [lineEntity]);
  const availableColumns = useMemo(() => {
    if (lineVariant !== "procure") return resolvedColumns;
    const curated = buildProcureColumnCatalog(lineEntity, resolvedColumns);
    return curated.length > 0 ? curated : resolvedColumns;
  }, [lineEntity, lineVariant, resolvedColumns]);
  const defaultVisibleColumnKeys = useMemo(() => {
    const available = new Set(availableColumns.map((column) => column.field.name));
    const fromResolvedDefaults = resolvedColumns
      .filter((column) =>
        lineVariant !== "procure" || (
          column.field.name !== "procurement_type" &&
          column.field.name !== "match_status" &&
          column.field.name !== "discount_amount"
        ),
      )
      .map((column) => column.field.name)
      .filter((name) => available.has(name));
    if (fromResolvedDefaults.length > 0) return fromResolvedDefaults;
    return availableColumns.map((column) => column.field.name);
  }, [availableColumns, lineVariant, resolvedColumns]);
  const [activeColumnKeys, setActiveColumnKeys] = useState<Set<string>>(new Set());
  const columns = useMemo(() => {
    const selected = activeColumnKeys.size > 0
      ? activeColumnKeys
      : new Set(defaultVisibleColumnKeys);
    const visible = availableColumns.filter((column) => selected.has(column.field.name));
    if (visible.length > 0) return visible;
    return availableColumns.slice(0, 1);
  }, [activeColumnKeys, availableColumns, defaultVisibleColumnKeys]);
  const columnOptions = useMemo(
    () => availableColumns.map((column) => ({ key: column.field.name, label: column.label })),
    [availableColumns],
  );
  const searchFields = useMemo(() => resolveSearchFields(lineEntity, columns), [columns, lineEntity]);
  const defaultSortField = useMemo(() => resolveDefaultSortField(lineEntity, columns), [columns, lineEntity]);

  // Phase 6d: when LinesGrid is mounted inside an active Edit Session, mass
  // delete and duplicate queue into the bundle instead of hitting per-line
  // REST endpoints. Returns null outside object-page edit mode.
  const editSession = useEditSessionContext();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string | undefined>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [drawerLine, setDrawerLine] = useState<DocumentLine | null>(null);
  const [drawerReadOnly, setDrawerReadOnly] = useState(true);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLine, setComposerLine] = useState<DocumentLine | null>(null);
  const [addLineMode, setAddLineMode] = useState<AddLineMode>("manual");
  const [busy, setBusy] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Organizer palette state — populated from metadata defaults when entity loads
  const [activeSortKey, setActiveSortKey] = useState<string>("");
  const [activeFilterKeys, setActiveFilterKeys] = useState<Set<string>>(new Set());
  const [activeGroupKey, setActiveGroupKey] = useState<string>("");
  const [activeDensity, setActiveDensity] = useState<string>("");
  const canMutateLines = editMode === true || draftMode === true;
  const canUseCatalogItems = catalogFeatureEnabled(entity);
  const showCatalogAddOption = lineVariant === "procure" && supportsCatalogItemMode(lineEntity);
  const canReclassifySelection = lineVariant === "procure" && isPurchaseInvoiceEntity(entityCode);

  const singleSelectedLine = useMemo(
    () => selectedIds.size === 1
      ? displayLines.find((l) => selectedIds.has(recordId(l as LineRecord))) ?? null
      : null,
    [displayLines, selectedIds],
  );

  useEffect(() => {
    setSortField(defaultSortField);
  }, [defaultSortField]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (canMutateLines) return;
    setSelectedIds(new Set());
    setComposerOpen(false);
    setComposerLine(null);
    setDrawerReadOnly(true);
  }, [canMutateLines]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const available = new Set(displayLines.map((line) => recordId(line as LineRecord)));
      const next = new Set([...prev].filter((id) => available.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayLines]);

  useEffect(() => {
    const available = new Set(availableColumns.map((column) => column.field.name));
    setActiveColumnKeys((prev) => {
      if (available.size === 0) return new Set();

      const desired = prev.size > 0
        ? new Set([...prev].filter((name) => available.has(name)))
        : new Set(defaultVisibleColumnKeys.filter((name) => available.has(name)));

      if (desired.size === 0) {
        for (const fallback of defaultVisibleColumnKeys) {
          if (available.has(fallback)) desired.add(fallback);
        }
      }
      if (desired.size === 0) {
        const first = availableColumns[0]?.field.name;
        if (first) desired.add(first);
      }

      return setEquals(prev, desired) ? prev : desired;
    });
  }, [availableColumns, defaultVisibleColumnKeys]);

  const organizer = useMemo(() => resolveLineOrganizer(lineEntity), [lineEntity]);

  // Sync organizer defaults into palette state whenever the entity (and thus its
  // organizer config) changes — e.g. navigating between different document types.
  useEffect(() => {
    if (!organizer) return;
    setActiveSortKey(organizer.defaultSort);
    setActiveGroupKey(organizer.defaultGroup);
    setActiveDensity(organizer.defaultDensity);
    setActiveFilterKeys(new Set());
  }, [organizer]);

  const visibleLines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = displayLines
      .filter((line) => matchesSearch(line, query, searchFields))
      .filter((line) => applyOrganizerFilter(line, activeFilterKeys, organizer, distributions));
    if (organizer) {
      return applyOrganizerSort(filtered, activeSortKey, organizer);
    }
    const sortableField = lineEntity?.fields.find((field) => field.name === sortField);
    if (!sortableField) return filtered;
    return [...filtered].sort((a, b) => {
      const delta = compareValues(
        recordValue(a as LineRecord, sortableField),
        recordValue(b as LineRecord, sortableField),
      );
      return sortDirection === "desc" ? -delta : delta;
    });
  }, [lineEntity, displayLines, searchFields, searchQuery, sortDirection, sortField, organizer, activeSortKey, activeFilterKeys, distributions]);

  const lineSummary = useMemo(() => ({
    unallocated: visibleLines.filter((line) => isUnallocatedLine(line, distributions)).length,
    notYetClassified: visibleLines.filter(isNotYetClassifiedLine).length,
    unmatched: visibleLines.filter(isUnmatchedLine).length,
  }), [visibleLines, distributions]);
  const showLineSummary = lineVariant === "procure";

  const sortableFields = useMemo(
    () => lineEntity?.fields.filter((field) => field.is_sortable) ?? [],
    [lineEntity],
  );

  const drawerLineIndex = drawerLine
    ? visibleLines.findIndex((line) => recordId(line as LineRecord) === recordId(drawerLine as LineRecord))
    : -1;
  const hasPreviousDrawerLine = drawerLineIndex > 0;
  const hasNextDrawerLine = drawerLineIndex >= 0 && drawerLineIndex < visibleLines.length - 1;

  const allVisibleSelected = visibleLines.length > 0
    && visibleLines.every((line) => selectedIds.has(recordId(line as LineRecord)));

  function toggleLine(lineId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const line of visibleLines) next.add(recordId(line as LineRecord));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleColumn(columnKey: string) {
    setActiveColumnKeys((prev) => {
      const current = prev.size > 0 ? new Set(prev) : new Set(defaultVisibleColumnKeys);
      if (current.has(columnKey)) {
        if (current.size <= 1) return current;
        current.delete(columnKey);
        return current;
      }
      current.add(columnKey);
      return current;
    });
  }

  function resetColumns() {
    setActiveColumnKeys(new Set(defaultVisibleColumnKeys));
  }

  function publishDraftLines(next: DocumentLine[]) {
    onDraftLinesChange?.(next);
  }

  function openComposer(line: DocumentLine | null = null, mode?: AddLineMode) {
    setComposerLine(line);
    setAddLineMode(mode ?? (line && recordValue(line as LineRecord, "item_id") ? "catalog" : "manual"));
    setComposerOpen(true);
  }

  function openLineView(line: DocumentLine) {
    setDrawerLine(line);
    setDrawerReadOnly(true);
  }

  function openLineEdit(line: DocumentLine) {
    if (lineVariant === "procure") {
      setDrawerLine(line);
      setDrawerReadOnly(false);
      return;
    }
    if (draftMode) {
      openComposer(line);
      return;
    }
    setDrawerLine(line);
    setDrawerReadOnly(false);
  }

  async function classifyDraftProcureLine(line: DocumentLine, mode = "preview"): Promise<DocumentLine> {
    if (
      !draftMode ||
      lineVariant !== "procure" ||
      !isPurchaseInvoiceEntity(entityCode) ||
      draftLineHasSourceDocument(line)
    ) {
      return line;
    }

    try {
      const res = await relayMutate(DRAFT_PURCHASE_INVOICE_CLASSIFY_URL, {
        method: "POST",
        body: JSON.stringify({ record: record ?? {}, line, mode }),
      });
      if (!res.ok) return line;
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const decision = classificationDecisionFromResponse(body);
      return decision ? applyClassificationDecision(line, decision) : line;
    } catch {
      return line;
    }
  }

  async function classifyAndPublishDraftLine(line: DocumentLine, mode = "preview"): Promise<Record<string, unknown> | void> {
    const lineId = recordId(line as LineRecord);
    if (!lineId) return undefined;
    const classified = await classifyDraftProcureLine(line, mode);
    publishDraftLines(displayLines.map((existing) =>
      recordId(existing as LineRecord) === lineId ? classified : existing,
    ));
    const decision = recordValue(classified as LineRecord, "classification_decision");
    return isObjectRecord(decision) ? decision : undefined;
  }

  function applyDraftPatchToSelection(patch: Record<string, unknown>) {
    const next = displayLines.map((line) => {
      const lineId = recordId(line as LineRecord);
      if (!selectedIds.has(lineId)) return line;
      const merged = mergeDraftLineRecord(line, patch);
      const normalized = lineVariant === "procure"
        ? normalizeProcureDraftLine(merged, lineEntity, displayLines, line)
        : merged;
      return asDraftDocumentLine({ ...normalized, id: lineId, [DRAFT_LINE_ID_FIELD]: lineId });
    });
    publishDraftLines(next);
    clearSelection();
  }

  async function handleDraftComposerSubmit(payload: Record<string, unknown>) {
    const editingId = composerLine ? recordId(composerLine as LineRecord) : "";
    if (editingId) {
      const nextLines = await Promise.all(displayLines.map(async (line) => {
        const lineId = recordId(line as LineRecord);
        if (lineId !== editingId) return line;
        const merged = mergeDraftLineRecord(line, payload);
        const normalized = lineVariant === "procure"
          ? normalizeProcureDraftLine(merged, lineEntity, displayLines, line)
          : merged;
        const nextLine = asDraftDocumentLine({ ...normalized, id: editingId, [DRAFT_LINE_ID_FIELD]: editingId });
        return classifyDraftProcureLine(nextLine);
      }));
      publishDraftLines(nextLines);
    } else {
      const normalized = lineVariant === "procure"
        ? normalizeProcureDraftLine(payload, lineEntity, displayLines)
        : payload;
      const nextLine = await classifyDraftProcureLine(withNewDraftLineId(normalized));
      publishDraftLines([...displayLines, nextLine]);
    }
    setComposerLine(null);
  }

  async function handleDraftEditorSubmit(payload: Record<string, unknown>) {
    const editingId = drawerLine ? recordId(drawerLine as LineRecord) : "";
    if (!editingId) return;
    const nextLines = await Promise.all(displayLines.map(async (line) => {
      const lineId = recordId(line as LineRecord);
      if (lineId !== editingId) return line;
      const merged = mergeDraftLineRecord(line, payload);
      const normalized = lineVariant === "procure"
        ? normalizeProcureDraftLine(merged, lineEntity, displayLines, line)
        : merged;
      const nextLine = asDraftDocumentLine({ ...normalized, id: editingId, [DRAFT_LINE_ID_FIELD]: editingId });
      return classifyDraftProcureLine(nextLine);
    }));
    publishDraftLines(nextLines);
    setDrawerLine(null);
  }

  function navigateDrawerLine(delta: -1 | 1) {
    const nextLine = visibleLines[drawerLineIndex + delta];
    if (nextLine) setDrawerLine(nextLine);
  }

  async function duplicateSelection() {
    if (!lineEntity) return;
    if (draftMode) {
      const copies = selectedLines(displayLines, selectedIds).reduce<DocumentLine[]>((acc, line) => {
        const payload = buildCopyPayload(lineEntity, line as LineRecord);
        delete payload["line_no"];
        delete payload["line_number"];
        const normalized = lineVariant === "procure"
          ? normalizeProcureDraftLine(payload, lineEntity, [...displayLines, ...acc])
          : payload;
        return [...acc, withNewDraftLineId(normalized)];
      }, []);
      publishDraftLines([...displayLines, ...copies]);
      setSelectedIds(new Set());
      return;
    }

    // Edit Session route: queue creates from copy payloads. Drop line_no so
    // the server-side bundle handler auto-numbers them post-delete.
    if (editSession?.isEditing) {
      for (const line of selectedLines(displayLines, selectedIds)) {
        const payload = buildCopyPayload(lineEntity, line as LineRecord);
        delete payload["line_no"];
        delete payload["line_number"];
        editSession.addLine(payload);
      }
      setSelectedIds(new Set());
      return;
    }

    setBusy(true);
    try {
      for (const line of selectedLines(displayLines, selectedIds)) {
        await relayMutate(collectionUrl(entityCode, parentRecordId), {
          method: "POST",
          body: JSON.stringify(buildCopyPayload(lineEntity, line as LineRecord)),
        });
      }
      setSelectedIds(new Set());
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelection() {
    if (draftMode) {
      publishDraftLines(displayLines.filter((line) => !selectedIds.has(recordId(line as LineRecord))));
      setSelectedIds(new Set());
      return;
    }

    // Edit Session route: queue deletes into the bundle and clear selection.
    // The action-bar Save commits them atomically with header + line updates.
    if (editSession?.isEditing) {
      for (const line of selectedLines(displayLines, selectedIds)) {
        editSession.deleteLine(recordId(line as LineRecord));
      }
      setSelectedIds(new Set());
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        selectedLines(displayLines, selectedIds).map((line) =>
          relayMutate(itemUrl(entityCode, parentRecordId, recordId(line as LineRecord)), { method: "DELETE" }),
        ),
      );
      setSelectedIds(new Set());
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  async function reclassifySelection() {
    if (!canReclassifySelection) return;
    const rows = selectedLines(displayLines, selectedIds);
    if (rows.length === 0) return;

    setBusy(true);
    try {
      if (draftMode) {
        const selectedIdSet = new Set(rows.map((line) => recordId(line as LineRecord)));
        const nextLines = await Promise.all(displayLines.map((line) =>
          selectedIdSet.has(recordId(line as LineRecord))
            ? classifyDraftProcureLine(line, "preview")
            : line,
        ));
        publishDraftLines(nextLines);
      } else {
        await Promise.all(rows.map((line) => {
          const lineId = recordId(line as LineRecord);
          if (!lineId) return Promise.resolve();
          return relayMutate(
            `/api/finance/ap/invoices/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}/classify?mode=save`,
            { method: "POST" },
          );
        }));
        onRefresh?.();
      }
      setSelectedIds(new Set());
    } finally {
      setBusy(false);
    }
  }

  function exportSelection() {
    const rows = selectedLines(displayLines, selectedIds);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `line-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || (lineEntityCode && !lineEntity)) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    );
  }

  if (!lineEntityCode || !lineEntity) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Line metadata is not configured for this document.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">
            {visibleLines.length} {lineEntity.entity_name}
            {visibleLines.length !== 1 ? "s" : ""}
          </span>
          {showLineSummary && (
            <>
              <span className="font-normal text-muted-foreground">
                . {lineSummary.unallocated.toLocaleString()} unallocated
              </span>
              <span className="font-normal text-muted-foreground">
                . {lineSummary.notYetClassified.toLocaleString()} Not yet classified
              </span>
              <span className="font-normal text-muted-foreground">
                . {lineSummary.unmatched.toLocaleString()} unmatched
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              className="h-7 w-44 rounded-md border border-border/60 bg-background pl-7 pr-7 text-xs outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring/50 focus:ring-1 focus:ring-ring/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          {organizer ? (
            <LinesOrganizePalette
              entity={lineEntity}
              activeSortKey={activeSortKey}
              activeFilterKeys={activeFilterKeys}
              activeGroupKey={activeGroupKey}
              activeDensity={activeDensity}
              columnOptions={columnOptions}
              activeColumnKeys={activeColumnKeys}
              defaultColumnKeys={new Set(defaultVisibleColumnKeys)}
              onSortChange={setActiveSortKey}
              onFilterToggle={(key) =>
                setActiveFilterKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })
              }
              onFilterClear={() => setActiveFilterKeys(new Set())}
              onGroupChange={setActiveGroupKey}
              onDensityChange={setActiveDensity}
              onColumnToggle={toggleColumn}
              onColumnsReset={resetColumns}
            />
          ) : sortableFields.length > 0 ? (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border/60 bg-background">
              <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortField ?? ""}
                onChange={(event) => setSortField(event.target.value || undefined)}
                className="h-full bg-transparent px-2 text-xs outline-none"
              >
                {sortableFields.map((field) => (
                  <option key={field.name} value={field.name}>{field.label ?? field.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDirection((dir) => dir === "asc" ? "desc" : "asc")}
                className="h-full border-l border-border/60 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {sortDirection.toUpperCase()}
              </button>
            </div>
          ) : null}

          {canMutateLines && (
            showCatalogAddOption ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-0">
                  <DropdownMenuItem
                    onSelect={() => openComposer(null, "manual")}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Add Item</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-border/60" />
                  <DropdownMenuItem
                    disabled={!canUseCatalogItems}
                    onSelect={() => openComposer(null, "catalog")}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                    title={canUseCatalogItems ? undefined : "Catalog feature is disabled for this document type."}
                  >
                    <PackagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Add Catalog Item</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                onClick={() => openComposer(null, "manual")}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </button>
            )
          )}
        </div>
      </div>

      <ItemsGrid
        lines={visibleLines}
        columns={columns.map((column) => ({
          field: column.field.name,
          label: column.label,
          align: column.align,
          width: column.width,
          path: column.valuePath,
          aggregate: column.aggregate,
        }))}
        entity={lineEntity}
        currencyCode={currencyCode}
        selectedIds={canMutateLines ? selectedIds : undefined}
        selectable={canMutateLines}
        allSelected={canMutateLines ? allVisibleSelected : undefined}
        onToggleLine={canMutateLines ? toggleLine : undefined}
        onToggleAll={canMutateLines ? toggleVisible : undefined}
        onLineSelect={(line) => {
          if (canMutateLines) {
            openLineEdit(line);
            return;
          }
          openLineView(line);
        }}
      />

      {isMounted && canMutateLines && selectedIds.size > 0 && createPortal(
        <>
          {/* ── Desktop: floating pill (sm+) ───────────────────────────── */}
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 items-stretch overflow-hidden rounded-xl border border-border/70 bg-background shadow-2xl ring-1 ring-black/[0.05] hidden sm:flex">
            <span className="flex items-center px-4 text-xs font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} line{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="w-px self-stretch bg-border/50" />
            {selectedIds.size === 1 && singleSelectedLine && !draftMode && (
              <>
                <button type="button" onClick={() => openLineView(singleSelectedLine)} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                  <Eye className="h-3.5 w-3.5" />View
                </button>
                <div className="w-px self-stretch bg-border/50" />
                <button type="button" onClick={() => openLineEdit(singleSelectedLine)} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                  <Pencil className="h-3.5 w-3.5" />Edit
                </button>
                <div className="w-px self-stretch bg-border/50" />
              </>
            )}
            {selectedIds.size === 1 && singleSelectedLine && draftMode && (
              <>
                <button type="button" onClick={() => openLineEdit(singleSelectedLine)} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                  <Pencil className="h-3.5 w-3.5" />Edit
                </button>
                <div className="w-px self-stretch bg-border/50" />
              </>
            )}
            {selectedIds.size > 1 && (
              <>
                <button type="button" onClick={() => setMassEditOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                  <Pencil className="h-3.5 w-3.5" />Mass Edit
                </button>
                <div className="w-px self-stretch bg-border/50" />
              </>
            )}
            {canReclassifySelection && (
              <>
                <button type="button" onClick={() => void reclassifySelection()} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40">
                  <RefreshCw className={`h-3.5 w-3.5${busy ? " animate-spin" : ""}`} />Reclassify
                </button>
                <div className="w-px self-stretch bg-border/50" />
              </>
            )}
            <button type="button" onClick={() => void duplicateSelection()} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40">
              <Copy className="h-3.5 w-3.5" />Copy
            </button>
            <div className="w-px self-stretch bg-border/50" />
            <button type="button" onClick={() => void deleteSelection()} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </button>
            <div className="w-px self-stretch bg-border/50" />
            <button type="button" onClick={exportSelection} disabled={busy} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" />Export
            </button>
            <div className="w-px self-stretch bg-border/50" />
            <button type="button" onClick={clearSelection} aria-label="Clear selection" className="flex items-center justify-center px-3 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* ── Mobile: bottom action sheet (<sm) ──────────────────────── */}
          <div className="fixed inset-0 z-50 sm:hidden" onClick={clearSelection}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-2xl border-t border-border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-border/60" />
              </div>
              {/* Count header */}
              <div className="border-b border-border/40 px-5 py-3 text-sm font-medium text-foreground">
                {selectedIds.size} line{selectedIds.size !== 1 ? "s" : ""} selected
              </div>
              {/* Action rows */}
              <div className="divide-y divide-border/40">
                {selectedIds.size === 1 && singleSelectedLine && !draftMode && (
                  <>
                    <button type="button" onClick={() => { openLineView(singleSelectedLine); clearSelection(); }} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60">
                      <Eye className="h-4.5 w-4.5 text-muted-foreground" />View details
                    </button>
                    <button type="button" onClick={() => { openLineEdit(singleSelectedLine); clearSelection(); }} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60">
                      <Pencil className="h-4.5 w-4.5 text-muted-foreground" />Edit line
                    </button>
                  </>
                )}
                {selectedIds.size === 1 && singleSelectedLine && draftMode && (
                  <button type="button" onClick={() => { openLineEdit(singleSelectedLine); clearSelection(); }} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60">
                    <Pencil className="h-4.5 w-4.5 text-muted-foreground" />Edit line
                  </button>
                )}
                {selectedIds.size > 1 && (
                  <button type="button" onClick={() => { setMassEditOpen(true); }} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60">
                    <Pencil className="h-4.5 w-4.5 text-muted-foreground" />Mass edit {selectedIds.size} lines
                  </button>
                )}
                {canReclassifySelection && (
                  <button type="button" onClick={() => { void reclassifySelection(); }} disabled={busy} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60 disabled:opacity-40">
                    <RefreshCw className={`h-4.5 w-4.5 text-muted-foreground${busy ? " animate-spin" : ""}`} />Reclassify
                  </button>
                )}
                <button type="button" onClick={() => { void duplicateSelection(); }} disabled={busy} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60 disabled:opacity-40">
                  <Copy className="h-4.5 w-4.5 text-muted-foreground" />Copy
                </button>
                <button type="button" onClick={() => { void deleteSelection(); }} disabled={busy} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-destructive active:bg-destructive/10 disabled:opacity-40">
                  <Trash2 className="h-4.5 w-4.5" />Delete
                </button>
                <button type="button" onClick={exportSelection} disabled={busy} className="flex w-full items-center gap-3.5 px-5 py-4 text-sm font-medium text-foreground active:bg-muted/60 disabled:opacity-40">
                  <Download className="h-4.5 w-4.5 text-muted-foreground" />Export
                </button>
              </div>
              {/* Cancel */}
              <div className="px-4 pb-8 pt-2">
                <button type="button" onClick={clearSelection} className="h-12 w-full rounded-xl border border-border/60 text-sm font-medium text-muted-foreground transition-colors active:bg-muted/40">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}

      {drawerLine && lineVariant === "procure" && (
        <ProcureLineEditorSheet
          open={Boolean(drawerLine)}
          onOpenChange={(open) => { if (!open) setDrawerLine(null); }}
          line={drawerLine}
          distributions={[]}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          record={record}
          entityCode={entityCode}
          recordId={parentRecordId}
          lineEntity={lineEntity}
          lineEntityCode={lineEntityCode}
          onLineSaved={onRefresh}
          onMutated={onRefresh}
          readOnly={drawerReadOnly}
          canEdit={canMutateLines && drawerReadOnly}
          onPromoteToEdit={() => setDrawerReadOnly(false)}
          onDraftSubmit={draftMode ? handleDraftEditorSubmit : undefined}
          onDraftClassify={draftMode ? classifyAndPublishDraftLine : undefined}
          hasPreviousLine={hasPreviousDrawerLine}
          hasNextLine={hasNextDrawerLine}
          onPreviousLine={() => navigateDrawerLine(-1)}
          onNextLine={() => navigateDrawerLine(1)}
        />
      )}
      {drawerLine && lineVariant === "generic" && (
        <LineEditorSheet
          open={Boolean(drawerLine)}
          onOpenChange={(open) => { if (!open) setDrawerLine(null); }}
          line={drawerLine}
          distributions={[]}
          currencyCode={currencyCode}
          entityCode={entityCode}
          recordId={parentRecordId}
          lineEntity={lineEntity}
          lineEntityCode={lineEntityCode}
          onLineSaved={onRefresh}
          onMutated={onRefresh}
          readOnly={drawerReadOnly}
          canEdit={canMutateLines && drawerReadOnly}
          onPromoteToEdit={() => setDrawerReadOnly(false)}
        />
      )}

      {canMutateLines && lineEntity && (
        <MassEditSheet
          open={massEditOpen}
          onOpenChange={setMassEditOpen}
          lines={selectedLines(displayLines, selectedIds)}
          lineEntity={lineEntity}
          entityCode={entityCode}
          recordId={parentRecordId}
          onMutated={() => { clearSelection(); onRefresh?.(); }}
          onDraftPatch={draftMode ? applyDraftPatchToSelection : undefined}
        />
      )}

      {canMutateLines && lineVariant === "procure" && (
        <ProcureLineComposerSheet
          open={composerOpen}
          onOpenChange={(open) => { setComposerOpen(open); if (!open) setComposerLine(null); }}
          line={composerLine}
          entityCode={entityCode}
          recordId={parentRecordId}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          record={record}
          lineEntity={lineEntity}
          lineEntityCode={lineEntityCode}
          composerMode={addLineMode}
          onMutated={draftMode ? undefined : onRefresh}
          onDraftSubmit={draftMode ? handleDraftComposerSubmit : undefined}
        />
      )}
      {canMutateLines && lineVariant === "generic" && (
        <LineComposerSheet
          open={composerOpen}
          onOpenChange={(open) => { setComposerOpen(open); if (!open) setComposerLine(null); }}
          line={draftMode ? composerLine : null}
          entityCode={entityCode}
          recordId={parentRecordId}
          currencyCode={currencyCode}
          companyCodeId={companyCodeId}
          lineEntity={lineEntity}
          lineEntityCode={lineEntityCode}
          onMutated={draftMode ? undefined : onRefresh}
          onDraftSubmit={draftMode ? handleDraftComposerSubmit : undefined}
        />
      )}
    </div>
  );
}
