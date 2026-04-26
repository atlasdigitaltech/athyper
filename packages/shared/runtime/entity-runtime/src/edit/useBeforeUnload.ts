"use client";

import { useEffect } from "react";

/**
 * Activates the browser's native "Leave site?" prompt when isDirty is true.
 * Cleans up automatically when isDirty becomes false or the component unmounts.
 *
 * Note: modern browsers show a generic message regardless of returnValue.
 */
export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
