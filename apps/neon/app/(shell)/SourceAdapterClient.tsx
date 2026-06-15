"use client";

import { useMemo, type ReactNode } from "react";
import {
  SourceAdapterRegistryProvider,
  createGlitchTipTelemetryListener,
} from "@athyper/runtime-add-item";
import { createNeonSourceAdapters } from "@/lib/source-adapters";

// ─────────────────────────────────────────────────────────────────────────────
// Mounts the neon SourceAdapterRegistry into the React tree. Built lazily on
// first render so SSR doesn't construct the registry (it's pure client state).
// Lives below AppShellClient inside the shell layout so every authenticated
// route has access to the registry.
//
// Telemetry wiring: every framework event is routed to GlitchTip via the
// shared bridge. The bridge gracefully degrades to console.debug when no
// browser Sentry SDK is loaded — see lib/source-adapters-telemetry.ts for
// the install instructions.
// ─────────────────────────────────────────────────────────────────────────────

export function SourceAdapterClient({ children }: { children: ReactNode }) {
  const { registry } = useMemo(
    () =>
      createNeonSourceAdapters({
        telemetryListener: createGlitchTipTelemetryListener(),
      }),
    [],
  );
  return (
    <SourceAdapterRegistryProvider registry={registry}>
      {children}
    </SourceAdapterRegistryProvider>
  );
}
