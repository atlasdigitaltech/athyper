"use client";

import { useMemo } from "react";
import { MetaFieldPanel } from "../meta-field-panel";
import type { LineItemPanelProps } from "../../types";
import { resolveProcureEditorTabs } from "../../variants/procure";

export function ProcureItemPanel(props: LineItemPanelProps) {
  const groupKeys = useMemo(() => {
    const itemTab = resolveProcureEditorTabs(props.entity).find((tab) => tab.type === "fields");
    return itemTab?.groups?.length ? itemTab.groups : ["item"];
  }, [props.entity]);

  return (
    <MetaFieldPanel
      {...props}
      groupKeys={groupKeys}
    />
  );
}
