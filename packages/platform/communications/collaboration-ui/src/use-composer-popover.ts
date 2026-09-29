"use client";
import { useEffect, useEffectEvent, useState, type RefObject } from "react";

/** Native top-layer delivery escapes composer overflow; placement follows the visual viewport. */
export function useComposerPopover(root: RefObject<HTMLDetailsElement | null>, panel: RefObject<HTMLDivElement | null>, onOpen?: () => void) {
  const [open, setOpen] = useState(false);
  const opened = useEffectEvent(() => onOpen?.());
  useEffect(() => {
    const host = root.current, popup = panel.current;
    if (!host || !popup) return;
    const trigger = host.querySelector("summary")!;
    let frame = 0;
    const place = () => {
      if (!popup.matches(":popover-open")) return;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8, top = (viewport?.offsetTop ?? 0) + 8;
      const width = (viewport?.width ?? window.innerWidth) - 16;
      const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
      const anchor = trigger.getBoundingClientRect();
      const above = Math.max(0, anchor.top - top - 8), below = Math.max(0, bottom - anchor.bottom - 8);
      const up = above >= Math.min(280, popup.scrollHeight) || above >= below;
      Object.assign(popup.style, { position: "fixed", margin: "0", inset: "auto", boxSizing: "border-box", width: `${Math.min(340, width)}px`, maxHeight: `${Math.max(0, up ? above : below)}px`, overflowY: "auto" });
      const rect = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(left, Math.min(anchor.left, left + width - rect.width))}px`;
      popup.style.top = `${up ? Math.max(top, anchor.top - rect.height - 8) : anchor.bottom + 8}px`;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const toggle = () => {
      if (host.open) {
        if (!popup.matches(":popover-open")) { popup.showPopover(); place(); setOpen(true); opened(); }
      } else { if (popup.matches(":popover-open")) popup.hidePopover(); setOpen(false); }
    };
    const sync = () => { if (!popup.matches(":popover-open")) { host.open = false; setOpen(false); } };
    const focus = (event: FocusEvent) => { if (host.open && event.target instanceof Node && !host.contains(event.target)) { host.open = false; popup.hidePopover(); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && host.open) { event.preventDefault(); event.stopPropagation(); host.open = false; popup.hidePopover(); trigger.focus({preventScroll:true}); }
    };
    host.addEventListener("toggle", toggle); popup.addEventListener("toggle", sync);
    document.addEventListener("keydown", key, true); document.addEventListener("focusin", focus);
    window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule); window.visualViewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule); observer.observe(popup); observer.observe(trigger);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      host.removeEventListener("toggle", toggle); popup.removeEventListener("toggle", sync); document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus);
      window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [root, panel]);
  return open;
}
