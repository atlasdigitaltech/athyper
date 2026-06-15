"use client";

import { useEffect } from "react";
import { applyThemePreferences } from "@/lib/preferences/theme-dom";

export function PreferencesDomHydrator() {
  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/me/preferences", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<Record<string, unknown>> : null))
      .then((profile) => {
        if (!profile) return;
        applyThemePreferences(profile);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  return null;
}
