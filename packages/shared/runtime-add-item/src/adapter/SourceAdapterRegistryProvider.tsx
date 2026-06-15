"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SourceAdapterRegistry } from "./registry";

// ─────────────────────────────────────────────────────────────────────────────
// SourceAdapterRegistryProvider — supplies a SourceAdapterRegistry through
// React context so deep-nested consumers (LinesGrid, picker chooser, etc.)
// don't each need a registry prop wired down through the tree.
//
// Apps mount one registry at boot (typically in apps/<app>/lib/source-adapters
// or similar), register all adapters with their backend fetchItems / checkLive
// callbacks, then wrap the app root with this provider.
//
// `useOptionalSourceAdapterRegistry()` returns null when no provider is
// mounted — consumers should treat null as "no registry available; degrade
// to a baseline behavior (e.g. manual-only)". `useSourceAdapterRegistry()`
// throws if called outside the provider — use this in components that
// strictly require the registry.
// ─────────────────────────────────────────────────────────────────────────────

const SourceAdapterRegistryContext = createContext<SourceAdapterRegistry | null>(null);

export interface SourceAdapterRegistryProviderProps {
  registry: SourceAdapterRegistry;
  children: ReactNode;
}

export function SourceAdapterRegistryProvider({
  registry,
  children,
}: SourceAdapterRegistryProviderProps) {
  return (
    <SourceAdapterRegistryContext.Provider value={registry}>
      {children}
    </SourceAdapterRegistryContext.Provider>
  );
}

/**
 * Throws if no provider is mounted. Use in components that strictly require
 * the registry to function.
 */
export function useSourceAdapterRegistry(): SourceAdapterRegistry {
  const ctx = useContext(SourceAdapterRegistryContext);
  if (!ctx) {
    throw new Error(
      "useSourceAdapterRegistry must be used inside <SourceAdapterRegistryProvider>. " +
        "Wrap your app at the layout level.",
    );
  }
  return ctx;
}

/**
 * Returns null when no provider is mounted. Use in components that gracefully
 * degrade (e.g. LinesGrid falls back to manual-only when there's no registry).
 */
export function useOptionalSourceAdapterRegistry(): SourceAdapterRegistry | null {
  return useContext(SourceAdapterRegistryContext);
}
