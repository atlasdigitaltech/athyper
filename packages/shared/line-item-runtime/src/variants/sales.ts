import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type {
  DocumentChainLink,
  FulfillmentTabConfig,
  LineAmountSummaryField,
  LineFinancialBarField,
  LineItemAmountConfig,
  LineItemSection,
  LineItemSectionType,
  LineItemTab,
  LineItemTabType,
  MetaLineColumn,
} from "../types";
import { fieldLabel } from "../meta";
import { fieldsForGroups } from "./procure";

// ─────────────────────────────────────────────────────────────────────────────
// SALES CONVENTION TABLES
// ─────────────────────────────────────────────────────────────────────────────

type SectionConvEntry = { label: string; type: LineItemSectionType; defaultOpen: boolean };

const SALES_SECTION_CONV: Record<string, SectionConvEntry> = {
  item:           { label: "PRODUCT / SERVICE",  type: "item",           defaultOpen: true  },
  product:        { label: "PRODUCT / SERVICE",  type: "item",           defaultOpen: true  },
  service:        { label: "PRODUCT / SERVICE",  type: "item",           defaultOpen: true  },
  financial:      { label: "PRICING",            type: "financial",      defaultOpen: true  },
  pricing:        { label: "PRICING",            type: "financial",      defaultOpen: true  },
  dimensions:     { label: "REVENUE SEGMENT",    type: "dimensions",     defaultOpen: false },
  allocation:     { label: "REVENUE SEGMENT",    type: "dimensions",     defaultOpen: false },
  classification: { label: "CLASSIFICATION",     type: "classification", defaultOpen: false },
  fulfillment:    { label: "FULFILLMENT",         type: "other",          defaultOpen: false },
};

type TabConvEntry = { label: string; type: LineItemTabType };

const SALES_TAB_CONV: Record<string, TabConvEntry> = {
  item:           { label: "Item",        type: "fields"              },
  product:        { label: "Item",        type: "fields"              },
  service:        { label: "Item",        type: "fields"              },
  classification: { label: "Classify",    type: "classification"      },
  financial:      { label: "Revenue",     type: "accounting"          },
  dimensions:     { label: "Revenue",     type: "accounting"          },
  allocation:     { label: "Revenue",     type: "accounting"          },
  tax:            { label: "Tax",         type: "tax"                 },
  discount:       { label: "Discount",    type: "discount"            },
  fulfillment:    { label: "Fulfillment", type: "fulfillment_links"   },
  delivery:       { label: "Fulfillment", type: "fulfillment_links"   },
  shipping:       { label: "Fulfillment", type: "fulfillment_links"   },
};

