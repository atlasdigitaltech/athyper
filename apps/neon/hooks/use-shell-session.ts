"use client";

import { useEffect, useState } from "react";

export interface ShellBff {
  displayName: string;
  email: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

interface SessionPayload {
  authenticated: true;
  displayName: string;
  email?: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

function isSession(v: unknown): v is SessionPayload {
  return (
    v != null &&
    typeof v === "object" &&
    (v as Record<string, unknown>)["authenticated"] === true
  );
}

const DEFAULT_BFF: ShellBff = {
  displayName: "—",
  email: "—",
  activeOrg: null,
  activeWorkbench: null,
};

export function useShellSession(): { bff: ShellBff } {
  const [bff, setBff] = useState<ShellBff>(DEFAULT_BFF);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!isSession(s)) return;
        setBff({
          displayName:    s.displayName ?? "—",
          email:          s.email ?? "—",
          activeOrg:      s.activeOrg,
          activeWorkbench: s.activeWorkbench,
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return { bff };
}
