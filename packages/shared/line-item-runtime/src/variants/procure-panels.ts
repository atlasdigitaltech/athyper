"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROCURE VARIANT — panel array definition
//
// Declares the ordered set of LineItemPanel tabs for the "procure" variant.
// Each panel's groupKeys is the meta-entity contract — it names the
// entity field.group_key values the panel is responsible for.
// ─────────────────────────────────────────────────────────────────────────────

import type { LineItemPanel, LineItemPanelContext } from "../types";
import { ProcureItemPanel }       from "../panels/procure/ProcureItemPanel";
import { ReferencePanel }         from "../panels/procure/ReferencePanel";
import { AccountingPanelAdapter } from "../panels/procure/AccountingPanelAdapter";
import { ClassifyPanelAdapter }   from "../panels/procure/ClassifyPanelAdapter";
import { TaxPanel }               from "../panels/TaxPanel";
import { DiscountPanel }          from "../panels/DiscountPanel";
import { ChargesPanel }           from "../panels/ChargesPanel";
import { RetentionPanel }         from "../panels/RetentionPanel";

function hasGroup(groupKey: string) {
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => f.group_key === groupKey) ?? false;
}

function hasAnyGroup(...groupKeys: string[]) {
  const keys = new Set(groupKeys);
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => keys.has(f.group_key ?? "")) ?? false;
}

const REF_FIELD_NAMES = new Set([
  "commitment_id", "purchase_order_id", "po_id",
  "goods_receipt_id", "service_entry_sheet_id",
]);

function hasReferenceLinks(ctx: LineItemPanelContext): boolean {
  return ctx.entity?.fields.some((f) => REF_FIELD_NAMES.has(f.name)) ?? false;
}

export const PROCURE_PANELS: LineItemPanel[] = [
  {
    key:       "item",
    label:     "Item",
    groupKeys: ["item", "profile", "financial", "pricing"],
    Component: ProcureItemPanel,
    order:     1,
  },
  {
    key:       "classify",
    label:     "Classify",
    groupKeys: ["classification", "taxonomy"],
    Component: ClassifyPanelAdapter,
    isVisible: hasAnyGroup("classification", "taxonomy"),
    order:     2,
  },
  {
    key:       "accounting",
    label:     "Accounting",
    groupKeys: ["dimensions", "allocation"],
    Component: AccountingPanelAdapter,
    order:     3,
  },
  {
    key:       "tax",
    label:     "Tax",
    groupKeys: ["tax"],
    Component: TaxPanel,
    isVisible: hasGroup("tax"),
    order:     4,
  },
  {
    key:       "discount",
    label:     "Discount",
    groupKeys: ["discount"],
    Component: DiscountPanel,
    isVisible: hasGroup("discount"),
    order:     5,
  },
  {
    key:       "charges",
    label:     "Charges",
    groupKeys: ["charges"],
    Component: ChargesPanel,
    isVisible: hasGroup("charges"),
    order:     6,
  },
  {
    key:       "retention",
    label:     "Retention",
    groupKeys: ["retention"],
    Component: RetentionPanel,
    isVisible: hasGroup("retention"),
    order:     7,
  },
  {
    key:       "reference",
    label:     "Reference",
    groupKeys: ["reference", "matching"],
    Component: ReferencePanel,
    isVisible: hasReferenceLinks,
    order:     8,
  },
];
