"use client";

import { MetaFieldPanel } from "./MetaFieldPanel";
import type { LineItemPanelProps } from "../types";

export function TaxPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["tax"]} />;
}
