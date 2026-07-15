"use client";

import { useEffect } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";

import { LoadingState } from "./components";
import { clearLastContext } from "./context-storage";
import { csrfHeaders } from "./csrf";

export function LogoutClient({ plane }: { plane: PlaneKey }) {
  const config = getPlaneConfig(plane);

  useEffect(() => {
    const controller = new AbortController();

    async function logout() {
      clearLastContext(plane);
      try {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
          headers: csrfHeaders(plane),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { logoutUrl?: string };
        window.location.assign(data.logoutUrl ?? config.loginPath);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        window.location.assign(config.loginPath);
      }
    }

    void logout();
    return () => controller.abort();
  }, [config.loginPath, plane]);

  return <LoadingState plane={plane} message="Signing out..." />;
}

