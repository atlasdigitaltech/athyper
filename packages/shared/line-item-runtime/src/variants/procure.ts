import { useEffect, useState } from "react";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type {
  DocumentChainLink,
  LineAmountSummaryField,
  LineFinancialBarField,
  LineItemAmountConfig,
  LineItemSection,
  LineItemSectionType,
  LineItemTab,
  LineItemTabType,
  LineQuantityProgress,
  MatchException,
  MetaLineColumn,
  ReferenceTabConfig,
} from "../types";
import { editableLineFields, fieldLabel, formatFieldValue, recordValue } from "../meta";
import type { LineRecord } from "../types";
import { resolveSummaryStripFromMeta } from "./summary-strip";

// ─────────────────────────────────────────────────────────────────────────────
// CONVENTION TABLES
// ─────────────────────────────────────────────────────────────────────────────

type SectionConvEntry = { label: string; type: LineItemSectionType; defaultOpen: boolean };

const SECTION_CONV: Record<string, SectionConvEntry> = {
  item:           { label: "WHAT",             type: "item",           defaultOpen: true  },
  profile:        { label: "WHAT",             type: "item",           defaultOpen: true  },
  financial:      { label: "HOW MUCH",         type: "financial",      defaultOpen: true  },
  pricing:        { label: "HOW MUCH",         type: "financial",      defaultOpen: true  },
  dimensions:     { label: "WHERE IT COSTS",   type: "dimensions",     defaultOpen: false },
  allocation:     { label: "WHERE IT COSTS",   type: "dimensions",     defaultOpen: false },
  classification: { label: "CLASSIFICATION",   type: "classification", defaultOpen: false },
};

type TabConvEntry = { label: string; type: LineItemTabType };

const TAB_CONV: Record<string, TabConvEntry> = {
  item:           { label: "Item",       type: "fields"           },
  profile:        { label: "Item",       type: "fields"           },
  classification: { label: "Classify",   type: "classification"   },
  taxonomy:       { label: "Classify",   type: "classification"   },
  financial:      { label: "Accounting", type: "accounting"       },
  dimensions:     { label: "Accounting", type: "accounting"       },
  allocation:     { label: "Accounting", type: "accounting"       },
  tax:            { label: "Tax",        type: "tax"              },
  discount:       { label: "Discount",   type: "discount"         },
  charges:        { label: "Charges",    type: "charges"          },
  retention:      { label: "Retention",  type: "retention"        },
  reference:      { label: "Reference",  type: "reference_links"  },
  matching:       { label: "Reference",  type: "reference_links"  },
};

const OTHER_COST_FIELDS = [
  "tax_amount",
  "withholding_tax_amount",
  "discount_pct",
  "discount_amount",
  "retention_pct",
  "retention_amount",
];

const BAR_ORDER = [
  "net_amount",
  "line_amount",
  "discount_amount",
  "tax_amount",
  "charges_amount",
  "gross_amount",
];

// ─────────────────────────────────────────────────────────────────────────────
// fieldsForGroups — collect entity fields belonging to named groups
// ─────────────────────────────────────────────────────────────────────────────

