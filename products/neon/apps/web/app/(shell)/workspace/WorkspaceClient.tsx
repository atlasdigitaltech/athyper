"use client";

import { Command } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type Workbench } from "@/lib/auth/types";
import { WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";

const LAST_WB_KEY = "neon_last_workbench";

interface WorkspaceClientProps {
  resolutionState: "pending" | "resolved";
  currentWorkbench: string | null;
  allowedWorkbenches: Workbench[];
  csrfToken: string;
}

/**
 * Workspace chooser / switcher (C.5)
 *
 * pending  → "Choose your workspace"  — required, no cancel
 * resolved → "Switch workspace"       — optional, shows current workbench highlighted
 *
 * Card click calls POST /api/auth/session/workbench (C.2).
 * C.6: writes localStorage.neon_last_workbench only after server confirms success.
 */
export default function WorkspaceClient({
  resolutionState,
  currentWorkbench,
  allowedWorkbenches,
  csrfToken,
}: WorkspaceClientProps) {
  const [loading, setLoading] = useState<Workbench | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = resolutionState === "pending";

  async function activateWorkbench(wb: Workbench) {
    setLoading(wb);
    setError(null);

    try {
      const res = await fetch("/api/auth/session/workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ workbench: wb }),
      });

      const data = (await res.json()) as { success?: boolean; redirect?: string; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to activate workspace. Please try again.");
        setLoading(null);
        return;
      }

      // C.6: write only after server confirms success — never optimistic
      localStorage.setItem(LAST_WB_KEY, wb);

      // Hard navigate so the session state (workbench + resolution state) is
      // re-read from Redis on the next page load.
      window.location.href = data.redirect ?? `/wb/${wb}/home`;
    } catch {
      setError("Network error. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Command className="size-6" />
            <span className="text-lg font-semibold">Neon</span>
          </div>
          <h2 className="text-xl font-medium">
            {isPending ? "Choose your workspace" : "Switch workspace"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPending
              ? "Select a workspace to continue."
              : currentWorkbench
              ? `You are currently in the ${WORKBENCH_CONFIGS[currentWorkbench as Workbench]?.label ?? currentWorkbench} workspace.`
              : "Select a workspace."}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <div className="grid gap-3">
          {allowedWorkbenches.map((wb) => {
            const config = WORKBENCH_CONFIGS[wb];
            const isCurrent = wb === currentWorkbench;
            const isLoading = loading === wb;

            return (
              <Button
                key={wb}
                variant={isCurrent ? "default" : "outline"}
                className="h-auto flex-col items-start p-4 text-left"
                onClick={() => activateWorkbench(wb)}
                disabled={loading !== null}
              >
                <span className="text-sm font-medium">
                  {config.label}
                  {isCurrent && !isPending && (
                    <span className="ml-2 text-xs opacity-70">(current)</span>
                  )}
                </span>
                <span className="text-xs opacity-70">{config.description}</span>
                {isLoading && (
                  <span className="text-xs opacity-60 mt-1">Activating&hellip;</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
