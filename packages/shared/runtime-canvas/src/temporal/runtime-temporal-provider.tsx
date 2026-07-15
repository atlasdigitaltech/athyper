"use client";

/**
 * Runtime temporal context — bridges user preferences (already wired via
 * RuntimeUserPreferencesProvider) and the company-code profile fetched by
 * useTemporalContext. Every DatePicker rendered inside a RuntimeEditForm
 * reads from this context.
 *
 * Why a wrapper? `useTemporalContext` from runtime-shared takes explicit
 * `user` and `tenant` inputs so it stays pure. The runtime-canvas form
 * already knows the user profile via existing context — this wrapper does
 * the plumbing once at the form root so RuntimeEditInput doesn't have to
 * keep calling preferences hooks.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useTemporalContext,
  useRuntimeUserPreferences,
  type ResolvedTemporalContext,
} from "@athyper/runtime-shared/preferences";

const RuntimeTemporalContext = createContext<ResolvedTemporalContext | null>(null);

export interface RuntimeTemporalProviderProps {
  /** Pulled from the record (e.g. record.company_code_id). Optional. */
  companyCodeId?: string | null;
  children: ReactNode;
}

export function RuntimeTemporalProvider({ companyCodeId, children }: RuntimeTemporalProviderProps) {
  const user = useRuntimeUserPreferences();
  const userProfile = useMemo(
    () => ({ locale: user.locale, timeZone: user.timeZone, dateFormat: user.dateFormat }),
    [user.locale, user.timeZone, user.dateFormat],
  );

  const { context } = useTemporalContext({
    companyCodeId: companyCodeId ?? null,
    user: userProfile,
    // Tenant profile flows through useRuntimeUserPreferences today — keeping
    // tenant null here means "user is the tenant fallback" (still correct
    // because runtime-shared's user resolver already includes tenant defaults).
    tenant: null,
  });

  return (
    <RuntimeTemporalContext.Provider value={context}>
      {children}
    </RuntimeTemporalContext.Provider>
  );
}

/**
 * Use the resolved temporal context inside a RuntimeEditForm.
 * Throws if called outside a provider — callers must opt in explicitly.
 */
export function useRuntimeTemporalContext(): ResolvedTemporalContext {
  const ctx = useContext(RuntimeTemporalContext);
  if (!ctx) {
    throw new Error(
      "useRuntimeTemporalContext must be used inside RuntimeTemporalProvider " +
        "(wrap your RuntimeEditForm body to enable locale-aware DatePicker).",
    );
  }
  return ctx;
}

/**
 * Non-throwing variant for components that may render outside a form context
 * (e.g. shared display components). Returns null when no provider is present.
 */
export function useRuntimeTemporalContextOptional(): ResolvedTemporalContext | null {
  return useContext(RuntimeTemporalContext);
}
