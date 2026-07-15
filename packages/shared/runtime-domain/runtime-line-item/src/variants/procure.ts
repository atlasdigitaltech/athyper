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
import { editableLineFields, fieldLabel, formatFieldValue, isEditableLineField, recordValue } from "../meta";
import type { LineRecord } from "../types";
import { resolveSummaryStripFromMeta } from "./summary-strip";

// ─────────────────────────────────────────────────────────────────────────────
// UI-INTENT MAP (P5)
// ─────────────────────────────────────────────────────────────────────────────
// Groups carry a `ui_intent` marker set in control.field_group.ui_intent.
// This map turns intents into presentational choices; the previous
// SECTION_CONV / TAB_CONV lookups keyed on hand-picked group codes were
// brittle (adding a new group code that means "amounts" required a code
// change here). Adding a new intent requires: (a) DDL CHECK, (b) this map,
// (c) seeded groups.

type SectionConvEntry = { label: string; type: LineItemSectionType; defaultOpen: boolean };
type TabConvEntry     = { label: string; type: LineItemTabType };

const INTENT_TO_SECTION: Record<string, SectionConvEntry> = {
  what:            { label: "WHAT",             type: "item",           defaultOpen: true  },
  how_much:        { label: "HOW MUCH",         type: "financial",      defaultOpen: true  },
  where_it_costs:  { label: "WHERE IT COSTS",   type: "dimensions",     defaultOpen: false },
  classify:        { label: "CLASSIFICATION",   type: "classification", defaultOpen: false },
};

const INTENT_TO_TAB: Record<string, TabConvEntry> = {
  what:            { label: "Item",       type: "fields"           },
  classify:        { label: "Classify",   type: "classification"   },
  how_much:        { label: "Accounting", type: "accounting"       },
  where_it_costs:  { label: "Accounting", type: "accounting"       },
  accounting:      { label: "Accounting", type: "accounting"       },
  tax:             { label: "Tax",        type: "tax"              },
  delivery:        { label: "Delivery",   type: "delivery"         },
  budget:          { label: "Budget",     type: "budget"           },
  discount:        { label: "Discount",   type: "discount"         },
  charges:         { label: "Charges",    type: "charges"          },
  retention:       { label: "Retention",  type: "retention"        },
  reference_links: { label: "Reference",  type: "reference_links"  },
};

const TAB_TYPE_PRIORITY: Partial<Record<LineItemTabType, number>> = {
  fields:          1,
  classification: 2,
  delivery:       3,
  tax:            4,
  accounting:     5,
  budget:         6,
  discount:       7,
  charges:        8,
  retention:      9,
  reference_links: 10,
};

