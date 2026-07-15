"use client";

import { MetaFieldPanel } from "./meta-field-panel";
import type { LineItemPanelProps } from "../types";

export function ChargesPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["charges"]} />;
}