const SALES_BAR_ORDER = [
  "gross_amount",
  "line_amount",
  "discount_amount",
  "net_amount",
  "tax_amount",
  "billed_amount",
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSalesComposerSections(
  entity: CompiledEntity | null,
): LineItemSection[] {
  if (!entity) return [];

  const raw = (entity.display_config as Record<string, unknown> | null | undefined)
    ?.["sales_line"] as Record<string, unknown> | null | undefined;
  const fromMeta = raw?.["composer_sections"];
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.flatMap((item): LineItemSection[] => {
      if (!item || typeof item !== "object") return [];
      const obj  = item as Record<string, unknown>;
      const key  = String(obj["key"] ?? "");
      return key ? [{
        key,
        label:       String(obj["label"] ?? key),
        type:        (obj["type"] as LineItemSectionType | undefined) ?? "other",
        groups:      Array.isArray(obj["groups"]) ? (obj["groups"] as string[]) : [],
        fields:      Array.isArray(obj["fields"]) ? (obj["fields"] as string[]) : [],
        defaultOpen: obj["default_open"] !== false,
      }] : [];
    });
  }

  // Derive from group_keys via SALES_SECTION_CONV
  const groupKeys = new Set(
    entity.fields.filter((f) => f.group_key).map((f) => f.group_key as string),
  );

  const merged = new Map<string, { label: string; type: LineItemSectionType; open: boolean; groups: Set<string> }>();
  for (const gk of groupKeys) {
    const conv = SALES_SECTION_CONV[gk];
    if (!conv) continue;
    const existing = merged.get(conv.label);
    if (existing) {
      existing.groups.add(gk);
    } else {
      merged.set(conv.label, { label: conv.label, type: conv.type, open: conv.defaultOpen, groups: new Set([gk]) });
    }
  }

  return Array.from(merged.entries()).map(([label, entry]) => ({
    key:         label.toLowerCase().replace(/[\s/]+/g, "_"),
    label,
    type:        entry.type,
    groups:      Array.from(entry.groups),
    fields:      [],
    defaultOpen: entry.open,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR TABS
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSalesEditorTabs(entity: CompiledEntity | null): LineItemTab[] {
  if (!entity) return [];

  const raw = (entity.display_config as Record<string, unknown> | null | undefined)
    ?.["sales_line"] as Record<string, unknown> | null | undefined;
  const fromMeta = raw?.["editor_tabs"];
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.flatMap((item): LineItemTab[] => {
      if (!item || typeof item !== "object") return [];
      const obj  = item as Record<string, unknown>;
      const key  = String(obj["key"] ?? "");
      return key ? [{
        key,
        label:  String(obj["label"] ?? key),
        type:   (obj["type"] as LineItemTabType | undefined) ?? "fields",
        groups: Array.isArray(obj["groups"]) ? (obj["groups"] as string[]) : [],
        fields: Array.isArray(obj["fields"]) ? (obj["fields"] as string[]) : [],
      }] : [];
    });
  }

  const groupKeys = new Set(
    entity.fields.filter((f) => f.group_key).map((f) => f.group_key as string),
  );

  const order = Object.keys(SALES_TAB_CONV);
  const merged = new Map<string, { label: string; type: LineItemTabType; groups: Set<string> }>();
  for (const gk of order) {
    if (!groupKeys.has(gk)) continue;
    const conv = SALES_TAB_CONV[gk]!;
    const existing = merged.get(conv.label);
    if (existing) existing.groups.add(gk);
    else merged.set(conv.label, { label: conv.label, type: conv.type, groups: new Set([gk]) });
  }

  const tabs: LineItemTab[] = Array.from(merged.entries()).map(([label, entry]) => ({
    key:    label.toLowerCase().replace(/[\s/]+/g, "_"),
    label,
    type:   entry.type,
    groups: Array.from(entry.groups),
    fields: [],
  }));

  // Always add fulfillment tab for sales
  const hasFulfillment = entity.fields.some((f) =>
    ["fulfillment", "delivery", "shipping"].includes(f.group_key ?? ""),
  );
  if (hasFulfillment && !tabs.some((t) => t.type === "fulfillment_links")) {
    tabs.push({ key: "fulfillment", label: "Fulfillment", type: "fulfillment_links", groups: ["fulfillment", "delivery", "shipping"], fields: [] });
  }

  return tabs;
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSalesAmountConfig(
  entity: CompiledEntity | null,
): LineItemAmountConfig | null {
  if (!entity) return null;

  const candidates = ["gross_amount", "line_amount", "net_amount", "extended_amount", "amount"];
  const amountField = candidates.find((name) => entity.fields.some((f) => f.name === name));
  if (!amountField) return null;

  const currencyField = ["currency_code", "currency", "transaction_currency"].find(
    (name) => entity.fields.some((f) => f.name === name),
  );

  const fieldMap = new Map(entity.fields.map((f) => [f.name, f]));

  const summaryFields: LineAmountSummaryField[] = [];
  const addSummary = (name: string, label: string, sign: 1 | -1 = 1, bold = false, divider = false) => {
    if (fieldMap.has(name)) summaryFields.push({ name, label, sign, bold, divider });
  };
  addSummary("gross_amount",   "List Price",    1);
  addSummary("discount_amount", "Discount",     -1);
  addSummary("discount_pct",    "Discount %",   -1);
  addSummary("net_amount",      "Net Amount",    1, true, true);
  addSummary("tax_amount",      "Tax",           1);
  addSummary("billed_amount",   "Billed Amount", 1, true);

  const financialBar: LineFinancialBarField[] = SALES_BAR_ORDER.flatMap((name): LineFinancialBarField[] =>
    fieldMap.has(name) ? [{ name, label: fieldMap.get(name)!.label ?? name }] : [],
  );

  return {
    amountField,
    currencyField,
    summaryFields,
    financialBar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FULFILLMENT TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const FULFILLMENT_ENTITY_MAP: Record<string, DocumentChainLink> = {
  sales_order_id: {
    entityCode:   "sales_order",
    entityLabel:  "Sales Order",
    idField:      "sales_order_id",
    numberField:  "order_number",
    statusField:  "status",
  },
  delivery_id: {
    entityCode:   "delivery_note",
    entityLabel:  "Delivery Note",
    idField:      "delivery_id",
    numberField:  "delivery_number",
    statusField:  "status",
    lineCodeField: "delivery_line_id",
  },
  shipment_id: {
    entityCode:   "shipment",
    entityLabel:  "Shipment",
    idField:      "shipment_id",
    numberField:  "shipment_number",
    statusField:  "status",
  },
};

export function resolveFulfillmentTabConfig(entity: CompiledEntity | null): FulfillmentTabConfig {
  if (!entity) return { links: [], quantityField: null, showDeliveryStatus: false };

  const links: DocumentChainLink[] = [];
  for (const [fieldName, link] of Object.entries(FULFILLMENT_ENTITY_MAP)) {
    if (entity.fields.some((f) => f.name === fieldName)) {
      links.push(link);
    }
  }

  const quantityField = entity.fields.find((f) => f.name === "quantity")?.name ?? null;

  return { links, quantityField, showDeliveryStatus: links.length > 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES COLUMN CATALOG
// ─────────────────────────────────────────────────────────────────────────────

const SALES_COLUMN_CANDIDATES = [
  ["line_number"],
  ["product_id", "item_id", "item_code"],
  ["description", "item_description", "line_description"],
  ["quantity", "qty"],
  ["unit_code", "uom_code"],
  ["unit_price", "price", "rate"],
  ["gross_amount", "line_amount"],
  ["discount_pct", "discount_amount"],
  ["net_amount"],
  ["tax_amount"],
  ["billed_amount"],
  ["fulfillment_status", "delivery_status"],
  ["cost_center_id", "profit_center_id"],
];

export function buildSalesColumnCatalog(entity: CompiledEntity | null): MetaLineColumn[] {
  if (!entity) return [];
  const fieldMap = new Map(entity.fields.map((f) => [f.name, f]));
  const out: MetaLineColumn[] = [];
  const used = new Set<string>();

  for (const candidates of SALES_COLUMN_CANDIDATES) {
    for (const name of candidates) {
      if (!fieldMap.has(name) || used.has(name)) continue;
      const field = fieldMap.get(name)!;
      used.add(name);
      out.push({
        key:     name,
        label:   field.label ?? fieldLabel(field),
        field,
        numeric: ["money", "decimal", "integer", "numeric", "bigint"].includes(field.data_type),
        align:   ["money", "decimal", "integer", "numeric", "bigint"].includes(field.data_type) ? "right" : "left",
        sortable: true,
      });
      break;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeSalesDraftLine(draft: Record<string, unknown>): Record<string, unknown> {
  const next = { ...draft };

  if (next["net_amount"] == null || next["net_amount"] === "") {
    const gross    = Number(next["gross_amount"] ?? 0);
    const discount = Number(next["discount_amount"] ?? 0);
    if (gross > 0) next["net_amount"] = Math.round((gross - discount) * 100) / 100;
  }

  if (next["gross_amount"] == null || next["gross_amount"] === "") {
    const qty   = Number(next["quantity"] ?? 0);
    const price = Number(next["unit_price"] ?? 0);
    if (qty > 0 && price > 0) {
      next["gross_amount"] = Math.round(qty * price * 100) / 100;
    }
  }

  return next;
}
