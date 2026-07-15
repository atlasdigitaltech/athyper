// ─────────────────────────────────────────────────────────────────────────────
// Summary-strip metadata resolver
//
// Two metadata sources drive the LineItemFooterAmountStrip's column list,
// taking precedence over the variant heuristics:
//
//   1. entity.display_config.line_summary_strip — entity-level override.
//      Wins outright when present. Lets the line entity author the exact bar
//      shape (order, labels, bold flag) without depending on the variant.
//
//   2. EntityField.ui_hint.line_summary — per-field opt-in. When no entity-
//      level override exists, fields carrying this hint are collected,
//      sorted by `order`, and used as the bar.
//
//   3. Variant heuristic — caller's built-in fallback (e.g. procure's
//      net/discount/tax/gross list).
// ─────────────────────────────────────────────────────────────────────────────

import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { LineAmountSummaryField } from "../types";

type AmountFieldOverride = {
  amount?:   string;
  currency?: string;
};

export interface ResolvedSummaryStrip {
  amountField:    string | null;
  currencyField:  string | null;
  summaryFields:  LineAmountSummaryField[] | null;
}

// ── Entity-level override ──────────────────────────────────────────────────
//
// display_config.line_summary_strip = {
//   amount_field?:   "net_amount",
//   currency_field?: "currency_code",
//   fields?: [{ name, label?, sign?, bold?, divider? }, ...],
// }

interface LineSummaryStripDisplayConfig {
  amount_field?:   unknown;
  currency_field?: unknown;
  fields?:         unknown;
}

function getLineSummaryStripConfig(entity: CompiledEntity): LineSummaryStripDisplayConfig | null {
  const dc = entity.display_config as Record<string, unknown> | null | undefined;
  const raw = dc?.["line_summary_strip"];
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as LineSummaryStripDisplayConfig)
    : null;
}

function pickEntityOverride(entity: CompiledEntity): {
  override:  AmountFieldOverride;
  fields:    LineAmountSummaryField[] | null;
} {
  const cfg = getLineSummaryStripConfig(entity);
  if (!cfg) return { override: {}, fields: null };

  const fieldNames = new Set(entity.fields.map((f) => f.name));

  const rawList = Array.isArray(cfg.fields) ? cfg.fields : null;
  const fields: LineAmountSummaryField[] | null = rawList
    ? rawList.flatMap((raw): LineAmountSummaryField[] => {
        if (!raw || typeof raw !== "object") return [];
        const obj  = raw as Record<string, unknown>;
        const name = typeof obj["name"] === "string" ? obj["name"] : null;
        if (!name || !fieldNames.has(name)) return [];
        const entityField = entity.fields.find((f) => f.name === name);
        const label = typeof obj["label"] === "string" ? obj["label"]
                    : entityField?.label ?? name;
        const sign  = obj["sign"] === -1 ? -1 : obj["sign"] === 1 ? 1 : undefined;
        return [{
          name,
          label,
          sign,
          bold:    typeof obj["bold"]    === "boolean" ? obj["bold"]    : undefined,
          divider: typeof obj["divider"] === "boolean" ? obj["divider"] : undefined,
        }];
      })
    : null;

  const override: AmountFieldOverride = {
    amount:   typeof cfg.amount_field   === "string" ? cfg.amount_field   : undefined,
    currency: typeof cfg.currency_field === "string" ? cfg.currency_field : undefined,
  };

  return { override, fields };
}

// ── Field-level opt-in ──────────────────────────────────────────────────────
//
// EntityField.ui_hint.line_summary = { label?, sign?, bold?, divider?, order? }

interface FieldLevelSummaryHint {
  label?:   string;
  sign?:    1 | -1;
  bold?:    boolean;
  divider?: boolean;
  order?:   number;
}

function readFieldLevelHint(
  entity: CompiledEntity,
): LineAmountSummaryField[] | null {
  const out: { field: LineAmountSummaryField; order: number }[] = [];
  for (const field of entity.fields) {
    const hint = (field.ui_hint as Record<string, unknown> | null | undefined)?.["line_summary"];
    if (!hint || typeof hint !== "object") continue;
    const h = hint as FieldLevelSummaryHint;
    out.push({
      field: {
        name:    field.name,
        label:   h.label ?? field.label ?? field.name,
        sign:    h.sign === -1 ? -1 : h.sign === 1 ? 1 : undefined,
        bold:    h.bold,
        divider: h.divider,
      },
      order: typeof h.order === "number" ? h.order : 0,
    });
  }

  if (out.length === 0) return null;
  out.sort((a, b) => a.order - b.order);
  return out.map((x) => x.field);
}

// ── Public resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the summary strip column list and amount/currency field names
 * from entity metadata. Falls through to variant heuristics when nothing
 * is declared.
 *
 * Returns `summaryFields: null` when no metadata override exists — the
 * caller (variant resolver) should keep using its built-in list in that case.
 */
export function resolveSummaryStripFromMeta(
  entity: CompiledEntity,
): ResolvedSummaryStrip {
  const { override, fields: entityFields } = pickEntityOverride(entity);

  if (entityFields && entityFields.length > 0) {
    return {
      amountField:   override.amount   ?? null,
      currencyField: override.currency ?? null,
      summaryFields: entityFields,
    };
  }

  const fieldFields = readFieldLevelHint(entity);
  if (fieldFields && fieldFields.length > 0) {
    return {
      amountField:   override.amount   ?? null,
      currencyField: override.currency ?? null,
      summaryFields: fieldFields,
    };
  }

  return {
    amountField:   override.amount   ?? null,
    currencyField: override.currency ?? null,
    summaryFields: null,
  };
}
