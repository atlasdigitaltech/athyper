"use client";

import { useEffect } from "react";
import type { PlaneKey } from "@athyper/platform-iam-session-plane";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";

import { LoadingState } from "./components";
import { waitForMinimumAuthTransition } from "./auth-transition-timing";
import { clearLastContext } from "./context-storage";
import { csrfHeaders } from "./csrf";

export function LogoutClient({ plane }: { plane: PlaneKey }) {
  const config = getPlaneConfig(plane);

  useEffect(() => {
    const controller = new AbortController();

    async function logout() {
      const transitionStartedAt = Date.now();
      clearLastContext(plane);
      let redirectTarget = config.loginPath;
      try {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          headers: csrfHeaders(plane),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { logoutUrl?: string };
        redirectTarget = data.logoutUrl ?? config.loginPath;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
      await waitForMinimumAuthTransition(transitionStartedAt);
      if (!controller.signal.aborted) window.location.assign(redirectTarget);
    }

    void logout();
    return () => controller.abort();
  }, [config.loginPath, plane]);

  return <LoadingState plane={plane} message="Signing out..." />;
}
