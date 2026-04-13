"use client";

/**
 * DelegationBanner
 *
 * Shown when the current session has delegations_available but no active_delegation.
 * Lists each available delegation with:
 *   - Delegator name + persona
 *   - Permissions summary
 *   - Expiry date
 *   - "Act as {name}" button → calls activateDelegation(delegation_id)
 *
 * Dismissible per-session (stored in component state; re-appears on reload).
 * Hidden when active_delegation is set (DelegationIndicator takes over).
 */

import { useState } from "react";
import { Button } from "@athyper/ui/primitives";
import { useShellSession } from "@/components/providers/SessionProvider";

export function DelegationBanner() {
  const { runtime, activateDelegation } = useShellSession();
  const [dismissed, setDismissed] = useState(false);

  // Don't render if no runtime session yet, no delegations, or already active
  if (
    !runtime ||
    runtime.delegations_available.length === 0 ||
    runtime.active_delegation ||
    dismissed
  ) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Available delegations"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900/40 dark:bg-amber-950/30"
    >
      <div className="mx-auto flex max-w-screen-2xl items-start gap-3">
        {/* Icon */}
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
          />
        </svg>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {runtime.delegations_available.length === 1
              ? "You have an active delegation available"
              : `You have ${runtime.delegations_available.length} delegations available`}
          </p>

          <ul className="mt-2 space-y-2">
            {runtime.delegations_available.map((d) => {
              const expiresDate = new Date(d.expires_at);
              const daysLeft = Math.ceil(
                (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              );

              return (
                <li
                  key={d.delegation_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    <span className="font-medium">{d.delegator_name}</span>
                    {d.delegator_persona !== "default" && (
                      <span className="ml-1 text-xs opacity-70">
                        ({d.delegator_persona})
                      </span>
                    )}
                  </span>

                  {d.permissions.length > 0 && (
                    <span className="text-xs text-amber-600/80 dark:text-amber-500/80">
                      {d.permissions.slice(0, 3).join(", ")}
                      {d.permissions.length > 3 && ` +${d.permissions.length - 3} more`}
                    </span>
                  )}

                  <span className="text-xs text-amber-600/60 dark:text-amber-500/60">
                    {daysLeft === 1 ? "expires tomorrow" : `expires in ${daysLeft}d`}
                  </span>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    onClick={() => activateDelegation(d.delegation_id)}
                  >
                    Act as {d.delegator_name.split(" ")[0]}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          aria-label="Dismiss delegation banner"
          className="shrink-0 text-amber-500 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-300"
          onClick={() => setDismissed(true)}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
