"use client";

/**
 * SessionErrorBanner + SessionExpiredDialog orchestrator
 *
 * Shown when the runtime session fetch fails after entity context is set.
 * Error codes are mapped to three distinct UX treatments:
 *
 *  auth     (INVALID_TOKEN, MISSING_TOKEN)
 *    → SessionExpiredDialog — blocking modal with 30s countdown + "Sign in" CTA.
 *      "Stay on page" collapses it to a persistent banner with a login link.
 *
 *  infra    (SERVICE_UNAVAILABLE, NETWORK_ERROR, SESSION_STORE_UNAVAILABLE,
 *            INTERNAL_ERROR, RUNTIME_ERROR)
 *    → Amber banner with a "Retry" button — re-fetches runtime without reload.
 *
 *  access   (PRINCIPAL_NOT_FOUND, PRINCIPAL_DISABLED, ORG_NOT_IN_TOKEN,
 *            WORKBENCH_NOT_ALLOWED, ENTITY_NOT_FOUND, TENANT_*)
 *    → Red banner with contextual action (Switch entity / Contact admin).
 *
 * Dismissible:  infra + access banners — per-mount, resets on error change.
 * Non-dismissible: auth banner (user MUST sign in or acknowledge).
 */

import { useState } from "react";
import { useShellSession } from "@/components/providers/SessionProvider";
import { SessionExpiredDialog } from "@/components/shell/SessionExpiredDialog";

// ─── Error classification ──────────────────────────────────────────────────────

type ErrorTreatment = "auth" | "infra" | "access";

const ERROR_META: Record<
  string,
  { title: string; detail: string; treatment: ErrorTreatment }
> = {
  // ── Auth / token errors → modal ───────────────────────────────────────────
  INVALID_TOKEN: {
    title: "Session expired",
    detail: "Your session has expired. Please sign in again to continue.",
    treatment: "auth",
  },
  MISSING_TOKEN: {
    title: "Authentication required",
    detail: "No active session found. Please sign in.",
    treatment: "auth",
  },

  // ── Infrastructure / outage errors → warning banner + Retry ──────────────
  NETWORK_ERROR: {
    title: "Platform service unreachable",
    detail: "The platform service could not be reached.",
    treatment: "infra",
  },
  SERVICE_UNAVAILABLE: {
    title: "Platform service temporarily unavailable",
    detail: "A backend service is temporarily down.",
    treatment: "infra",
  },
  SESSION_STORE_UNAVAILABLE: {
    title: "Session store unavailable",
    detail: "The session service is temporarily unavailable.",
    treatment: "infra",
  },
  INTERNAL_ERROR: {
    title: "Unexpected server error",
    detail: "Something went wrong on the server.",
    treatment: "infra",
  },
  RUNTIME_ERROR: {
    title: "Session could not be loaded",
    detail: "The platform session failed to load.",
    treatment: "infra",
  },

  // ── Access / identity errors → error banner + contextual action ───────────
  PRINCIPAL_NOT_FOUND: {
    title: "Account not set up for this entity",
    detail: "Your account has not been configured in this entity.",
    treatment: "access",
  },
  PRINCIPAL_DISABLED: {
    title: "Account disabled",
    detail: "Your account has been deactivated.",
    treatment: "access",
  },
  ENTITY_NOT_FOUND: {
    title: "Entity not found",
    detail: "The selected entity could not be found.",
    treatment: "access",
  },
  TENANT_NOT_FOUND: {
    title: "Tenant not found",
    detail: "The platform tenant could not be resolved.",
    treatment: "access",
  },
  TENANT_INACTIVE: {
    title: "Tenant suspended",
    detail: "This tenant has been suspended.",
    treatment: "access",
  },
  ORG_NOT_IN_TOKEN: {
    title: "Access not authorised",
    detail: "You do not have access to this entity.",
    treatment: "access",
  },
  WORKBENCH_NOT_ALLOWED: {
    title: "Workbench not allowed",
    detail: "You do not have permission to access this workbench.",
    treatment: "access",
  },
};

// ─── Icon components ──────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Dismiss" onClick={onClick} className="shrink-0 opacity-60 hover:opacity-100">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

// ─── Action helpers ───────────────────────────────────────────────────────────

