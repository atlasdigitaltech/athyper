"use client";

import { MetaFieldPanel } from "./meta-field-panel";
import type { LineItemPanelProps } from "../types";

export function TaxPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["tax"]} uiIntents={["tax"]} />;
}
