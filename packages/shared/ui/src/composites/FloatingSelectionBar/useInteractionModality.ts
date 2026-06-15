"use client";

import { useEffect, useRef } from "react";

/**
 * Tracks whether the user's last interaction was via keyboard or pointer.
 *
 * Used by FloatingSelectionBar to decide whether to auto-focus the first
 * action when the bar opens: stealing focus from a table the user is
 * clicking around in is annoying, but a keyboard user who just pressed
 * Space to select a row expects focus to move to the action bar.
 *
 * Returns a ref that always reads the latest modality — call sites read it
 * inside effects without re-rendering on every input event.
 */
export function useInteractionModality(): React.RefObject<"keyboard" | "pointer"> {
  const ref = useRef<"keyboard" | "pointer">("pointer");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === " " || e.key === "Enter" || e.key.startsWith("Arrow")) {
        ref.current = "keyboard";
      }
    };
    const onPointer = () => { ref.current = "pointer"; };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);

  return ref;
}
