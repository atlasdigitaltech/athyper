"use client";

import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GripHorizontal, MoreVertical, X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { getActionIcon } from "@athyper/icons";
import type { HeaderAction } from "./types";

const PANEL_WIDTH = 280;

interface PanelPosition {
  top: number;
  left: number;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

function clampPosition(pos: PanelPosition, panelHeight?: number): PanelPosition {
  const vw = typeof window === "undefined" ? PANEL_WIDTH + 16 : window.innerWidth;
  const vh = typeof window === "undefined" ? 400 : window.innerHeight;
  const w = Math.min(PANEL_WIDTH, vw - 16);
  const h = Math.min(panelHeight ?? 400, vh - 16);
  return {
    top: Math.max(8, Math.min(pos.top, vh - h - 8)),
    left: Math.max(8, Math.min(pos.left, vw - w - 8)),
  };
}

export function RuntimeRecordMoreMenu({
  actions,
  onAction,
}: {
  actions: HeaderAction[];
  onAction?: (id: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        title="More actions"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical aria-hidden="true" className="size-5" />
      </button>
      {open && (
        <RecordMorePanel
          buttonRef={buttonRef}
          panelRef={panelRef}
          actions={actions}
          onAction={onAction}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function RecordMorePanel({
  buttonRef,
  panelRef,
  actions,
  onAction,
  onClose,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  actions: HeaderAction[];
  onAction?: (id: string) => void;
  onClose: () => void;
}) {
  const userMovedRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  // Initial + resize/scroll positioning
  useLayoutEffect(() => {
    const update = () => {
      const anchor = buttonRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
      if (userMovedRef.current) {
        setPosition((cur) =>
          clampPosition(cur, panelRef.current?.getBoundingClientRect().height),
        );
        return;
      }
      setPosition(
        clampPosition(
          { top: rect.bottom + 8, left },
          panelRef.current?.getBoundingClientRect().height,
        ),
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [buttonRef, panelRef]);

  // Drag move/end handlers — active only while dragging
  useEffect(() => {
    if (!dragging) return;

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds || e.pointerId !== ds.pointerId) return;
      const h = panelRef.current?.getBoundingClientRect().height;
      setPosition(clampPosition({ top: e.clientY - ds.offsetY, left: e.clientX - ds.offsetX }, h));
    };
    const onEnd = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (ds && e.pointerId !== ds.pointerId) return;
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, panelRef]);

  const regular = actions.filter((a) => a.placement !== "danger");
  const dangerous = actions.filter((a) => a.placement === "danger");

  function fireAction(action: HeaderAction) {
    if (action.disabled) return;
    void action.onSelect?.();
    onAction?.(action.id);
    onClose();
  }

  const panelStyle: CSSProperties = {
    top: position.top,
    left: position.left,
    width: `min(${PANEL_WIDTH}px, calc(100vw - 1rem))`,
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="More actions"
      className="fixed z-50 flex max-h-[min(34rem,calc(100vh-1rem))] flex-col overflow-hidden rounded-md border bg-popover shadow-xl ring-1 ring-border"
      style={panelStyle}
    >
      {/* Drag handle + title + close */}
      <div
        className="flex h-12 shrink-0 cursor-grab touch-none items-center justify-between border-b px-4 active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (target?.closest("button,a,input,select,textarea,[role='button']")) return;
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect) return;
          userMovedRef.current = true;
          dragStateRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
          };
          setDragging(true);
        }}
      >
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <GripHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">More actions</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close More actions"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        <section className="space-y-1.5">
          <h3 className="px-0.5 text-xs font-medium text-muted-foreground">Entity operations</h3>
          {regular.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No entity operations available.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border bg-background">
              {regular.map((action) => {
                const Icon = action.icon ? getActionIcon(action.icon) : null;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => fireAction(action)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium first:border-t-0",
                      action.disabled
                        ? "cursor-not-allowed opacity-40 text-foreground"
                        : "text-foreground hover:bg-muted/70",
                    )}
                  >
                    {Icon && (
                      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {dangerous.length > 0 && (
          <section className="space-y-1.5">
            <div className="overflow-hidden rounded-md border bg-background">
              {dangerous.map((action) => {
                const Icon = action.icon ? getActionIcon(action.icon) : null;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => fireAction(action)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-destructive first:border-t-0",
                      action.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-destructive/5",
                    )}
                  >
                    {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
