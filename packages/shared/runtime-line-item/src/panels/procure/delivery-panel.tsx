"use client";

import { MetaFieldPanel } from "../meta-field-panel";
import type { LineItemPanelProps } from "../../types";

export function DeliveryPanel(props: LineItemPanelProps) {
  return (
    <MetaFieldPanel
      {...props}
      groupKeys={[
        "delivery_fulfillment",
        "delivery_supplier_source",
        "delivery_addresses",
        "dates",
        "logistics",
        "addresses",
        "parties",
      ]}
      uiIntents={["delivery"]}
    />
  );
}
