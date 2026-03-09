"use client";

import { Command } from "lucide-react";
import { useEffect, useRef } from "react";

const LAST_WB_KEY = "neon_last_workbench";

interface ResolvingClientProps {
  returnUrl: string | null;
}

/**
 * /auth/resolving — client handoff component (C.4)
 *
 * On mount:
 *   1. Reads localStorage.neon_last_workbench
 *   2. Calls POST /api/auth/resolve-workspace with { returnUrl, lastUsedWorkbench }
 *   3. Follows the server decision:
 *      - { redirect }               → hard navigate (session state changed)
 *      - { decision: "chooser_required" | "switch_required" } → /workspace
 *      - { decision: "denied" }     → show error, link to logout
 *
 * C.6: writes localStorage.neon_last_workbench only after server confirms
 * the final workbench (i.e. when it returns { redirect }). Never optimistic.
 */
export default function ResolvingClient({ returnUrl }: ResolvingClientProps) {
  const called = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke in dev
    if (called.current) return;
    called.current = true;

    async function resolve() {
      const lastUsedWorkbench = localStorage.getItem(LAST_WB_KEY) ?? undefined;

      let data: Record<string, unknown>;
      try {
        const res = await fetch("/api/auth/resolve-workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnUrl, lastUsedWorkbench }),
        });
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        // Network error — fall back to chooser
        window.location.href = "/workspace";
        return;
      }

      if (typeof data.redirect === "string") {
        // Server resolved to a specific workbench route.
        // C.6: extract workbench from redirect path and persist to localStorage.
        const match = data.redirect.match(/^\/wb\/([^/]+)\//);
        if (match?.[1]) {
          localStorage.setItem(LAST_WB_KEY, match[1]);
        }
        window.location.href = data.redirect;
        return;
      }

      if (
        data.decision === "chooser_required" ||
        data.decision === "switch_required"
      ) {
        window.location.href = "/workspace";
        return;
      }

      if (data.decision === "denied") {
        // Replace spinner with inline error — handled by state below
        const el = document.getElementById("resolving-denied");
        if (el) el.style.display = "block";
        const spinner = document.getElementById("resolving-spinner");
        if (spinner) spinner.style.display = "none";
        return;
      }

      // Unexpected response — fall back to workspace chooser
      window.location.href = "/workspace";
    }

    void resolve();
  }, [returnUrl]);

  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <Command className="size-6" />
          <span className="text-lg font-semibold">Neon</span>
        </div>

        {/* Spinner state */}
        <div id="resolving-spinner" className="space-y-3">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Setting up your workspace&hellip;
          </p>
        </div>

        {/* Denied state — hidden until resolver returns denied */}
        <div id="resolving-denied" className="hidden space-y-4">
          <p className="text-sm text-destructive">
            Your account does not have access to any workspace.
          </p>
          <a
            href="/api/auth/logout"
            className="text-sm underline text-muted-foreground hover:text-foreground"
          >
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}
