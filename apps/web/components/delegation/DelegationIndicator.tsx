"use client";

/**
 * DelegationIndicator
 *
 * Topbar pill shown when active_delegation is set in the runtime session.
 * Displays: "Acting as {delegator_name}" with a × button to deactivate.
 *
 * Placement: inside the Topbar right section (passed as a slot prop).
 * Hidden when no active_delegation.
 */

import { useShellSession } from "@/components/providers/SessionProvider";

export function DelegationIndicator() {
  const { runtime, deactivateDelegation } = useShellSession();

  if (!runtime?.active_delegation) return null;

  const { delegator_name } = runtime.active_delegation;

  return (
    <div
      role="status"
      aria-label={`Acting as ${delegator_name}`}
      className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
    >
      {/* Person icon */}
      <svg
        className="h-3 w-3 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
        />
      </svg>

      <span>Acting as {delegator_name}</span>

      {/* Deactivate button */}
      <button
        type="button"
        aria-label="Stop acting as delegate"
        className="ml-0.5 rounded-full p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/60"
        onClick={() => deactivateDelegation()}
      >
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
