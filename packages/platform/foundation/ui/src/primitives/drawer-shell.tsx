"use client";

import { useState, type ReactNode, type CSSProperties, type ComponentPropsWithoutRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { overlayScrimVariants, type OverlayScrimTone } from "./overlay";
import { Badge } from "./badge";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawerIntent = "transactional" | "context";

export interface DrawerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visual weight of the overlay. transactional = strong blur, context = light. */
  intent?: DrawerIntent;
  /**
   * localStorage key scoped as `drawer:{widthKey}`.
   * Use format: `{workspace}:{entity}:{panel}` e.g. "master:supplier:attachments"
   */
  widthKey?: string;
  /** px number or CSS string: "60vw", "520px". Defaults to 520. */
  defaultWidth?: number | string;
  /** px number or CSS string: "30vw", "380px". Defaults to 380. */
  minWidth?: number | string;
  /** px number or CSS string: "85vw", "800px". Defaults to "85vw". */
  maxWidth?: number | string;
  /** Width snapped to when expand is clicked. px number or CSS string: "80vw". */
  expandedWidth?: number | string;
  resizable?: boolean;
  expandable?: boolean;
  // ── Header slots ────────────────────────────────────────────────────────────
  /** Small chip shown before the title, e.g. "SUPPLIER" */
  badge?: string;
  /** Optional detail rendered below the badge, e.g. line number navigation. */
  badgeDetail?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Slot rendered between title and the expand/close buttons. */
  headerRight?: ReactNode;
  /** Slot rendered below the header row and above the body (e.g. tab bar). Gets its own border-b. */
  headerBottom?: ReactNode;
  // ── Footer slots (footer bar only rendered when either is provided) ─────────
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** Optional footer-bar geometry override for a drawer family. */
  footerClassName?: string;
  /** Optional class override for the scroll body. */
  bodyClassName?: string;
  /** Optional overlay styling for non-modal embedded drawers. */
  overlayClassName?: string;
  /** Radix focus lifecycle hooks for callers with an external trigger. */
  onOpenAutoFocus?: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onOpenAutoFocus"];
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onCloseAutoFocus"];
  children?: ReactNode;
  className?: string;
}

// ── Overlay strength per intent ───────────────────────────────────────────────

const OVERLAY_TONE: Record<DrawerIntent, OverlayScrimTone> = {
  transactional: "drawer",
  context:       "context",
};

// ── Width helpers ─────────────────────────────────────────────────────────────

