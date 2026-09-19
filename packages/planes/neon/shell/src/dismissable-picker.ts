"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Outside click, Escape and a peer picker opening all dismiss and reset a details/summary picker. */
export function useDismissablePicker(
  details: RefObject<HTMLDetailsElement | null>,
  search: RefObject<HTMLInputElement | null>,
  reset: () => void,
) {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        details.current?.open &&
        !details.current.contains(event.target as Node)
      ) {
        details.current.open = false;
        resetRef.current();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current?.open) {
        event.preventDefault();
        details.current.open = false;
        resetRef.current();
        details.current.querySelector("summary")?.focus();
      }
    };
    const closeForPeer = (event: Event) => {
      if (
        details.current?.open &&
        (event as CustomEvent).detail !== details.current
      ) {
        details.current.open = false;
        resetRef.current();
      }
    };
    const toggle = () => {
      if (details.current?.open) {
        window.dispatchEvent(
          new CustomEvent("athyper:context-picker-open", {
            detail: details.current,
          }),
        );
        requestAnimationFrame(() => search.current?.focus());
      } else resetRef.current();
    };
    const element = details.current;
    element?.addEventListener("toggle", toggle);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("athyper:context-picker-open", closeForPeer);
    return () => {
      element?.removeEventListener("toggle", toggle);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("athyper:context-picker-open", closeForPeer);
    };
  }, [details, search]);
}
