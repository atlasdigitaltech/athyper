"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { GripHorizontal, X } from "lucide-react";

interface PalettePanelProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  title:     string;
  width?:    number;
  onClose:   () => void;
  children:  React.ReactNode;
}

interface PanelPosition {
  top:  number;
  left: number;
}

interface DragState {
  pointerId: number;
  offsetX:   number;
  offsetY:   number;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PalettePanel({
  anchorRef,
  title,
  width = 360,
  onClose,
  children,
}: PalettePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const userMovedRef = useRef(false);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const panelWidth = Math.min(width, viewportWidth - 16);
      if (userMovedRef.current) {
        setPosition((current) => clampPanelPosition(current, panelWidth, panelRef.current?.getBoundingClientRect().height));
        return;
      }
      const left = Math.max(8, Math.min(rect.right - panelWidth, viewportWidth - panelWidth - 8));
      setPosition(clampPanelPosition({ top: rect.bottom + 8, left }, panelWidth, panelRef.current?.getBoundingClientRect().height));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, width]);

  useEffect(() => {
    if (!dragging) return;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const rect = panelRef.current?.getBoundingClientRect();
      setPosition(clampPanelPosition({
        top:  event.clientY - dragState.offsetY,
        left: event.clientX - dragState.offsetX,
      }, rect?.width, rect?.height));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (dragState && event.pointerId !== dragState.pointerId) return;
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };
  }, [dragging]);

  useEffect(() => {
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();

    return () => {
      anchorRef.current?.focus();
    };
  }, [anchorRef]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="fixed z-50 flex max-h-[min(34rem,calc(100vh-1rem))] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl ring-1 ring-border"
      style={{ top: position.top, left: position.left, width: `min(${width}px, calc(100vw - 1rem))` }}
    >
      <div
        className="flex h-12 shrink-0 cursor-grab touch-none items-center justify-between border-b px-4 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest("button,a,input,select,textarea,[role='button']")) return;
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect) return;
          userMovedRef.current = true;
          dragStateRef.current = {
            pointerId: event.pointerId,
            offsetX:   event.clientX - rect.left,
            offsetY:   event.clientY - rect.top,
          };
          setDragging(true);
        }}
      >
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <GripHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {children}
      </div>
    </div>
  );
}

function clampPanelPosition(position: PanelPosition, width = 360, height = 360): PanelPosition {
  const viewportWidth = typeof window === "undefined" ? width + 16 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? height + 16 : window.innerHeight;
  const panelWidth = Math.min(width, viewportWidth - 16);
  const panelHeight = Math.min(height, viewportHeight - 16);
  return {
    top:  Math.max(8, Math.min(position.top, viewportHeight - panelHeight - 8)),
    left: Math.max(8, Math.min(position.left, viewportWidth - panelWidth - 8)),
  };
}