export function fieldsForGroups(
  entity:     CompiledEntity | null,
  groupKeys:  string[],
): EntityField[] {
  if (!entity || groupKeys.length === 0) return [];
  const keys = new Set(groupKeys);
  const seen  = new Set<string>();
  const out:  EntityField[] = [];
  for (const field of entity.fields) {
    if (!field.group_key) continue;
    if (!keys.has(field.group_key)) continue;
    if (field.origin === "system" || field.is_computed || field.is_readonly) continue;
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    out.push(field);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

function resolveComposerSectionsFromMeta(entity: CompiledEntity): LineItemSection[] {
  const raw = (entity.display_config as Record<string, unknown> | null | undefined)
    ?.["procure_line"] as Record<string, unknown> | null | undefined;
  const composerSections = raw?.["composer_sections"];
  if (!Array.isArray(composerSections) || composerSections.length === 0) return [];

  return composerSections.flatMap((item): LineItemSection[] => {
    if (!item || typeof item !== "object") return [];
    const obj     = item as Record<string, unknown>;
    const key     = String(obj["key"] ?? "");
    const label   = String(obj["label"] ?? key);
    const type    = (obj["type"] as LineItemSectionType | undefined) ?? "other";
    const groups  = Array.isArray(obj["groups"]) ? (obj["groups"] as string[]) : [];
    const fields  = Array.isArray(obj["fields"]) ? (obj["fields"] as string[]) : [];
    const open    = obj["default_open"] !== false;
    return key ? [{ key, label, type, groups, fields, defaultOpen: open }] : [];
  });
}

function resolveComposerSectionsFromGroupKeys(entity: CompiledEntity): LineItemSection[] {
  const groupKeys = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  const merged = new Map<string, { label: string; type: LineItemSectionType; open: boolean; groups: Set<string> }>();

  for (const gk of groupKeys) {
    const conv = SECTION_CONV[gk];
    if (!conv) continue;
    const existing = merged.get(conv.label);
    if (existing) {
      existing.groups.add(gk);
    } else {
      merged.set(conv.label, {
        label:  conv.label,
        type:   conv.type,
        open:   conv.defaultOpen,
        groups: new Set([gk]),
      });
    }
  }

  if (merged.size === 0) return [];

  return Array.from(merged.entries()).map(([label, entry]) => ({
    key:         label.toLowerCase().replace(/\s+/g, "_"),
    label,
    type:        entry.type,
    groups:      Array.from(entry.groups),
    fields:      [],
    defaultOpen: entry.open,
  }));
}

export function resolveProcureComposerSections(
  entity: CompiledEntity | null,
): LineItemSection[] {
  if (!entity) return [];
  const fromMeta = resolveComposerSectionsFromMeta(entity);
  if (fromMeta.length > 0) return fromMeta;
  return resolveComposerSectionsFromGroupKeys(entity);
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR TABS
// ─────────────────────────────────────────────────────────────────────────────

function resolveEditorTabsFromMeta(entity: CompiledEntity): LineItemTab[] {
  const raw = (entity.display_config as Record<string, unknown> | null | undefined)
    ?.["procure_line"] as Record<string, unknown> | null | undefined;
  const editorTabs = raw?.["editor_tabs"];
  if (!Array.isArray(editorTabs) || editorTabs.length === 0) return [];

  return editorTabs.flatMap((item): LineItemTab[] => {
    if (!item || typeof item !== "object") return [];
    const obj    = item as Record<string, unknown>;
    const key    = String(obj["key"] ?? "");
    const label  = String(obj["label"] ?? key);
    const type   = (obj["type"] as LineItemTabType | undefined) ?? "fields";
    const groups = Array.isArray(obj["groups"]) ? (obj["groups"] as string[]) : [];
    const fields = Array.isArray(obj["fields"]) ? (obj["fields"] as string[]) : [];
    return key ? [{ key, label, type, groups, fields }] : [];
  });
}

function resolveEditorTabsFromGroupKeys(entity: CompiledEntity): LineItemTab[] {
  const groupKeys = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  const order = Object.keys(TAB_CONV);
  const merged = new Map<string, { label: string; type: LineItemTabType; groups: Set<string> }>();

  for (const gk of order) {
    if (!groupKeys.has(gk)) continue;
    const conv = TAB_CONV[gk]!;
    const existing = merged.get(conv.label);
    if (existing) {
      existing.groups.add(gk);
    } else {
      merged.set(conv.label, {
        label:  conv.label,
        type:   conv.type,
        groups: new Set([gk]),
      });
    }
  }

  return Array.from(merged.entries()).map(([label, entry]) => ({
    key:    label.toLowerCase().replace(/\s+/g, "_"),
    label,
    type:   entry.type,
    groups: Array.from(entry.groups),
    fields: [],
  }));
}

export function resolveProcureEditorTabs(entity: CompiledEntity | null): LineItemTab[] {
  if (!entity) return [];

  const fromMeta = resolveEditorTabsFromMeta(entity);
  if (fromMeta.length > 0) return fromMeta;

  const fromGroupKeys = resolveEditorTabsFromGroupKeys(entity);

  // Add cost tabs if entity has those field groups
  const hasTax       = entity.fields.some((f) => f.group_key === "tax");
  const hasDiscount  = entity.fields.some((f) => f.group_key === "discount");
  const hasCharges   = entity.fields.some((f) => f.group_key === "charges");
  const hasRetention = entity.fields.some((f) => f.group_key === "retention");
  const hasReference = entity.fields.some((f) =>
    f.group_key === "reference" || f.group_key === "matching",
  );

  const extra: LineItemTab[] = [];
  if (hasTax       && !fromGroupKeys.some((t) => t.type === "tax"))
    extra.push({ key: "tax",       label: "Tax",       type: "tax",             groups: ["tax"],       fields: [] });
  if (hasDiscount  && !fromGroupKeys.some((t) => t.type === "discount"))
    extra.push({ key: "discount",  label: "Discount",  type: "discount",        groups: ["discount"],  fields: [] });
  if (hasCharges   && !fromGroupKeys.some((t) => t.type === "charges"))
    extra.push({ key: "charges",   label: "Charges",   type: "charges",         groups: ["charges"],   fields: [] });
  if (hasRetention && !fromGroupKeys.some((t) => t.type === "retention"))
    extra.push({ key: "retention", label: "Retention", type: "retention",       groups: ["retention"], fields: [] });
  if (hasReference && !fromGroupKeys.some((t) => t.type === "reference_links"))
    extra.push({ key: "reference", label: "Reference", type: "reference_links", groups: ["reference"], fields: [] });

  return [...fromGroupKeys, ...extra];
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function detectAmountField(entity: CompiledEntity): string | null {
  const candidates = ["net_amount", "line_amount", "gross_amount", "amount"];
  for (const name of candidates) {
    if (entity.fields.some((f) => f.name === name)) return name;
  }
  return entity.fields.find((f) => f.data_type === "money")?.name ?? null;
}

function detectCurrencyField(entity: CompiledEntity): string | null {
  const candidates = ["currency_code", "currency", "transaction_currency"];
  for (const name of candidates) {
    if (entity.fields.some((f) => f.name === name)) return name;
  }
  return null;
}

function buildSummaryFields(entity: CompiledEntity, amountField: string): LineAmountSummaryField[] {
  const out: LineAmountSummaryField[] = [];
  const fieldMap = new Map(entity.fields.map((f) => [f.name, f]));

  const addIfPresent = (name: string, label: string, sign: 1 | -1 = 1, bold = false, divider = false) => {
    if (fieldMap.has(name)) out.push({ name, label, sign, bold, divider });
  };

  addIfPresent(amountField,      amountField === "net_amount" ? "Net Amount" : "Amount",    1);
  addIfPresent("discount_amount", "Discount",   -1);
  addIfPresent("discount_pct",    "Discount %", -1);
  addIfPresent("tax_amount",      "Tax",         1);
  addIfPresent("charges_amount",  "Charges",     1);
  if (out.length > 0) {
    addIfPresent("gross_amount",  "Gross Amount", 1, true, true);
  }
  return out;
}

function buildFinancialBar(entity: CompiledEntity): LineFinancialBarField[] {
  const fieldMap = new Map(entity.fields.map((f) => [f.name, f]));
  return BAR_ORDER.flatMap((name): LineFinancialBarField[] =>
    fieldMap.has(name) ? [{ name, label: fieldMap.get(name)!.label ?? name }] : [],
  );
}

export function resolveProcureAmountConfig(
  entity: CompiledEntity | null,
): LineItemAmountConfig | null {
  if (!entity) return null;
  const meta = resolveSummaryStripFromMeta(entity);
  const amountField = meta.amountField ?? detectAmountField(entity);
  if (!amountField) return null;
  return {
    amountField,
    currencyField:  meta.currencyField ?? detectCurrencyField(entity) ?? undefined,
    summaryFields:  meta.summaryFields ?? buildSummaryFields(entity, amountField),
    financialBar:   buildFinancialBar(entity),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM TAB CONFIG (What/Classify section fields)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcureItemTabConfig {
  primaryFields:  EntityField[];
  classifyFields: EntityField[];
  quantityRow:    EntityField[];
  assetFields:    EntityField[];
}

export function resolveProcureItemTabConfig(
  entity:    CompiledEntity | null,
  groupKeys: string[],
): ProcureItemTabConfig {
  if (!entity) return { primaryFields: [], classifyFields: [], quantityRow: [], assetFields: [] };

  const itemFields     = fieldsForGroups(entity, groupKeys.filter((k) => ["item", "profile"].includes(k)));
  const classifyFields = fieldsForGroups(entity, groupKeys.filter((k) => k === "classification"));
  const priceFields    = fieldsForGroups(entity, groupKeys.filter((k) => ["financial", "pricing"].includes(k)));

  const QTY_NAMES = ["quantity", "qty"];
  const UOM_NAMES = ["unit_code", "uom_code", "uom", "unit_of_measure"];
  const PRICE_NAMES = ["unit_price", "price", "rate", "cost", "price_unit"];

  const quantityRow = [
    ...entity.fields.filter((f) => QTY_NAMES.includes(f.name) && !f.is_readonly),
    ...entity.fields.filter((f) => UOM_NAMES.includes(f.name) && !f.is_readonly),
    ...entity.fields.filter((f) => PRICE_NAMES.includes(f.name) && !f.is_readonly),
    ...priceFields.filter((f) => f.data_type === "decimal" || f.data_type === "money"),
  ].filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i).slice(0, 4);

  const assetFields = entity.fields.filter(
    (f) => (f.name === "is_asset" || f.name === "asset_category_id") && !f.is_readonly,
  );

  return { primaryFields: itemFields, classifyFields, quantityRow, assetFields };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX TAB SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcureTaxTabSection {
  label:  string;
  fields: EntityField[];
}

export function resolveProcureTaxTabSections(entity: CompiledEntity | null): ProcureTaxTabSection[] {
  if (!entity) return [];
  const taxFields = fieldsForGroups(entity, ["tax"]);
  if (taxFields.length === 0) return [];
  return [{ label: "Tax", fields: taxFields }];
}

// ─────────────────────────────────────────────────────────────────────────────
// PCT TAB CONFIG (discount / charges / retention)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcurePctTabConfig {
  discountFields:  EntityField[];
  chargesFields:   EntityField[];
  retentionFields: EntityField[];
}

export function resolveProcurePctTabConfig(entity: CompiledEntity | null): ProcurePctTabConfig {
  if (!entity) {
    return { discountFields: [], chargesFields: [], retentionFields: [] };
  }
  return {
    discountFields:  fieldsForGroups(entity, ["discount"]),
    chargesFields:   fieldsForGroups(entity, ["charges"]),
    retentionFields: fieldsForGroups(entity, ["retention"]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE_ENTITY_MAP: Record<string, DocumentChainLink> = {
  commitment_id: {
    entityCode: "purchase_request",
    entityLabel: "Purchase Request",
    idField: "commitment_id",
    numberField: "document_number",
    statusField: "status",
  },
  purchase_order_id: {
    entityCode: "purchase_order",
    entityLabel: "Purchase Order",
    idField: "purchase_order_id",
    numberField: "po_number",
    statusField: "status",
  },
  po_id: {
    entityCode: "purchase_order",
    entityLabel: "Purchase Order",
    idField: "po_id",
    numberField: "po_number",
    statusField: "status",
  },
  goods_receipt_id: {
    entityCode: "goods_receipt",
    entityLabel: "Goods Receipt",
    idField: "goods_receipt_id",
    numberField: "gr_number",
    statusField: "status",
    lineCodeField: "gr_line_id",
  },
  service_entry_sheet_id: {
    entityCode: "service_entry_sheet",
    entityLabel: "Service Entry",
    idField: "service_entry_sheet_id",
    numberField: "ses_number",
    statusField: "status",
  },
};

export function resolveReferenceTabConfig(entity: CompiledEntity | null): ReferenceTabConfig {
  if (!entity) return { links: [], quantityField: null, amountField: null, showMatchStatus: false };

  const links: DocumentChainLink[] = [];
  for (const [fieldName, link] of Object.entries(REFERENCE_ENTITY_MAP)) {
    if (entity.fields.some((f) => f.name === fieldName)) {
      links.push(link);
    }
  }

  const quantityField = entity.fields.find((f) => f.name === "quantity")?.name ?? null;
  const amountField   = entity.fields.find((f) =>
    ["net_amount", "line_amount"].includes(f.name),
  )?.name ?? null;

  return {
    links,
    quantityField,
    amountField,
    showMatchStatus: links.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUANTITY PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

export function resolveLineQuantityProgress(
  line: LineRecord,
): LineQuantityProgress {
  const r = line as Record<string, unknown>;
  return {
    ordered:  toNumber(r["quantity"]),
    received: toNumber(r["received_quantity"] ?? r["gr_quantity"]),
    invoiced: toNumber(r["invoiced_quantity"] ?? r["billed_quantity"]),
    unitCode: r["unit_code"] ? String(r["unit_code"]) : null,
  };
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BADGE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

export function computeTabBadge(
  tab:   LineItemTab,
  line:  LineRecord,
  entity: CompiledEntity | null,
): string | number | undefined {
  if (!entity) return undefined;
  if (tab.type === "accounting") {
    const distCount = toNumber(
      (line as Record<string, unknown>)["distribution_count"] ??
      (line as Record<string, unknown>)["distributions_count"],
    );
    return distCount && distCount > 0 ? distCount : undefined;
  }
  if (tab.type === "reference_links") {
    const matchStatus = (line as Record<string, unknown>)["match_status"];
    return matchStatus === "exception" ? "!" : undefined;
  }
  const tabFields = fieldsForGroups(entity, tab.groups);
  const filled    = tabFields.filter((f) => {
    const val = recordValue(line, f);
    return val != null && val !== "" && val !== false;
  }).length;
  return filled > 0 ? filled : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID SUMMARY (unallocated / unmatched / unclassified)
// ─────────────────────────────────────────────────────────────────────────────

export function resolveProcureGridSummary(
  lines:        LineRecord[],
): { label: string; count: number; intent: "warning" | "info" | "error" }[] | null {
  if (lines.length === 0) return null;
  const items: { label: string; count: number; intent: "warning" | "info" | "error" }[] = [];

  const unallocated = lines.filter((l) => {
    const alloc = (l as Record<string, unknown>)["is_allocated"] ??
                  (l as Record<string, unknown>)["allocation_status"];
    return !alloc || alloc === "none" || alloc === false;
  }).length;
  if (unallocated > 0) items.push({ label: "unallocated", count: unallocated, intent: "warning" });

  const unclassified = lines.filter((l) => {
    const cs = (l as Record<string, unknown>)["classification_status"];
    return !cs || cs === "unclassified" || cs === "pending";
  }).length;
  if (unclassified > 0) items.push({ label: "not yet classified", count: unclassified, intent: "info" });

  const exceptions = lines.filter((l) => {
    const ms = (l as Record<string, unknown>)["match_status"];
    return ms === "exception";
  }).length;
  if (exceptions > 0) items.push({ label: "match exceptions", count: exceptions, intent: "error" });

  return items.length > 0 ? items : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

type DistributionsResponse = { data?: unknown[] };

export function useProcureLineDistributions(
  entityCode:     string,
  parentRecordId: string,
  lineId:         string,
  enabled:        boolean,
): { distributions: Record<string, unknown>[]; loading: boolean } {
  const [distributions, setDistributions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    if (!enabled || !lineId) { setDistributions([]); return; }
    let cancelled = false;
    setLoading(true);
    void fetch(
      `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}/distributions`,
    )
      .then((r) => r.ok ? r.json() as Promise<DistributionsResponse> : null)
      .then((body) => {
        if (!cancelled) {
          setDistributions((body?.data ?? []) as Record<string, unknown>[]);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, entityCode, parentRecordId, lineId]);

  return { distributions, loading };
}

type ReferencedRecordResponse = { data?: Record<string, unknown> };

export function useReferencedRecord(
  entityCode: string | null | undefined,
  id:         string | null | undefined,
  enabled:    boolean,
): { record: Record<string, unknown> | null; loading: boolean } {
  const [record, setRecord]   = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !id || !entityCode) { setRecord(null); return; }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}`)
      .then((r) => r.ok ? r.json() as Promise<ReferencedRecordResponse> : null)
      .then((body) => {
        if (!cancelled) { setRecord(body?.data ?? null); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, entityCode, id]);

  return { record, loading };
}

export function useMatchExceptions(
  entityCode:     string,
  parentRecordId: string,
  lineId:         string,
  enabled:        boolean,
): { exceptions: MatchException[]; loading: boolean } {
  const [exceptions, setExceptions] = useState<MatchException[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!enabled || !lineId) { setExceptions([]); return; }
    let cancelled = false;
    setLoading(true);
    void fetch(
      `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}/match-exceptions`,
    )
      .then((r) => r.ok ? r.json() as Promise<{ data?: MatchException[] }> : null)
      .then((body) => { if (!cancelled) { setExceptions(body?.data ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setExceptions([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [enabled, entityCode, parentRecordId, lineId]);

  return { exceptions, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT LINE NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string> = {
  qty:       "quantity",
  uom_code:  "unit_code",
  price:     "unit_price",
  rate:      "unit_price",
  amount:    "net_amount",
};

export function normalizeProcureDraftLine(
  draft:  Record<string, unknown>,
  entity: CompiledEntity | null,
): Record<string, unknown> {
  let next = { ...draft };

  // Resolve aliases
  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    if (next[alias] !== undefined && next[canonical] === undefined) {
      next[canonical] = next[alias];
    }
  }

  // Compute net_amount from qty * unit_price when not set
  if (next["net_amount"] == null || next["net_amount"] === "") {
    const qty   = Number(next["quantity"] ?? 0);
    const price = Number(next["unit_price"] ?? 0);
    const pu    = Number(next["price_unit"] ?? 1);
    if (qty > 0 && price > 0 && pu > 0) {
      next["net_amount"] = Math.round(((qty * price) / pu) * 100) / 100;
    }
  }

  // Compute gross_amount
  if (next["gross_amount"] == null) {
    const base     = Number(next["net_amount"] ?? 0);
    const discount = Number(next["discount_amount"] ?? 0);
    const tax      = Number(next["tax_amount"] ?? 0);
    const charges  = Number(next["charges_amount"] ?? 0);
    next["gross_amount"] = Math.round((base - discount + tax + charges) * 100) / 100;
  }

  return next;
}
