"use client";

/**
 * ThemeProvider — syncs PreferencesStore to the DOM on app boot.
 *
 * Handles:
 *   - System dark-mode detection and initial sync
 *   - `prefers-color-scheme` media query change listener
 *   - Renders nothing — purely a DOM sync side-effect component
 *
 * Must be mounted inside QueryProvider but outside SessionProvider so
 * theme is applied before any shell chrome renders.
 */

import { useEffect } from "react";
import { usePreferencesStore } from "@/stores/preferences/usePreferencesStore";

export function ThemeProvider() {
  const { appearanceMode, seedFromBootstrap, setResolvedAppearanceMode } =
    usePreferencesStore();

  // Seed with defaults on first mount (no server profile yet).
  // When a user logs in and the session contains uiProfile, call
  // seedFromBootstrap(uiProfile) again from SessionProvider.
  useEffect(() => {
    usePreferencesStore.getState().seedFromBootstrap({});
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
