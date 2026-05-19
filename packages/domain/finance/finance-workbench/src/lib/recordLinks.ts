"use client";

import type { MouseEvent } from "react";
import { appEntityDetailHref } from "@athyper/runtime-shared/core";

export interface RecordContextCopyItem {
  label: string;
  value: string;
}

export interface RecordContextMenuDetail {
  entityCode: string;
  recordId: string;
  x: number;
  y: number;
  copyItems?: RecordContextCopyItem[];
}

export const RECORD_CONTEXT_MENU_EVENT = "finance-workbench:record-context-menu";

export function appRecordHref(entityCode: string, recordId: string): string {
  return appEntityDetailHref(entityCode, recordId);
}

export function openAppRecordInNewTab(entityCode: string, recordId: string): void {
  if (!recordId) return;
  window.open(appRecordHref(entityCode, recordId), "_blank", "noopener,noreferrer");
}

export function openAppRecordInNewWindow(entityCode: string, recordId: string): void {
  if (!recordId) return;
  window.open(
    appRecordHref(entityCode, recordId),
    "_blank",
    "noopener,noreferrer,width=1280,height=800",
  );
}

export function openAppRecordFromContextMenu(
  event: MouseEvent<HTMLElement>,
  entityCode: string,
  recordId: string,
  options?: { copyItems?: RecordContextCopyItem[] },
): void {
  event.preventDefault();
  event.stopPropagation();
  if (!recordId) return;

  window.dispatchEvent(new CustomEvent<RecordContextMenuDetail>(RECORD_CONTEXT_MENU_EVENT, {
    detail: {
      entityCode,
      recordId,
      x: event.clientX,
      y: event.clientY,
      copyItems: options?.copyItems,
    },
  }));
}
