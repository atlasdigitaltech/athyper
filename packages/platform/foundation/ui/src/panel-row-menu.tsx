"use client";
import React, { useEffect, useRef, type ReactNode } from "react";
import { MoreHorizontalIcon } from "@athyper/platform-icons";

/** The ⋯ menu at the end of a panel list row (Notifications, Inbox, Quick access). It closes
 * on an outside pointer, on Escape (returning focus to ⋯, before any surrounding panel
 * handles Escape) and once an item is chosen. Items are plain buttons; keep labels short. */
export function PanelRowMenu({
  label,
  className = "",
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target))
        menu.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={menu}
      className={`a-panel-row__menu ${className}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menu.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        menu.current.removeAttribute("open");
        menu.current.querySelector<HTMLElement>("summary")?.focus();
      }}
    >
      <summary aria-label={label}>
        <MoreHorizontalIcon size={18} aria-hidden="true" />
      </summary>
      <div
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button"))
            menu.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}
