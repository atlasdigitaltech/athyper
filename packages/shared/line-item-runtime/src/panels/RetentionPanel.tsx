"use client";

import { MetaFieldPanel } from "./MetaFieldPanel";
import type { LineItemPanelProps } from "../types";

export function RetentionPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["retention"]} />;
}
