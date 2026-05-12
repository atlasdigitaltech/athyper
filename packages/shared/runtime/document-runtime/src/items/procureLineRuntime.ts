"use client";

/**
 * procureLineRuntime — META-DRIVEN layout resolution for procurement line sheets.
 *
 * Two-layer resolution for every layout decision:
 *   Layer 1 — display_config.procure_line  (explicit per-entity seed, wins)
 *   Layer 2 — group_key conventions        (zero-seed fallback)
 *
 * Components must not hardcode field names, group keys, or tab labels.
 * Everything flows from CompiledEntity or from display_config.procure_line.
 */

import { useCallback, useEffect, useState } from "react";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { asRecord, textValue } from "./metaLineRuntime";

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads display_config to decide which sheet variant to render.
 * Implicit opt-in: presence of display_config.procure_line block is enough.
 * Explicit opt-in: display_config.line_ui_variant === "procure".
 */
export function resolveLineSheetVariant(
  entity: CompiledEntity | null | undefined,
): "procure" | "generic" {
  const dc = asRecord(entity?.display_config);
  if (textValue(dc?.["line_ui_variant"]) === "procure") return "procure";
  if (asRecord(dc?.["procure_line"])) return "procure";
  return "generic";
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ProcureSectionType = "fields" | "classification";
export type ProcureTabType     = "fields" | "classification" | "distributions" | "reference_links" | "charges";

export interface ProcureComposerSection {
  key:         string;
  label:       string;
  type:        ProcureSectionType;
  groups:      string[];   // group_keys whose editable fields go here
  fields:      string[];   // optional explicit field names, ordered as configured
  defaultOpen: boolean;
}

export interface ProcureEditorTab {
  key:    string;
  label:  string;
  type:   ProcureTabType;
  groups: string[];
}

export interface QuantityProgress {
  ordered?:   string;  // field name on the referenced record
  received?:  string;
  accepted?:  string;
  invoiced?:  string;
  remaining?: string;
  rejected?:  string;
}

export interface ReferenceLink {
  idField:           string;  // field name on the invoice line holding the FK value
  label:             string;
  targetEntity:      string;
  quantityProgress?: QuantityProgress;
  parentNav?: {
    entity:      string;
    idField:     string;  // FK on the line entity pointing to the parent doc
    labelField:  string;  // field on the parent record to use as the doc number label
  };
}

export interface ReferenceTabConfig {
  matchStatusField: string;
  hasExceptions:    boolean;
  links:            ReferenceLink[];
}

export interface ProcureAmountSummaryField {
  name:  string;
  label: string;
}

export interface ProcureFinancialBarField {
  name:  string;
  label: string;
}

export interface ProcureAmountConfig {
  amountField:    string;
  currencyField?: string;
  /** Read-only money fields rendered as display-only in the editor (is_readonly / is_computed). */
  summaryFields:  ProcureAmountSummaryField[];
  /**
   * Ordered list of money fields for the bottom-bar financial summary.
   * Zero values are suppressed at render time.
   * Convention order: net → discount → tax → charges → gross.
   */
  financialBar:   ProcureFinancialBarField[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENTION TABLES  (group_key → section / tab mapping)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionConv { label: string; order: number; type?: ProcureSectionType; defaultOpen?: boolean }
interface TabConv     { label: string; order: number; type?: ProcureTabType }

const SECTION_CONV: Record<string, SectionConv> = {
  profile:        { label: "WHAT",           order: 1, defaultOpen: true  },
  item:           { label: "WHAT",           order: 1, defaultOpen: true  },
  financial:      { label: "HOW MUCH",       order: 2                     },
  pricing:        { label: "HOW MUCH",       order: 2                     },
  dimensions:     { label: "WHERE IT COSTS", order: 3                     },
  allocation:     { label: "WHERE IT COSTS", order: 3                     },
  classification: { label: "CLASSIFICATION", order: 4, type: "classification" },
};

const TAB_CONV: Record<string, TabConv> = {
  profile:        { label: "Item",       order: 1              },
  item:           { label: "Item",       order: 1              },
  financial:      { label: "Item",       order: 1              },
  pricing:        { label: "Item",       order: 1              },
  classification: { label: "Classify",   order: 2              },
  dimensions:     { label: "Accounting", order: 3              },
  accounting:     { label: "Accounting", order: 3, type: "distributions" },
  tax:            { label: "Tax",        order: 4              },
  discount:       { label: "Discount",   order: 5              },
  charges:        { label: "Charges",    order: 6              },
  retention:      { label: "Retention",  order: 7              },
  matching:       { label: "Reference",  order: 8, type: "reference_links" },
  reference:      { label: "Reference",  order: 8, type: "reference_links" },
};

const OTHER_COST_COMPOSER_FIELDS = [
  "tax_amount",
  "withholding_tax_amount",
  "discount_pct",
  "discount_amount",
  "retention_pct",
  "retention_amount",
];

// ─────────────────────────────────────────────────────────────────────────────
// display_config.procure_line accessor
// ─────────────────────────────────────────────────────────────────────────────

function procureCfg(entity: CompiledEntity | null | undefined): Record<string, unknown> | null {
  return asRecord(asRecord(entity?.display_config)?.["procure_line"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

function sectionsFromExplicitConfig(
  raw: unknown,
  entity: CompiledEntity,
): ProcureComposerSection[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const knownGroups = new Set(entity.field_groups.map((g) => g.group_key));
  const out: ProcureComposerSection[] = [];

  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) continue;
    const key   = textValue(item["key"]);
    const label = textValue(item["label"]);
    if (!key || !label) continue;

    const rawGroups = Array.isArray(item["groups"])
      ? (item["groups"] as unknown[]).flatMap((g) => typeof g === "string" ? [g] : [])
      : [];
    const rawFields = Array.isArray(item["fields"])
      ? (item["fields"] as unknown[]).flatMap((f) => typeof f === "string" ? [f] : [])
      : [];
    const type = (textValue(item["type"]) as ProcureSectionType | undefined) ?? "fields";
    const knownFields = new Set(entity.fields.map((f) => f.name));

    out.push({
      key,
      label,
      type,
      groups:      rawGroups.filter((g) => knownGroups.has(g) || type === "classification"),
      fields:      rawFields.filter((f) => knownFields.has(f)),
      defaultOpen: item["default_open"] === true || out.length === 0,
    });
  }
  return out.length > 0 ? withOtherCostComposerSection(out, entity) : null;
}

function withOtherCostComposerSection(
  sections: ProcureComposerSection[],
  entity:   CompiledEntity,
): ProcureComposerSection[] {
  const hasOtherCost = sections.some((section) =>
    section.key === "other_cost" ||
    section.label.trim().toLowerCase() === "other cost"
  );
  if (hasOtherCost) return sections;

  const entityFieldNames = new Set(entity.fields.map((field) => field.name));
  const fields = OTHER_COST_COMPOSER_FIELDS.filter((name) => entityFieldNames.has(name));
  if (fields.length === 0) return sections;

  const otherCost: ProcureComposerSection = {
    key:         "other_cost",
    label:       "Other Cost",
    type:        "fields",
    groups:      [],
    fields,
    defaultOpen: false,
  };

  const classificationIndex = sections.findIndex((section) =>
    section.key === "classification" ||
    section.type === "classification" ||
    section.groups.includes("classification")
  );

  if (classificationIndex < 0) return [...sections, otherCost];
  return [
    ...sections.slice(0, classificationIndex + 1),
    otherCost,
    ...sections.slice(classificationIndex + 1),
  ];
}

function sectionsFromConvention(entity: CompiledEntity): ProcureComposerSection[] {
  const map   = new Map<string, ProcureComposerSection>();
  const used  = new Set<string>();

  for (const group of [...entity.field_groups].sort((a, b) => a.sort_order - b.sort_order)) {
    const conv = SECTION_CONV[group.group_key];
    if (!conv) continue;
    const sKey = conv.label.toLowerCase().replace(/\s+/g, "_");
    const existing = map.get(sKey);
    if (existing) {
      existing.groups.push(group.group_key);
    } else {
      map.set(sKey, {
        key:         sKey,
        label:       conv.label,
        type:        conv.type ?? "fields",
        groups:      [group.group_key],
        fields:      [],
        defaultOpen: conv.defaultOpen ?? false,
      });
    }
    used.add(group.group_key);
  }

  // Unclaimed groups surface as their own labelled sections
  for (const group of entity.field_groups) {
    if (used.has(group.group_key)) continue;
    map.set(group.group_key, {
      key:         group.group_key,
      label:       group.label.toUpperCase(),
      type:        "fields",
      groups:      [group.group_key],
      fields:      [],
      defaultOpen: false,
    });
  }

  return [...map.values()].sort((a, b) => {
    const ao = SECTION_CONV[a.groups[0] ?? ""]?.order ?? 99;
    const bo = SECTION_CONV[b.groups[0] ?? ""]?.order ?? 99;
    return ao - bo;
  });
}

export function resolveProcureComposerSections(
  entity: CompiledEntity | null | undefined,
): ProcureComposerSection[] {
  if (!entity) return [];
  const cfg = procureCfg(entity);
  if (cfg) {
    const explicit = sectionsFromExplicitConfig(cfg["composer_sections"], entity);
    if (explicit) return explicit;
  }
  return sectionsFromConvention(entity);
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR TABS
// ─────────────────────────────────────────────────────────────────────────────

function tabsFromExplicitConfig(
  raw: unknown,
  entity: CompiledEntity,
): ProcureEditorTab[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const knownGroups = new Set(entity.field_groups.map((g) => g.group_key));
  const out: ProcureEditorTab[] = [];

  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) continue;
    const key   = textValue(item["key"]);
    const label = textValue(item["label"]);
    if (!key || !label) continue;

    const rawGroups = Array.isArray(item["groups"])
      ? (item["groups"] as unknown[]).flatMap((g) => typeof g === "string" ? [g] : [])
      : [];
    const type = (textValue(item["type"]) as ProcureTabType | undefined) ?? "fields";
    // reference_links and distributions tabs may reference groups not in entity (that's OK)
    const groups = type === "fields" || type === "classification"
      ? rawGroups.filter((g) => knownGroups.has(g))
      : rawGroups;

    out.push({ key, label, type, groups });
  }
  return out.length > 0 ? out : null;
}

function tabsFromConvention(entity: CompiledEntity): ProcureEditorTab[] {
  const map  = new Map<string, ProcureEditorTab>();
  const used = new Set<string>();

  for (const group of [...entity.field_groups].sort((a, b) => a.sort_order - b.sort_order)) {
    const conv = TAB_CONV[group.group_key];
    if (!conv) continue;
    const tKey = conv.label.toLowerCase();
    const existing = map.get(tKey);
    if (existing) {
      existing.groups.push(group.group_key);
    } else {
      map.set(tKey, {
        key:    tKey,
        label:  conv.label,
        type:   conv.type ?? "fields",
        groups: [group.group_key],
      });
    }
    used.add(group.group_key);
  }

  // Unclaimed groups → "Other" tab
  const other = entity.field_groups
    .filter((g) => !used.has(g.group_key))
    .map((g) => g.group_key);
  if (other.length > 0) {
    map.set("other", { key: "other", label: "Other", type: "fields", groups: other });
  }

  return [...map.values()].sort((a, b) => {
    const ao = TAB_CONV[a.groups[0] ?? ""]?.order ?? 99;
    const bo = TAB_CONV[b.groups[0] ?? ""]?.order ?? 99;
    return ao - bo;
  });
}

export function resolveProcureEditorTabs(
  entity: CompiledEntity | null | undefined,
): ProcureEditorTab[] {
  if (!entity) return [];
  const cfg = procureCfg(entity);
  if (cfg) {
    const explicit = tabsFromExplicitConfig(cfg["editor_tabs"], entity);
    if (explicit) return explicit;
  }
  return tabsFromConvention(entity);
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function parseOneLink(raw: unknown): ReferenceLink | null {
  const item = asRecord(raw);
  if (!item) return null;
  const idField      = textValue(item["id_field"]);
  const label        = textValue(item["label"]);
  const targetEntity = textValue(item["entity"]);
  if (!idField || !label || !targetEntity) return null;

  const qp = asRecord(item["quantity_progress"]);
  const quantityProgress: QuantityProgress | undefined = qp ? {
    ordered:   textValue(qp["ordered"]),
    received:  textValue(qp["received"]),
    accepted:  textValue(qp["accepted"]),
    invoiced:  textValue(qp["invoiced"]),
    remaining: textValue(qp["remaining"]),
    rejected:  textValue(qp["rejected"]),
  } : undefined;

  const nav = asRecord(item["parent_nav"]);
  const parentNav = nav ? {
    entity:     textValue(nav["entity"]) ?? targetEntity,
    idField:    textValue(nav["id_field"]) ?? "id",
    labelField: textValue(nav["label_field"]) ?? "document_number",
  } : undefined;

  return { idField, label, targetEntity, quantityProgress, parentNav };
}

export function resolveReferenceTabConfig(
  entity: CompiledEntity | null | undefined,
): ReferenceTabConfig | null {
  const cfg = procureCfg(entity);
  if (!cfg) return autoDetectReferenceConfig(entity);

  const raw = asRecord(cfg["reference_tab"]);
  if (!raw) return autoDetectReferenceConfig(entity);

  const links = Array.isArray(raw["links"])
    ? (raw["links"] as unknown[]).flatMap((l): ReferenceLink[] => {
        const link = parseOneLink(l);
        return link ? [link] : [];
      })
    : [];

  return {
    matchStatusField: textValue(raw["match_status_field"]) ?? "match_status",
    hasExceptions:    raw["has_exceptions"] !== false,
    links:            links.length > 0 ? links : (autoDetectReferenceConfig(entity)?.links ?? []),
  };
}

function autoDetectReferenceConfig(
  entity: CompiledEntity | null | undefined,
): ReferenceTabConfig | null {
  if (!entity) return null;
  const refGroupKeys = new Set(["matching", "reference"]);
  const links: ReferenceLink[] = entity.fields
    .filter((f) => refGroupKeys.has(f.group_key ?? "") && f.reference_config?.target_entity)
    .map((f): ReferenceLink => ({
      idField:      f.name,
      label:        f.label ?? f.name,
      targetEntity: f.reference_config!.target_entity,
    }));

  if (links.length === 0) return null;
  return { matchStatusField: "match_status", hasExceptions: true, links };
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export function resolveProcureAmountConfig(
  entity: CompiledEntity | null | undefined,
): ProcureAmountConfig | null {
  const cfg = procureCfg(entity);
  let amountField: string | undefined;
  let currencyField: string | undefined;
  const isAmountDataType = (f: EntityField) =>
    f.data_type === "money" || f.data_type === "decimal" || f.data_type === "numeric";

  if (cfg) {
    const af = textValue(cfg["amount_field"]);
    if (af) {
      amountField   = af;
      currencyField = textValue(cfg["currency_field"]) ?? undefined;
    }
  }
  if (!amountField) {
    // Convention: first amount-like field named net_amount / gross_amount / line_amount
    amountField = entity?.fields.find(
      (f) => isAmountDataType(f) && ["net_amount", "gross_amount", "line_amount"].includes(f.name),
    )?.name;
  }
  if (!amountField) return null;

  // Collect read-only / computed money fields to surface as display-only in the editor.
  const summaryFields: ProcureAmountSummaryField[] = (entity?.fields ?? [])
    .filter(
      (f) =>
        isAmountDataType(f) &&
        (f.is_readonly || f.is_computed) &&
        f.name !== amountField,
    )
    .map((f) => ({
      name:  f.name,
      label: f.label ?? f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));

  // Always include net_amount / gross_amount if present and not already the amountField,
  // even without is_readonly — these are inherently display values on a line.
  const ALWAYS_SUMMARY = ["net_amount", "gross_amount"];
  for (const name of ALWAYS_SUMMARY) {
    if (name !== amountField && !summaryFields.find((s) => s.name === name)) {
      const f = entity?.fields.find((fld) => fld.name === name);
      if (f) {
        summaryFields.push({
          name,
          label: f.label ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        });
      }
    }
  }

  // Financial bar: ordered money fields for the bottom-bar summary.
  // Ordered by convention: net → discount → tax → charges → gross.
  const BAR_ORDER: Array<{ key: string; label: string }> = [
    { key: "net_amount",      label: "Net"      },
    { key: "discount_amount", label: "Discount" },
    { key: "tax_amount",      label: "Tax"      },
    { key: "charges_amount",  label: "Charges"  },
    { key: "charge_amount",   label: "Charges"  },
    { key: "gross_amount",    label: "Gross"    },
  ];
  const seen = new Set<string>();
  const financialBar: ProcureFinancialBarField[] = [];
  for (const { key, label } of BAR_ORDER) {
    if (seen.has(key)) continue;
    const f = entity?.fields.find((fld) => fld.name === key);
    if (f) {
      seen.add(key);
      financialBar.push({
        name:  f.name,
        label: f.label ?? label,
      });
    }
  }

  return { amountField, currencyField, summaryFields, financialBar };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB BADGE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_STATUS_BADGE: Record<string, string> = {
  fully_matched:     "✓",
  partially_matched: "~",
  match_exception:   "!",
};

function fmtPct(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : null;
}

export function computeTabBadge(
  tab:    ProcureEditorTab,
  line:   Record<string, unknown>,
  entity: CompiledEntity | null | undefined,
): string | null {
  if (tab.type === "classification") {
    const sf = entity?.fields.find(
      (f) => tab.groups.includes(f.group_key ?? "") && f.name.endsWith("_status"),
    );
    return sf ? (MATCH_STATUS_BADGE[String(line[sf.name] ?? "")] ?? null) : null;
  }
  if (tab.type === "reference_links") {
    return MATCH_STATUS_BADGE[String(line["match_status"] ?? "")] ?? null;
  }
  // Pct-based badges: find a field whose name matches a known pattern in this tab
  const PCT_PATTERNS: Record<string, RegExp> = {
    tax:       /tax.*(pct|rate)/,
    discount:  /discount.*(pct|rate)/,
    retention: /retention.*(pct|rate)/,
  };
  const pattern = PCT_PATTERNS[tab.key];
  if (pattern) {
    const f = entity?.fields.find(
      (field) => tab.groups.includes(field.group_key ?? "") && pattern.test(field.name),
    );
    return f ? fmtPct(line[f.name]) : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD RESOLUTION FOR A SET OF GROUP KEYS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns editable fields that belong to any of the supplied group_keys,
 * ordered by field_group.sort_order then field.sort_order.
 */
export function fieldsForGroups(
  entity:      CompiledEntity | null | undefined,
  groupKeys:   string[],
  editableOnly = true,
): EntityField[] {
  if (!entity || groupKeys.length === 0) return [];
  const keySet = new Set(groupKeys);
  // ordered group list
  const orderedGroups = [...entity.field_groups]
    .filter((g) => keySet.has(g.group_key))
    .sort((a, b) => a.sort_order - b.sort_order);

  const byName  = new Map(entity.fields.map((f) => [f.name, f]));
  const seen    = new Set<string>();
  const result: EntityField[] = [];

  for (const group of orderedGroups) {
    for (const name of group.fields) {
      if (seen.has(name)) continue;
      seen.add(name);
      const field = byName.get(name);
      if (!field) continue;
      if (editableOnly && (field.is_readonly || field.origin === "system" || field.is_computed)) continue;
      result.push(field);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIAL TAB LAYOUT CONFIGS
// Two-layer resolution: display_config.procure_line.{key} first, then convention.
// Components must not do field discovery — they receive resolved config objects.
// ─────────────────────────────────────────────────────────────────────────────

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

// ── Item Tab ──────────────────────────────────────────────────────────────────

export interface ItemTabConfig {
  /** Full-width fields at the top (description, item ref). */
  primaryFields:  EntityField[];
  /** Classify fields: enum → pills, reference → lookup dropdowns. */
  classifyFields: EntityField[];
  /** Three-column row (qty, uom, price). */
  quantityRow:    EntityField[];
}

export function resolveItemTabConfig(
  entity: CompiledEntity | null | undefined,
  groups: string[],
): ItemTabConfig {
  if (!entity) return { primaryFields: [], classifyFields: [], quantityRow: [] };
  const fields = fieldsForGroups(entity, groups);

  const isClassifyType = (f: EntityField) =>
    f.data_type === "enum" || f.data_type === "lifecycle_state" || f.data_type === "reference";

  // Layer 1 — explicit display_config.procure_line.item_tab
  const cfg     = procureCfg(entity);
  const itemCfg = cfg ? asRecord(cfg["item_tab"]) : null;
  if (itemCfg) {
    const primaryNames  = toStringArray(itemCfg["primary_fields"]);
    const quantityNames = toStringArray(itemCfg["quantity_row"]);
    const classifyNames = toStringArray(itemCfg["classify_fields"]);
    if (primaryNames.length > 0 || quantityNames.length > 0) {
      const byName     = new Map(fields.map((f) => [f.name, f]));
      const usedNames  = new Set([...primaryNames, ...quantityNames, ...classifyNames]);
      const primaryFields  = primaryNames.flatMap((n)  => { const f = byName.get(n); return f ? [f] : []; });
      const quantityRow    = quantityNames.flatMap((n) => { const f = byName.get(n); return f ? [f] : []; });
      let   classifyFields = classifyNames.flatMap((n) => { const f = byName.get(n); return f ? [f] : []; });
      if (classifyFields.length === 0) {
        classifyFields = fields.filter((f) => !usedNames.has(f.name) && isClassifyType(f));
      }
      return { primaryFields, classifyFields, quantityRow };
    }
  }

  // Layer 2 — convention: text → description, first reference → item ref,
  // decimal/integer/money/varchar → quantity row (up to 3), remaining enum/reference → classify
  const usedNames = new Set<string>();
  const primaryFields: EntityField[] = [];

  const descField = fields.find((f) => f.data_type === "text");
  if (descField) { primaryFields.push(descField); usedNames.add(descField.name); }

  const refField = fields.find((f) => f.data_type === "reference" && !usedNames.has(f.name));
  if (refField) { primaryFields.push(refField); usedNames.add(refField.name); }

  const NUMERIC_OR_UOM = new Set(["decimal", "integer", "money", "bigint", "numeric"]);
  const quantityRow = fields
    .filter((f) => !usedNames.has(f.name) && NUMERIC_OR_UOM.has(f.data_type))
    .slice(0, 3);
  quantityRow.forEach((f) => usedNames.add(f.name));

  const classifyFields = fields.filter((f) => !usedNames.has(f.name) && isClassifyType(f));

  return { primaryFields, classifyFields, quantityRow };
}

// ── Tax Tab Sections ──────────────────────────────────────────────────────────

export interface TaxTabSection {
  label:  string;
  fields: EntityField[];
}

/**
 * editableOnly defaults to false because tax amounts are usually computed.
 * Pass false to include read-only fields in the returned sections.
 */
export function resolveTaxTabSections(
  entity:      CompiledEntity | null | undefined,
  groups:      string[],
  editableOnly = false,
): TaxTabSection[] {
  if (!entity) return [];
  const allFields = fieldsForGroups(entity, groups, editableOnly);

  // Layer 1 — explicit display_config.procure_line.tax_tab.sections
  const cfg    = procureCfg(entity);
  const taxCfg = cfg ? asRecord(cfg["tax_tab"]) : null;
  if (taxCfg && Array.isArray(taxCfg["sections"])) {
    const byName = new Map(allFields.map((f) => [f.name, f]));
    const sections: TaxTabSection[] = [];
    for (const raw of taxCfg["sections"] as unknown[]) {
      const s = asRecord(raw);
      if (!s) continue;
      const label      = textValue(s["label"]);
      const fieldNames = toStringArray(s["fields"]);
      const prefix     = textValue(s["prefix"]);
      if (!label) continue;
      const sectionFields = fieldNames.length > 0
        ? fieldNames.flatMap((n) => { const f = byName.get(n); return f ? [f] : []; })
        : prefix
          ? allFields.filter((f) => f.name.startsWith(prefix))
          : [];
      if (sectionFields.length > 0) sections.push({ label, fields: sectionFields });
    }
    if (sections.length > 0) return sections;
  }

  // Layer 2 — ui_hint.tax_section on individual fields
  const withHint = allFields.filter((f) => Boolean(textValue(asRecord(f.ui_hint)?.["tax_section"])));
  if (withHint.length > 0) {
    const sectionMap = new Map<string, EntityField[]>();
    for (const f of allFields) {
      const key = textValue(asRecord(f.ui_hint)?.["tax_section"]) ?? "_ungrouped";
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(f);
    }
    return [...sectionMap.entries()]
      .filter(([k]) => k !== "_ungrouped")
      .map(([k, fields]) => ({ label: k.toUpperCase().replace(/_/g, " "), fields }));
  }

  // No sections configured — caller shows a flat grid
  return [];
}

// ── Pct Tab Config (discount / retention) ─────────────────────────────────────

export interface PctTabConfig {
  /** Section card header label. */
  sectionLabel: string;
  /** The percentage/rate field. */
  pctField:     EntityField | null;
  /** The derived monetary amount field. */
  amtField:     EntityField | null;
  /** Optional sub-header for remaining fields below the card. */
  otherLabel?:  string;
}

/**
 * @param configKey  "discount_tab" or "retention_tab" (key in display_config.procure_line)
 * @param label      Default section label used when config doesn't specify one
 */
export function resolvePctTabConfig(
  entity:    CompiledEntity | null | undefined,
  groups:    string[],
  configKey: string,
  label:     string,
): PctTabConfig {
  if (!entity) return { sectionLabel: label, pctField: null, amtField: null };
  const fields = fieldsForGroups(entity, groups);

  // Layer 1 — explicit display_config.procure_line.{configKey}
  const cfg    = procureCfg(entity);
  const tabCfg = cfg ? asRecord(cfg[configKey]) : null;
  if (tabCfg) {
    const byName  = new Map(fields.map((f) => [f.name, f]));
    const pctName = textValue(tabCfg["pct_field"]);
    const amtName = textValue(tabCfg["amount_field"]);
    if (pctName || amtName) {
      return {
        sectionLabel: textValue(tabCfg["label"])      ?? label,
        pctField:     pctName ? (byName.get(pctName) ?? null) : null,
        amtField:     amtName ? (byName.get(amtName) ?? null) : null,
        otherLabel:   textValue(tabCfg["other_label"]) ?? undefined,
      };
    }
  }

  // Layer 2 — convention: first percent-type field, first money/decimal
  const pctField = fields.find(
    (f) => f.data_type === "decimal" &&
      (f.name.endsWith("_pct") || f.name.endsWith("_rate") || f.name.endsWith("_percent")),
  ) ?? null;
  const amtField = fields.find((f) => f.data_type === "money" || (f.data_type === "decimal" && f !== pctField)) ?? null;

  return { sectionLabel: label, pctField, amtField };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcureDistribution {
  id: string;
  distribution_no?: number;
  account_code?: string;
  account_source?: string;
  split_pct?: number;
  distributed_amount?: number;
  currency_code?: string;
  cost_center_id?: string;
  project_id?: string;
  description?: string;
  [key: string]: unknown;
}

export function useProcureLineDistributions(
  entityCode:    string,
  parentRecordId: string,
  lineId:        string,
  enabled:       boolean,
): { distributions: ProcureDistribution[]; loading: boolean; refetch: () => Promise<void> } {
  const [distributions, setDistributions] = useState<ProcureDistribution[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !lineId) {
      setDistributions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(parentRecordId)}/lines/${encodeURIComponent(lineId)}/distributions`,
        { signal },
      );
      const body = response.ok ? await response.json() as { data?: ProcureDistribution[] } : null;
      if (!signal?.aborted) setDistributions(body?.data ?? []);
    } catch {
      if (!signal?.aborted) setDistributions([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, entityCode, parentRecordId, lineId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { distributions, loading, refetch: () => load() };
}

export function useReferencedRecord(
  entityCode: string,
  id:         string,
  enabled:    boolean,
): { record: Record<string, unknown> | null; loading: boolean } {
  const [record, setRecord]   = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !id || !entityCode) { setRecord(null); return; }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}`)
      .then((r) => r.ok ? r.json() as Promise<{ data?: Record<string, unknown> }> : null)
      .then((body) => { if (!cancelled) { setRecord(body?.data ?? null); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, entityCode, id]);

  return { record, loading };
}

export interface MatchException {
  id: string;
  exception_type: string;
  exception_subtype?: string;
  expected_value?: number;
  actual_value?: number;
  variance_amount: number;
  variance_pct?: number;
  is_within_tolerance: boolean;
  resolution_type?: string;
  status: string;
  [key: string]: unknown;
}

export function useMatchExceptions(
  entityCode:    string,
  parentRecordId: string,
  lineId:        string,
  enabled:       boolean,
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
