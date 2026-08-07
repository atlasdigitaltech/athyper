"use client";

// packages/shared/platform-auth/identity-gate/src/authFailurePage.tsx
//
// Phase A â€” Full-page screen for fatal auth failures.
//
// Used by:
//   - the global error boundary when an ApiError carries a fatal-severity code
//   - the /account/auth-error route mounted in each app
//   - server pages that catch a SESSION_* failure from validatePlaneServerSession
//
// Shows the user-friendly message + correlation id, the primary CTA, and a
// secondary "Sign out" fallback so the user can always escape a stuck state.

import type { ReactNode } from "react";
import {
  authFailurePresentation,
  resolveAuthFailureHref,
  type AuthFailureCode,
} from "@athyper/platform-iam-auth-bff/error-codes";

export interface AuthFailurePageProps {
  readonly code: AuthFailureCode;
  /** Correlation id (server requestId) â€” shown only when `showCorrelationId`. */
  readonly requestId?: string;
  /** Plane-root for href interpolation; pass `""` for root-mounted apps. */
  readonly planeRoot?: string;
  /** Optional return-url override. */
  readonly returnUrl?: string;
  /** Logout fallback href; defaults to `${planeRoot}/logout`. */
  readonly logoutHref?: string;
  /** Optional logo or product icon. */
  readonly brandSlot?: ReactNode;
}

export function AuthFailurePage({
  code,
  requestId,
  planeRoot = "",
  returnUrl = "/",
  logoutHref,
  brandSlot,
}: AuthFailurePageProps): ReactNode {
  const presentation = authFailurePresentation(code);
  if (!presentation) {
    return (
      <FallbackScreen
        title="Something went wrong."
        message="Please refresh the page or sign in again."
        primary={{ label: "Sign in", href: `${planeRoot}/login` }}
      />
    );
  }

  const actionHref = presentation.action
    ? resolveAuthFailureHref(presentation.action.href, { planeRoot, returnUrl })
    : null;
  const logout = logoutHref ?? `${planeRoot}/logout`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        {brandSlot && <div className="mb-6 flex justify-center">{brandSlot}</div>}
        <h1 className="text-lg font-semibold text-foreground">{presentation.message}</h1>
        {presentation.description && (
          <p className="mt-2 text-sm text-muted-foreground">{presentation.description}</p>
        )}
        {presentation.showCorrelationId && requestId && (
          <p className="mt-4 text-xs text-muted-foreground">
            Reference: <span className="font-mono">{requestId}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {actionHref && presentation.action && (
            <a
              href={actionHref}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {presentation.action.label}
            </a>
          )}
          <a
            href={logout}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Sign out
          </a>
        </div>
      </div>
    </main>
  );
}

function FallbackScreen({
  title,
  message,
  primary,
}: {
  title: string;
  message: string;
  primary: { label: string; href: string };
}): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <a
          href={primary.href}
          className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {primary.label}
        </a>
      </div>
    </main>
  );
}


