"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ComponentType, SVGProps } from "react";
import { X } from "lucide-react";

interface PaletteDrawerProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  title:     string;
  icon?:     ComponentType<SVGProps<SVGSVGElement>>;
  onClose:   () => void;
  children:  React.ReactNode;
  footer?:   React.ReactNode;
  /**
   * Backdrop styling behind the drawer.
   *   - `"dim"` (default): dim + blur the page underneath. Matches the
   *     entity-list page-level UX where the drawer takes focus.
   *   - `"transparent"`: invisible backdrop. Page underneath stays at
   *     full clarity. Used by embedded grids (line items) where the
   *     drawer is a secondary affordance within a parent document page
   *     that shouldn't be visually displaced when opened.
   *
   * Click-to-close behaviour is identical in both modes.
   */
  backdrop?: "dim" | "transparent";
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PaletteDrawer({
  anchorRef,
  title,
  icon: Icon,
  onClose,
  children,
  footer,
  backdrop = "dim",
}: PaletteDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();

    return () => {
      anchorRef.current?.focus();
    };
  }, [anchorRef]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    // z-modal (400) is required to stack above the page-level sticky chrome
    // (`z-sticky` = 100; see RuntimeEntityHeader). Using a literal `z-50`
    // here caused embedded consumers' page headers to render on top of
    // the drawer's right edge — see the column-picker bug fix.
    <div className="fixed inset-0 z-modal">
      <button
        type="button"
        aria-label={`Discard ${title} changes`}
        className={[
          "absolute inset-0 cursor-default",
          backdrop === "dim" ? "bg-foreground/20 backdrop-blur-[1px]" : "",
        ].filter(Boolean).join(" ")}
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "absolute flex min-h-80 flex-col overflow-hidden border bg-popover text-popover-foreground shadow-2xl",
          isDesktop ? "rounded-none border-y-0 border-r-0" : "rounded-t-xl",
        ].join(" ")}
        style={isDesktop
          ? {
              top:       0,
              right:     0,
              bottom:    0,
              left:      "auto",
              width:     "clamp(480px, 40vw, 760px)",
              height:    "100dvh",
              maxHeight: "none",
            }
          : {
              left:      0,
              right:     0,
              bottom:    0,
              top:       "auto",
              width:     "100vw",
              height:    "75dvh",
              maxHeight: "75dvh",
            }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-medium text-foreground">
            {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Discard ${title} changes`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t bg-popover p-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
