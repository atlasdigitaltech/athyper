"use client";

import { MetaFieldPanel } from "./meta-field-panel";
import type { LineItemPanelProps } from "../types";

/**
 * Generic item/service description panel.
 * Renders entity fields from the "item" and "profile" group_key groups.
 * Used as the default first panel for any variant that doesn't need
 * procurement-type or delivery-term specific behaviour.
 */
export function ItemDescriptionPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["item", "profile"]} />;
}
