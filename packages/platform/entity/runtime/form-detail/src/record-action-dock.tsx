"use client";
import type { HTMLAttributes } from "react";
import { PanelFooter } from "@athyper/platform-ui";

/** A feature-owned action area: static beside side-view scrolling, sticky in full view. */
export function RecordActionDock({className="",...props}:HTMLAttributes<HTMLDivElement>) {
 return <PanelFooter {...props} className={`a-record-action-dock ${className}`} data-toast-avoid/>;
}
