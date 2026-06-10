"use client";

import { MetaFieldPanel } from "./MetaFieldPanel";
import type { LineItemPanelProps } from "../types";

export function DiscountPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["discount"]} />;
}
