"use client";

import { MetaFieldPanel } from "./meta-field-panel";
import type { LineItemPanelProps } from "../types";

export function DiscountPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["discount"]} />;
}
