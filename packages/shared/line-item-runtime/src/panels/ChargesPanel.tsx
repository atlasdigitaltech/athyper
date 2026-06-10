"use client";

import { MetaFieldPanel } from "./MetaFieldPanel";
import type { LineItemPanelProps } from "../types";

export function ChargesPanel(props: LineItemPanelProps) {
  return <MetaFieldPanel {...props} groupKeys={["charges"]} />;
}
