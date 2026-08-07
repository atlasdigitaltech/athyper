"use client";

// Phase I — App-scoped slot for the shared RequiredActionBanner.
//
// Server `layout.tsx` reads `session.requiredActions` and renders this slot
// inside `AppShellClient`. The slot supplies the navigation handler so the
// shared banner stays UI-only.

import { useCallback } from "react";
import { RequiredActionBanner } from "@athyper/platform-iam-identity-gate";

export function RequiredActionBannerSlot({ actions }: { actions: readonly string[] }) {
  const onComplete = useCallback((action: string) => {
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
    const href =
      `/account/complete-action?action=${encodeURIComponent(action)}`
      + `&returnUrl=${encodeURIComponent(returnUrl)}`;
    if (typeof window !== "undefined") window.location.assign(href);
  }, []);

  return <RequiredActionBanner actions={actions} onComplete={onComplete} />;
}
