"use client";

// packages/shared/identity-gate/src/RequiredActionBanner.tsx
//
// Phase A — Sticky banner for pending KC required-actions.
//
// Surfaces inline at the top of any layout that wants to nudge users to
// complete VERIFY_EMAIL / UPDATE_PASSWORD / CONFIGURE_TOTP before the actions
// start blocking sensitive routes (per the AUTH_REQUIRED_ACTIONS_MATRIX).
//
// Consumes the same contract as the dispatcher; no toast or navigation
// happens implicitly — the host wires onComplete to its own router or to
// a hard nav for the most reliable behavior.

import type { ReactNode } from "react";

const ACTION_LABEL: Record<string, string> = {
  UPDATE_PASSWORD: "Change your password",
  VERIFY_EMAIL: "Verify your email",
  CONFIGURE_TOTP: "Set up two-factor authentication",
  UPDATE_PROFILE: "Update your profile",
  CONFIGURE_RECOVERY_AUTHN_CODES: "Save backup codes",
};

function readableLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ").toLowerCase();
}

export interface RequiredActionBannerProps {
  /** List of pending KC required-actions (from session.requiredActions). */
  readonly actions: readonly string[];
  /**
   * Called when the user clicks the "Complete now" button. Host should
   * navigate to /account/complete-action?action=<action>&returnUrl=<current>.
   */
  readonly onComplete: (action: string) => void;
  /** Optional dismiss action — when present, banner shows an X. */
  readonly onDismiss?: () => void;
  /** Optional override for the rendered headline. */
  readonly title?: ReactNode;
}

export function RequiredActionBanner({
  actions,
  onComplete,
  onDismiss,
  title,
}: RequiredActionBannerProps): ReactNode {
  if (actions.length === 0) return null;

  const primary = actions[0]!;
  const primaryLabel = readableLabel(primary);
  const extra = actions.length > 1 ? actions.length - 1 : 0;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex w-full items-start gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
    >
      <span aria-hidden className="mt-0.5 size-2 shrink-0 rounded-full bg-warning" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {title ?? "Action required to keep your account active"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {primaryLabel}
          {extra > 0 ? ` and ${extra} more pending action${extra > 1 ? "s" : ""}.` : "."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onComplete(primary)}
        className="shrink-0 rounded-md border border-warning/60 bg-warning/20 px-3 py-1 text-xs font-medium hover:bg-warning/30"
      >
        Complete now
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          {/* simple × character avoids depending on an icon set here */}
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}
