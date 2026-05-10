"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow, Check, Copy, ExternalLink } from "lucide-react";
import {
  appRecordHref,
  openAppRecordInNewWindow,
  RECORD_CONTEXT_MENU_EVENT,
  type RecordContextCopyItem,
  type RecordContextMenuDetail,
} from "../lib/recordLinks";

function entityLabel(entityCode: string): string {
  return entityCode
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function menuPosition(detail: RecordContextMenuDetail): { x: number; y: number } {
  if (typeof window === "undefined") return { x: detail.x, y: detail.y };
  return {
    x: Math.min(detail.x, Math.max(12, window.innerWidth - 340)),
    y: Math.min(detail.y, Math.max(12, window.innerHeight - 320)),
  };
}

export function RecordLinkContextMenu() {
  const [menu, setMenu] = useState<RecordContextMenuDetail | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<RecordContextMenuDetail>).detail;
      if (!detail?.entityCode || !detail.recordId) return;
      const position = menuPosition(detail);
      setCopied(null);
      setMenu({ ...detail, ...position });
    };

    window.addEventListener(RECORD_CONTEXT_MENU_EVENT, handleOpen);
    return () => window.removeEventListener(RECORD_CONTEXT_MENU_EVENT, handleOpen);
  }, []);

  const copyItems = useMemo<RecordContextCopyItem[]>(() => {
    if (!menu) return [];
    if (menu.copyItems?.length) return menu.copyItems;
    return [{ label: entityLabel(menu.entityCode), value: menu.recordId }];
  }, [menu]);

  if (!menu) return null;

  const href = appRecordHref(menu.entityCode, menu.recordId);

  async function copyValue(item: RecordContextCopyItem) {
    await navigator.clipboard.writeText(item.value);
    setCopied(item.label);
    window.setTimeout(() => setCopied(null), 1200);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setMenu(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu(null);
        }}
      />
      <div
        className="fixed z-50 min-w-[260px] max-w-[320px] overflow-hidden rounded-lg border bg-popover py-1 shadow-md"
        style={{ left: menu.x, top: menu.y }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          onClick={() => {
            window.open(href, "_blank", "noopener,noreferrer");
            setMenu(null);
          }}
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Open in new tab
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
          onClick={() => {
            openAppRecordInNewWindow(menu.entityCode, menu.recordId);
            setMenu(null);
          }}
        >
          <AppWindow className="h-4 w-4 shrink-0" />
          Open in new window
        </button>

        {copyItems.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              Copy field
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {copyItems.map((item) => (
                <button
                  key={`${item.label}:${item.value}`}
                  type="button"
                  className="grid w-full grid-cols-[7.5rem_minmax(0,1fr)_1rem] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted"
                  onClick={() => void copyValue(item)}
                >
                  <span className="truncate text-sm text-muted-foreground">{item.label}</span>
                  <span className="truncate text-sm font-medium text-foreground">{item.value}</span>
                  {copied === item.label ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
