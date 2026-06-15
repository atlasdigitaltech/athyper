"use client";

/**
 * FloatingSelectionBar — pure UI primitive.
 *
 * Renders a viewport-fixed pill (desktop) or bottom sheet (mobile) when a
 * grid or list has selected rows. Knows nothing about entity operations,
 * preflight, or APIs — surfaces translate their selection into a
 * `SelectionAction[]` array and pass it in.
 *
 * Stacking: bar uses `z-fixed` (200). Confirm dialogs / sheets opened
 * *from* an action use `z-modal` (400) and naturally stack above.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DesktopPill } from "./DesktopPill";
import { MobileSheet } from "./MobileSheet";
import { useInteractionModality } from "./useInteractionModality";
import type {
  FloatingSelectionBarProps,
  SelectionAction,
} from "./types";

export type {
  FloatingSelectionBarProps,
  SelectionAction,
  SelectionActionGroup,
  SelectionActionShortcut,
  SelectionActionVariant,
  SelectionBadgeTone,
  AutoFocusMode,
} from "./types";

const DEFAULT_NOUN = { singular: "item", plural: "items" };

export function FloatingSelectionBar({
  count,
  noun = DEFAULT_NOUN,
  actions,
  onClear,
  busy = false,
  mobileLayout = "sheet",
  portalTarget,
  position = "bottom",
  enableShortcuts = false,
  enableEscapeToClear = true,
  autoFocus = "keyboard-only",
  className,
  testId,
}: FloatingSelectionBarProps) {
  const open = count > 0;
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const modality = useInteractionModality();

  // Document-level keyboard handling. Mounted only while the bar is visible
  // and only when the surface opts in. Esc-to-clear is governed separately
  // because it's a safe convention even in editing surfaces.
  useEffect(() => {
    if (!open) return;
    if (!enableShortcuts && !enableEscapeToClear) return;

    const handler = (e: KeyboardEvent) => {
      // Don't hijack keystrokes typed into a form field.
      const target = e.target as HTMLElement | null;
      if (target && isEditableTarget(target)) return;

      if (enableEscapeToClear && e.key === "Escape") {
        e.preventDefault();
        onClear();
        return;
      }

      if (!enableShortcuts) return;
      const match = findShortcutMatch(actions, e);
      if (match) {
        e.preventDefault();
        void match.onSelect();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, enableShortcuts, enableEscapeToClear, actions, onClear]);

  // Conditional auto-focus on open.
  useEffect(() => {
    if (!open) return;
    if (autoFocus === "never") return;
    if (autoFocus === "keyboard-only" && modality.current !== "keyboard") return;
    // RAF so we focus after the portal mounts and animation starts.
    const id = requestAnimationFrame(() => {
      firstActionRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, autoFocus, modality]);

  if (!open) return null;

  const target = resolvePortalTarget(portalTarget);

  const content = (
    <div
      data-floating-selection-bar
      data-position={position}
      data-mobile-layout={mobileLayout}
      className={
        // Outer wrapper: viewport-fixed, no pointer-events (so it doesn't
        // block clicks on the page); inner pill/sheet re-enables them.
        // `z-fixed` (200) lets dialogs (`z-modal` 400) stack above.
        // Position controlled by `position` prop.
        [
          "pointer-events-none fixed inset-x-0 z-fixed flex justify-center",
          position === "bottom" ? "bottom-6" : "top-6",
          className ?? "",
        ].join(" ")
      }
    >
      <DesktopPill
        count={count}
        noun={noun}
        actions={actions}
        onClear={onClear}
        busy={busy}
        firstActionRef={firstActionRef}
        testId={testId ? `${testId}-pill` : undefined}
      />
      {mobileLayout === "sheet" && (
        <MobileSheet
          count={count}
          noun={noun}
          actions={actions}
          onClear={onClear}
          busy={busy}
          firstActionRef={firstActionRef}
          testId={testId ? `${testId}-sheet` : undefined}
        />
      )}
    </div>
  );

  if (target === null) return content;
  return createPortal(content, target);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(el: HTMLElement): boolean {
  if (EDITABLE_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function findShortcutMatch(
  actions: SelectionAction[],
  e: KeyboardEvent,
): SelectionAction | null {
  for (const action of actions) {
    if (!action.shortcut) continue;
    if (action.disabled || action.busy || action.hidden) continue;
    const s = action.shortcut;
    if (s.key.toLowerCase() !== e.key.toLowerCase()) continue;
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    if (Boolean(s.ctrl)  !== ctrl)       continue;
    if (Boolean(s.shift) !== e.shiftKey) continue;
    if (Boolean(s.alt)   !== e.altKey)   continue;
    return action;
  }
  return null;
}

function resolvePortalTarget(
  override: HTMLElement | null | undefined,
): HTMLElement | null {
  // `null` explicitly opts out of portaling (useful for tests).
  if (override === null) return null;
  if (override) return override;
  if (typeof document === "undefined") return null;
  return document.body;
}