function sortProcureTabs(tabs: LineItemTab[]): LineItemTab[] {
  return [...tabs].sort((a, b) =>
    (TAB_TYPE_PRIORITY[a.type] ?? 99) - (TAB_TYPE_PRIORITY[b.type] ?? 99),
  );
}

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
  // Build a group_key → ui_intent map from the entity's compiled field_groups.
  // Field_groups without ui_intent are ignored — they need a seeded intent to
  // participate in the composer.
  const intentByGroup = new Map<string, string>();
  for (const g of entity.field_groups) {
    if (g.ui_intent) intentByGroup.set(g.group_key, g.ui_intent);
  }

  const activeGroups = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  const merged = new Map<string, { label: string; type: LineItemSectionType; open: boolean; groups: Set<string> }>();

  for (const gk of activeGroups) {
    const intent = intentByGroup.get(gk);
    if (!intent) continue;
    const conv = INTENT_TO_SECTION[intent];
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
  // group_key → ui_intent from compiled field_groups. Preserve the visual
  // ordering used before: iterate intents in a deterministic priority order
  // so tabs stack predictably (Item, Classify, Delivery, Tax, ...).
  const intentByGroup = new Map<string, string>();
  for (const g of entity.field_groups) {
    if (g.ui_intent) intentByGroup.set(g.group_key, g.ui_intent);
  }

  const activeGroups = new Set(
    entity.fields
      .filter((f) => f.group_key && f.origin !== "system")
      .map((f) => f.group_key as string),
  );

  const intentPriority = [
    "what","classify","delivery","tax","how_much","where_it_costs","accounting",
    "budget","discount","charges","retention","reference_links",
  ];

  const merged = new Map<string, { label: string; type: LineItemTabType; groups: Set<string>; priority: number }>();

  for (const gk of activeGroups) {
    const intent = intentByGroup.get(gk);
    if (!intent) continue;
    const conv = INTENT_TO_TAB[intent];
    if (!conv) continue;
    const priority = intentPriority.indexOf(intent);
    const existing = merged.get(conv.label);
    if (existing) {
      existing.groups.add(gk);
      if (priority < existing.priority) existing.priority = priority;
    } else {
      merged.set(conv.label, {
        label:    conv.label,
        type:     conv.type,
        groups:   new Set([gk]),
        priority: priority === -1 ? 99 : priority,
      });
    }
  }

  return Array.from(merged.entries())
    .sort(([, a], [, b]) => a.priority - b.priority)
    .map(([label, entry]) => ({
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
  if (fromMeta.length > 0) return sortProcureTabs(fromMeta);

  const fromGroupKeys = resolveEditorTabsFromGroupKeys(entity);

  // Add cost tabs if entity has those field groups
  const hasTax       = entity.fields.some((f) => f.group_key === "tax");
  const hasDelivery  = entity.fields.some((f) =>
    [
      "delivery_fulfillment",
      "delivery_supplier_source",
      "delivery_addresses",
      "dates",
      "logistics",
      "addresses",
      "parties",
    ].includes(f.group_key ?? "") ||
    [
      "required_by_date",
      "site_id",
      "warehouse_id",
      "storage_location",
      "shipto_address_id",
      "billto_address_id",
      "billfrom_address_id",
      "supplier_id",
      "shipfrom_address_id",
      "remitto_address_id",
    ].includes(f.name),
  );
  const hasBudget    = entity.fields.some((f) =>
    ["budget_profile_id", "budget_allocation_id", "budget_check_result", "encumbrance_je_id"].includes(f.name),
  );
  const hasDiscount  = entity.fields.some((f) => f.group_key === "discount");
  const hasCharges   = entity.fields.some((f) => f.group_key === "charges");
  const hasRetention = entity.fields.some((f) => f.group_key === "retention");
  const hasReference = entity.fields.some((f) =>
    f.group_key === "reference" || f.group_key === "matching",
  );

  const extra: LineItemTab[] = [];
  if (hasDelivery  && !fromGroupKeys.some((t) => t.type === "delivery"))
    extra.push({
      key: "delivery",
      label: "Delivery",
      type: "delivery",
      groups: [
        "delivery_fulfillment",
        "delivery_supplier_source",
        "delivery_addresses",
        "dates",
        "logistics",
        "addresses",
        "parties",
      ],
      fields: [],
    });
  if (hasTax       && !fromGroupKeys.some((t) => t.type === "tax"))
    extra.push({ key: "tax",       label: "Tax",       type: "tax",             groups: ["tax"],       fields: [] });
  if (hasBudget    && !fromGroupKeys.some((t) => t.type === "budget"))
    extra.push({ key: "budget",    label: "Budget",    type: "budget",          groups: ["budget", "accounting"], fields: [] });
  if (hasDiscount  && !fromGroupKeys.some((t) => t.type === "discount"))
    extra.push({ key: "discount",  label: "Discount",  type: "discount",        groups: ["discount"],  fields: [] });
  if (hasCharges   && !fromGroupKeys.some((t) => t.type === "charges"))
    extra.push({ key: "charges",   label: "Charges",   type: "charges",         groups: ["charges"],   fields: [] });
  if (hasRetention && !fromGroupKeys.some((t) => t.type === "retention"))
    extra.push({ key: "retention", label: "Retention", type: "retention",       groups: ["retention"], fields: [] });
  if (hasReference && !fromGroupKeys.some((t) => t.type === "reference_links"))
    extra.push({ key: "reference", label: "Reference", type: "reference_links", groups: ["reference"], fields: [] });

  return sortProcureTabs([...fromGroupKeys, ...extra]);
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// P5 — prefer explicit primary-field markers seeded on control.entity_field.
// Fall back to the previous heuristic candidate lists for entities that
// haven't been re-seeded yet, so the client keeps working during the
// rollout window.
function detectAmountField(entity: CompiledEntity): string | null {
  const marked = entity.fields.find((f) => f.is_primary_amount);
  if (marked) return marked.name;
  const candidates = ["net_amount", "line_amount", "gross_amount", "amount"];
  for (const name of candidates) {
    if (entity.fields.some((f) => f.name === name)) return name;
  }
  return entity.fields.find((f) => f.data_type === "money")?.name ?? null;
}

function detectCurrencyField(entity: CompiledEntity): string | null {
  const marked = entity.fields.find((f) => f.is_primary_currency);
  if (marked) return marked.name;
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

  const itemFields     = fieldsForGroups(entity, groupKeys.filter((k) => ["item", "profile"].includes(k))).filter((field) => isEditableLineField(field));
  const classifyFields = fieldsForGroups(entity, groupKeys.filter((k) => k === "classification")).filter((field) => isEditableLineField(field));
  const priceFields    = fieldsForGroups(entity, groupKeys.filter((k) => ["financial", "pricing"].includes(k))).filter((field) => isEditableLineField(field));

  const QTY_NAMES = ["quantity", "qty"];
  const UOM_NAMES = ["unit_code", "uom_code", "uom", "unit_of_measure"];
  const PRICE_NAMES = ["unit_price", "price", "rate", "cost"];
  const PRICE_UNIT_NAMES = ["price_unit", "price_per"];

  const quantityRow = [
    ...entity.fields.filter((f) => UOM_NAMES.includes(f.name) && isEditableLineField(f)),
    ...entity.fields.filter((f) => QTY_NAMES.includes(f.name) && isEditableLineField(f)),
    ...entity.fields.filter((f) => PRICE_NAMES.includes(f.name) && isEditableLineField(f)),
    ...entity.fields.filter((f) => PRICE_UNIT_NAMES.includes(f.name) && isEditableLineField(f)),
    ...priceFields.filter((f) => f.data_type === "decimal" || f.data_type === "money"),
  ].filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i).slice(0, 4);

  const assetFields = entity.fields.filter(
    (f) => f.name === "asset_class_id" && isEditableLineField(f),
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
    numberField: "code",
    statusField: "status",
  },
  po_id: {
    entityCode: "purchase_order",
    entityLabel: "Purchase Order",
    idField: "po_id",
    numberField: "code",
    statusField: "status",
  },
  receipt_id: {
    entityCode: "receipt",
    entityLabel: "Receipt",
    idField: "receipt_id",
    numberField: "receipt_number",
    statusField: "status",
    lineCodeField: "receipt_line_id",
  },
  service_sheet_id: {
    entityCode: "service_sheet",
    entityLabel: "Service Sheet",
    idField: "service_sheet_id",
    numberField: "service_sheet_number",
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