function loginUrl() {
  const returnUrl =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
  return `/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionErrorBanner() {
  const { runtimeError, runtimeLoading, bff, retryRuntime, sessionPolicy } = useShellSession();

  // "Stay on page" converts the auth modal to a collapsed banner
  const [stayedOnPage, setStayedOnPage] = useState(false);
  // Dismissed state for infra/access banners; also used for auth banner after "stay on page"
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Retry loading state
  const [retrying, setRetrying] = useState(false);

  if (!bff.activeOrg || runtimeLoading || !runtimeError) return null;

  const meta = ERROR_META[runtimeError.code] ?? {
    title: "Session error",
    detail: runtimeError.message,
    treatment: "access" as ErrorTreatment,
  };

  const errorKey = `${runtimeError.code}:${bff.activeOrg}`;

  // ── Auth treatment: modal (unless user chose "stay on page") ─────────────
  if (meta.treatment === "auth" && !stayedOnPage) {
    return (
      <SessionExpiredDialog
        countdownSeconds={sessionPolicy.sessionExpiredRedirectCountdownSeconds}
        onStay={() => setStayedOnPage(true)}
      />
    );
  }

  // ── After "stay on page": dismissible banner with sign-in link
  if (meta.treatment === "auth" && stayedOnPage) {
    if (dismissed === errorKey) return null;
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="border-b border-warning/30 bg-warning/10 px-4 py-2"
      >
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3">
          <LockIcon />
          <p className="min-w-0 flex-1 text-sm text-warning">
            <span className="font-medium">Session expired.</span>{" "}
            <a
              href={loginUrl()}
              className="underline underline-offset-2 hover:text-warning"
            >
              Sign in again
            </a>{" "}
            to continue where you left off.
          </p>
          <CloseButton onClick={() => setDismissed(errorKey)} />
        </div>
      </div>
    );
  }

  // ── Infra treatment: warning banner + Retry ───────────────────────────────
  if (meta.treatment === "infra") {
    if (dismissed === errorKey) return null;
    return (
      <div
        role="alert"
        aria-live="polite"
        className="border-b border-warning/30 bg-warning/10 px-4 py-2"
      >
        <div className="mx-auto flex max-w-screen-2xl items-start gap-3">
          <WarningIcon />
          <div className="min-w-0 flex-1 text-warning">
            <span className="text-sm font-medium">{meta.title}. </span>
            <span className="text-xs opacity-80">{meta.detail}</span>
          </div>
          <button
            type="button"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              retryRuntime();
              // Give the fetch time to settle; runtimeLoading will hide banner during fetch
              await new Promise((r) => setTimeout(r, 500));
              setRetrying(false);
            }}
            className="shrink-0 rounded-md border border-warning/40 bg-card px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <CloseButton onClick={() => setDismissed(errorKey)} />
        </div>
      </div>
    );
  }

  // ── Access treatment: error banner + contextual action ────────────────────
  if (dismissed === errorKey) return null;

  const needsAdmin = [
    "PRINCIPAL_NOT_FOUND", "PRINCIPAL_DISABLED",
    "TENANT_NOT_FOUND", "TENANT_INACTIVE", "ORG_NOT_IN_TOKEN",
  ].includes(runtimeError.code);

  const canSwitchEntity = [
    "ENTITY_NOT_FOUND", "WORKBENCH_NOT_ALLOWED",
  ].includes(runtimeError.code);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-destructive/30 bg-destructive/10 px-4 py-2"
    >
      <div className="mx-auto flex max-w-screen-2xl items-start gap-3">
        <WarningIcon />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-destructive">{meta.title}</p>
          <p className="mt-0.5 text-xs text-destructive/80">
            {meta.detail}{" "}
            {needsAdmin && (
              <span>Contact your administrator to complete the setup.</span>
            )}
            {canSwitchEntity && (
              <button
                type="button"
                onClick={() => {
                  // Navigate to entity selection page
                  window.location.href = "/auth/select";
                }}
                className="ml-1 underline underline-offset-2 hover:text-destructive"
              >
                Switch entity
              </button>
            )}
          </p>
        </div>
        <CloseButton onClick={() => setDismissed(errorKey)} />
      </div>
    </div>
  );
}
