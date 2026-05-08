"use client";

import { Clock3, LogOut } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { overlayScrimVariants } from "@athyper/ui/primitives";

interface InactivityWarningDialogProps {
  secondsRemaining: number;
  pending: boolean;
  onContinue: () => void;
  onLogout: () => void;
}

export function InactivityWarningDialog({
  secondsRemaining,
  pending,
  onContinue,
  onLogout,
}: InactivityWarningDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-warning-title"
      aria-describedby="inactivity-warning-desc"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center px-4",
        overlayScrimVariants({ tone: "modal" }),
      )}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="h-1.5 bg-warning" />
        <div className="px-7 py-6">
          <div className="mb-5 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Clock3 className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>

          <h2
            id="inactivity-warning-title"
            className="text-center text-lg font-semibold text-foreground"
          >
            Still there?
          </h2>
          <p
            id="inactivity-warning-desc"
            className="mt-2 text-center text-sm leading-6 text-muted-foreground"
          >
            Your session will be locked because there has not been activity.
          </p>

          <p
            aria-live="polite"
            aria-atomic="true"
            className="mt-4 text-center text-xs text-muted-foreground/70"
          >
            Signing out in{" "}
            <span className="font-semibold tabular-nums text-foreground/80">
              {Math.max(secondsRemaining, 0)}s
            </span>
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onContinue}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-60"
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {pending ? "Checking session..." : "Continue session"}
            </button>
            <button
              type="button"
              onClick={onLogout}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
