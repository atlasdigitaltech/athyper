"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PROCURE VARIANT — panel array definition
//
// Declares the ordered set of LineItemPanel tabs for the "procure" variant.
// Each panel's groupKeys is the meta-entity contract — it names the
// entity field.group_key values the panel is responsible for.
// ─────────────────────────────────────────────────────────────────────────────

import type { LineItemPanel, LineItemPanelContext } from "../types";
import { ProcureItemPanel }       from "../panels/procure/procure-item-panel";
import { ReferencePanel }         from "../panels/procure/reference-panel";
import { DeliveryPanel }          from "../panels/procure/delivery-panel";
import { BudgetPanel }            from "../panels/procure/budget-panel";
import { AccountingPanelAdapter } from "../panels/procure/accounting-panel-adapter";
import { ClassifyPanelAdapter }   from "../panels/procure/classify-panel-adapter";
import { TaxPanel }               from "../panels/tax-panel";
import { DiscountPanel }          from "../panels/discount-panel";
import { ChargesPanel }           from "../panels/charges-panel";
import { RetentionPanel }         from "../panels/retention-panel";

function hasGroup(groupKey: string) {
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => f.group_key === groupKey) ?? false;
}

function hasIntentOrGroups(uiIntents: string[], fallbackGroupKeys: string[]) {
  const intents = new Set(uiIntents);
  const fallbackGroups = new Set(fallbackGroupKeys);
  return (ctx: LineItemPanelContext) => {
    if (!ctx.entity) return false;
    const groupKeys = new Set(
      (ctx.entity.field_groups ?? [])
        .filter((group) => group.ui_intent && intents.has(group.ui_intent))
        .map((group) => group.group_key),
    );
    return ctx.entity.fields.some((field) =>
      field.group_key &&
      (groupKeys.has(field.group_key) || fallbackGroups.has(field.group_key)) &&
      field.origin !== "system" &&
      !field.is_computed &&
      !field.is_readonly,
    );
  };
}

function hasAnyGroup(...groupKeys: string[]) {
  const keys = new Set(groupKeys);
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => keys.has(f.group_key ?? "")) ?? false;
}

function hasAnyFieldName(...fieldNames: string[]) {
  const names = new Set(fieldNames);
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => names.has(f.name)) ?? false;
}

const REF_FIELD_NAMES = new Set([
  "commitment_id", "purchase_order_id", "po_id",
  "receipt_id", "service_sheet_id",
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
    isVisible: hasIntentOrGroups(["what", "how_much"], ["item", "profile", "financial", "pricing"]),
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
    key:       "delivery",
    label:     "Delivery",
    groupKeys: [
      "delivery_fulfillment",
      "delivery_supplier_source",
      "delivery_addresses",
      "dates",
      "logistics",
      "addresses",
      "parties",
    ],
    Component: DeliveryPanel,
    isVisible: hasIntentOrGroups(["delivery"], [
      "delivery_fulfillment",
      "delivery_supplier_source",
      "delivery_addresses",
      "dates",
      "logistics",
      "addresses",
      "parties",
    ]),
    order:     3,
  },
  {
    key:       "tax",
    label:     "Tax",
    groupKeys: ["tax"],
    Component: TaxPanel,
    isVisible: hasIntentOrGroups(["tax"], ["tax"]),
    order:     4,
  },
  {
    key:       "accounting",
    label:     "Accounting",
    groupKeys: ["dimensions", "allocation"],
    modes:     ["compose"],
    Component: AccountingPanelAdapter,
    order:     5,
  },
  {
    key:       "budget",
    label:     "Budget",
    groupKeys: ["budget", "accounting"],
    Component: BudgetPanel,
    isVisible: hasAnyFieldName(
      "budget_profile_id",
      "budget_allocation_id",
      "budget_check_result",
      "encumbrance_je_id",
    ),
    order:     6,
  },
  {
    key:       "discount",
    label:     "Discount",
    groupKeys: ["discount"],
    Component: DiscountPanel,
    isVisible: hasGroup("discount"),
    order:     7,
  },
  {
    key:       "charges",
    label:     "Charges",
    groupKeys: ["charges"],
    Component: ChargesPanel,
    isVisible: hasGroup("charges"),
    order:     8,
  },
  {
    key:       "retention",
    label:     "Retention",
    groupKeys: ["retention"],
    Component: RetentionPanel,
    isVisible: hasGroup("retention"),
    order:     9,
  },
  {
    key:       "reference",
    label:     "Reference",
    groupKeys: ["reference", "matching"],
    Component: ReferencePanel,
    isVisible: hasReferenceLinks,
    order:     10,
  },
];
