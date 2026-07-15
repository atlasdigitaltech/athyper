"use client";

import { createContext, useContext, type ReactNode } from "react";

// ─── Plane-agnostic types ─────────────────────────────────────────────────────

export interface MeUIBffFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type MeUIBffFetch = <T = unknown>(
  url: string,
  options?: MeUIBffFetchOptions,
) => Promise<T>;

/**
 * The minimal slice of plane session state that me-ui section components
 * need. Each plane (neon, mesh, admin) projects its own session shape
 * down to this shape when constructing the provider.
 */
export interface MeUISessionView {
  displayName: string;
  email: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

/**
 * Subset of MePreferences a theme applier needs. The full MePreferences shape
 * is broader (locale, timezone, navigation defaults); only the appearance bits
 * mutate DOM and therefore require a plane-specific applier.
 */
export interface MeUIThemePreferences {
  appearance_mode?: string | null;
  density_code?: string | null;
  theme_preset?: string | null;
  language_code?: string | null;
}

export type MeUIThemeApplier = (prefs: MeUIThemePreferences) => void;

export interface MeUIContextValue {
  bffFetch: MeUIBffFetch;
  session: MeUISessionView;
  /**
   * Optional plane-specific theme DOM applier. When provided, called by the
   * Preferences section after a successful save (and on initial load) so the
   * page reflects the user's appearance settings without a full reload.
   * When omitted, the appearance/density/theme/language controls still save
   * to the runtime but their DOM effect waits for the next page navigation.
   */
  applyThemePreferences?: MeUIThemeApplier;
}

const MeUIContext = createContext<MeUIContextValue | null>(null);

export interface MeUIProviderProps {
  bffFetch: MeUIBffFetch;
  session: MeUISessionView;
  applyThemePreferences?: MeUIThemeApplier;
  children: ReactNode;
}

export function MeUIProvider({ bffFetch, session, applyThemePreferences, children }: MeUIProviderProps) {
  return (
    <MeUIContext.Provider value={{ bffFetch, session, applyThemePreferences }}>
      {children}
    </MeUIContext.Provider>
  );
}

export function useMeUI(): MeUIContextValue {
  const ctx = useContext(MeUIContext);
  if (!ctx) {
    throw new Error(
      "useMeUI must be used inside <MeUIProvider>. " +
        "Wrap your settings page (or the subtree containing me-ui section components) with it.",
    );
  }
  return ctx;
}