/** Resolve a px-number or CSS dimension string ("60vw", "520px") to a pixel integer. */
function resolvePx(value: number | string, fallback = 520): number {
  if (typeof value === "number") return value;
  if (typeof window === "undefined") return fallback;
  const s = String(value).trim();
  if (s.endsWith("vw")) return Math.round((parseFloat(s) / 100) * window.innerWidth);
  if (s.endsWith("px")) return Math.round(parseFloat(s));
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function readSavedWidth(key: string | undefined, fallback: number | string): number {
  const px = resolvePx(fallback);
  if (!key || typeof window === "undefined") return px;
  try {
    const raw = localStorage.getItem(`drawer:${key}`);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : px;
  } catch {
    return px;
  }
}

function persistWidth(key: string | undefined, w: number) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(`drawer:${key}`, String(w));
  } catch {
    // localStorage disabled (private browsing) — skip persistence silently
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DrawerShell({
  open,
  onOpenChange,
  intent = "transactional",
  widthKey,
  defaultWidth = 520,
  minWidth = 380,
  maxWidth = "85vw",
  expandedWidth,
  resizable = true,
  expandable = false,
  badge,
  badgeDetail,
  title,
  subtitle,
  headerRight,
  headerBottom,
  footerStart,
  footerEnd,
  footerClassName,
  bodyClassName,
  overlayClassName,
  onOpenAutoFocus,
  onCloseAutoFocus,
  children,
  className,
}: DrawerShellProps) {
  const resolvedExpandedWidth = resolvePx(
    expandedWidth ?? (intent === "context" ? "80vw" : "860px"),
  );

  const [panelWidth, setPanelWidth] = useState<number>(() =>
    readSavedWidth(widthKey, defaultWidth),
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const effectiveWidth = isExpanded ? resolvedExpandedWidth : panelWidth;

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startW = effectiveWidth;
    // Compute bounds once at drag-start — avoids reading window.innerWidth
    // on every pointermove event (which can fire 60+ times/sec).
    const minPx = resolvePx(minWidth, 380);
    const maxPx = resolvePx(maxWidth, 9999);
    const clamp = (delta: number) =>
      Math.round(Math.max(minPx, Math.min(startW + delta, maxPx)));

    setIsDragging(true);
    if (isExpanded) setIsExpanded(false);

    function onMove(ev: PointerEvent) {
      setPanelWidth(clamp(startX - ev.clientX));
    }

    function onUp(ev: PointerEvent) {
      const finalW = clamp(startX - ev.clientX);
      setPanelWidth(finalW);
      persistWidth(widthKey, finalW);
      setIsDragging(false);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  const maxWidthCss = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  const hasFooter   = footerStart !== undefined || footerEnd !== undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay — strength driven by intent */}
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-modal",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
            overlayScrimVariants({ tone: OVERLAY_TONE[intent] }),
            overlayClassName,
          )}
        />

        {/* Drawer panel */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          data-advanced-picker-portal-root="true"
          data-drawer-shell-content="true"
          style={{ width: effectiveWidth, maxWidth: maxWidthCss } as CSSProperties}
          className={cn(
            "fixed inset-y-0 right-0 z-modal flex flex-col",
            "border-l border-border bg-background shadow-2xl",
            "data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right",
            isDragging && "select-none",
            className,
          )}
        >
          {/* Resize handle — left edge; drag to resize, double-click to expand */}
          {resizable && (
            <div
              onPointerDown={startDrag}
              onDoubleClick={expandable ? () => setIsExpanded((v) => !v) : undefined}
              className="absolute inset-y-0 left-0 z-20 w-3 cursor-col-resize group"
              aria-hidden="true"
            >
              {/* Track line */}
              <div className={cn(
                "absolute inset-y-0 left-1 w-px transition-colors duration-150",
                isDragging ? "bg-ring" : "bg-border/40 group-hover:bg-ring/70",
              )} />
              {/* Grip pill */}
              <div className={cn(
                "absolute left-0.5 top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-full transition-colors duration-150",
                isDragging ? "bg-ring" : "bg-border group-hover:bg-ring/60",
              )} />
            </div>
          )}

          {/* Header */}
          <div className="flex shrink-0 min-h-14 items-center gap-3 border-b border-border bg-background px-4 py-2">
            {(badge || badgeDetail) && (
              <div className="flex shrink-0 flex-col items-center gap-1">
                {badge && (
                  <Badge
                    variant="outline"
                    className="max-w-[18rem] whitespace-nowrap bg-muted/40 px-2.5 py-1 font-medium text-muted-foreground"
                  >
                    {badge}
                  </Badge>
                )}
                {badgeDetail}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && (
                <DialogPrimitive.Title className="text-base font-medium leading-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
              )}
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="ml-1 flex shrink-0 items-center gap-0.5">
              {headerRight}
              <DialogPrimitive.Close
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Optional sub-header (e.g. tab bar) — outside the scroll container */}
          {headerBottom && (
            <div className="shrink-0 border-b border-border bg-background">
              {headerBottom}
            </div>
          )}

          {/* Body */}
          <div className={cn("min-h-0 flex-1 overflow-y-auto bg-muted/20", bodyClassName)}>
            {children}
          </div>

          {/* Footer — only rendered when caller provides at least one slot */}
          {hasFooter && (
            <div className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-5 py-3",
              footerClassName,
            )}>
              <div className="min-w-0 flex-1 text-muted-foreground">{footerStart}</div>
              <div className="flex shrink-0 items-center gap-2">{footerEnd}</div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
