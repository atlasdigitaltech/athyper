"use client";

/**
 * PreferencesHydrator — pulls the user's saved UI prefs into the Zustand store
 * after the BFF session knows which org is active.
 *
 * Why this exists separately from ThemeProvider:
 *   ThemeProvider lives in the root layout (outside SessionProvider) so the
 *   first paint is unblocked. Its fetch fires once on mount, but at that point
 *   bff.activeOrg may not yet be set in Redis (e.g. just-landed from
 *   /auth/select via router.replace), so the runtime returns PREFS_EMPTY.
 *   This component re-fetches whenever activeOrg becomes available or changes,
 *   guaranteeing the saved theme/density/appearance is applied without needing
 *   a full page refresh.
 */

import { useEffect, useRef } from "react";
import { useShellSession } from "@/components/providers/SessionProvider";
import { normalizeLanguageCode } from "@/lib/preferences/ui-profile";
import {
  usePreferencesStore,
  type AppearanceMode,
  type DensityCode,
} from "@/stores/preferences/usePreferencesStore";

export function PreferencesHydrator() {
  const { bff } = useShellSession();
  const lastFetchedOrg = useRef<string | null>(null);

  useEffect(() => {
    const org = bff.activeOrg;
    if (!org || lastFetchedOrg.current === org) return;
    lastFetchedOrg.current = org;

    const ac = new AbortController();
    fetch("/api/user/preferences", { signal: ac.signal, credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d: Record<string, unknown> | null) => {
        if (!d) return;
        const meta = (d["metadata"] ?? {}) as Record<string, unknown>;
        const store = usePreferencesStore.getState();
        if (d["appearance_mode"]) {
          store.setAppearanceMode(String(d["appearance_mode"]) as AppearanceMode);
        }
        if (d["density_code"]) {
          store.setDensityCode(String(d["density_code"]) as DensityCode);
        }
        if (meta["theme_preset"]) {
          store.setThemePreset(String(meta["theme_preset"]) as Parameters<typeof store.setThemePreset>[0]);
        }
        const nextLocale = normalizeLanguageCode(d["language_code"]);
        if (nextLocale) {
          store.setLanguageCode(nextLocale);
        }
      })
      .catch(() => { /* aborted, offline, or 401 — defaults stay */ });

    return () => ac.abort();
  }, [bff.activeOrg]);

  return null;
}
