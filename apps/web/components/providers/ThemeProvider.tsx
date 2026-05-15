"use client";

/**
 * ThemeProvider — applies preference defaults to the DOM on app boot.
 *
 * Responsibilities:
 *   - Seed PreferencesStore with built-in defaults so first paint isn't blank
 *   - Track `prefers-color-scheme` changes when appearance mode = "system"
 *
 * The user's persisted prefs (master.principal_ui_profile) are hydrated by
 * PreferencesHydrator, mounted inside SessionProvider — that's where we have
 * access to bff.activeOrg, which the runtime needs to resolve the row. Doing
 * the fetch here would race with org selection and silently return PREFS_EMPTY.
 *
 * Must be mounted inside QueryProvider but outside SessionProvider so theme
 * is applied before any shell chrome renders.
 */

import { useEffect } from "react";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";

export function ThemeProvider() {
  const { appearanceMode, setResolvedAppearanceMode } = usePreferencesStore();

  // Seed with the preset already present on <html> so a cookie-restored hard
  // refresh is not immediately overwritten by client defaults. The user's
  // persisted prefs are then hydrated by PreferencesHydrator (inside
  // SessionProvider, where bff.activeOrg is available).
  useEffect(() => {
    usePreferencesStore.getState().seedFromBootstrap({
      themePreset: document.documentElement.dataset.themePreset,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track system color scheme changes when mode = "system"
  useEffect(() => {
    if (appearanceMode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function onChange(e: MediaQueryListEvent) {
      setResolvedAppearanceMode(e.matches ? "dark" : "light");
    }

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearanceMode, setResolvedAppearanceMode]);

  return null;
}
