"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SALES VARIANT — panel array definition
// ─────────────────────────────────────────────────────────────────────────────

import type { LineItemPanel, LineItemPanelContext } from "../types";
import { SalesItemPanel }          from "../panels/sales/SalesItemPanel";
import { DeliveryPanel }           from "../panels/sales/DeliveryPanel";
import { AccountingPanelAdapter }  from "../panels/procure/AccountingPanelAdapter";
import { ClassifyPanelAdapter }    from "../panels/procure/ClassifyPanelAdapter";
import { TaxPanel }                from "../panels/TaxPanel";
import { DiscountPanel }           from "../panels/DiscountPanel";

function hasGroup(groupKey: string) {
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => f.group_key === groupKey) ?? false;
}

function hasAnyGroup(...groupKeys: string[]) {
  const keys = new Set(groupKeys);
  return (ctx: LineItemPanelContext) =>
    ctx.entity?.fields.some((f) => keys.has(f.group_key ?? "")) ?? false;
}

function hasDeliveryFields(ctx: LineItemPanelContext): boolean {
  return ctx.entity?.fields.some((f) =>
    ["fulfillment", "delivery", "shipping"].includes(f.group_key ?? ""),
  ) ?? false;
}

export const SALES_PANELS: LineItemPanel[] = [
  {
    key:       "item",
    label:     "Item",
    groupKeys: ["item", "product", "service", "financial", "pricing"],
    Component: SalesItemPanel,
    order:     1,
  },
  {
    key:       "classify",
    label:     "Classify",
    groupKeys: ["classification"],
    Component: ClassifyPanelAdapter,
    isVisible: hasAnyGroup("classification", "taxonomy"),
    order:     2,
  },
  {
    key:       "accounting",
    label:     "Revenue",
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
    key:       "delivery",
    label:     "Delivery",
    groupKeys: ["fulfillment", "delivery", "shipping"],
    Component: DeliveryPanel,
    isVisible: hasDeliveryFields,
    order:     6,
  },
];
