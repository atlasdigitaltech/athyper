"use client";

/**
 * SessionExpiredDialog
 *
 * Shown as a blocking modal when the user's access token has expired or is
 * invalid (INVALID_TOKEN / MISSING_TOKEN error codes).
 *
 * UX design:
 *  - Full-screen backdrop — user cannot interact with the app until resolved.
 *  - 30-second countdown with auto-redirect to the login page.
 *  - "Sign in again" — immediate redirect, preserves current URL as returnUrl.
 *  - "Stay on page" — dismisses the modal; a lightweight banner replaces it
 *    so the user can note anything before manually signing in.
 *
 * The returnUrl is passed to /api/auth/login so Keycloak redirects the user
 * back to the exact page they were on after successful re-authentication.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@athyper/theme/utils";
import { overlayScrimVariants } from "@athyper/ui/primitives";
import { DEFAULT_PUBLIC_SESSION_POLICY } from "@/lib/auth/session-policy";

const COUNTDOWN_SECONDS = DEFAULT_PUBLIC_SESSION_POLICY.sessionExpiredRedirectCountdownSeconds;

interface SessionExpiredDialogProps {
  /** Called when the user clicks "Stay on page" — parent switches to banner. */
  onStay: () => void;
  countdownSeconds?: number;
}

export function SessionExpiredDialog({ onStay, countdownSeconds = COUNTDOWN_SECONDS }: SessionExpiredDialogProps) {
  const totalSeconds = Math.max(1, Math.ceil(countdownSeconds));
  const [seconds, setSeconds] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildLoginUrl = useCallback(() => {
    const returnUrl =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    return `/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`;
  }, []);

  const signInNow = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.location.href = buildLoginUrl();
  }, [buildLoginUrl]);

  // Countdown — auto-redirect when it reaches 0
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          window.location.href = buildLoginUrl();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [buildLoginUrl]);

  // Circumference for SVG progress ring
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = ((totalSeconds - seconds) / totalSeconds) * circumference;

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        overlayScrimVariants({ tone: "modal" }),
      )}
    >
      {/* Panel */}
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-card shadow-2xl">

        {/* Top accent strip */}
        <div className="h-1.5 w-full rounded-t-2xl bg-warning" />

        <div className="px-8 pb-8 pt-6">

          {/* Icon + countdown ring */}
          <div className="flex justify-center mb-5">
            <div className="relative h-16 w-16">
              {/* Countdown ring */}
              <svg
                className="-rotate-90 h-16 w-16"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                {/* Track */}
                <circle
                  cx="24" cy="24" r={radius}
                  fill="none"
                  strokeWidth="3"
                  className="stroke-border"
                />
                {/* Progress */}
                <circle
                  cx="24" cy="24" r={radius}
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - progress}
                  className="stroke-warning transition-[stroke-dashoffset] duration-1000 ease-linear"
                />
              </svg>
              {/* Lock icon centred inside the ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="h-7 w-7 text-warning"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Heading */}
          <h2
            id="session-expired-title"
            className="text-center text-lg font-semibold text-foreground"
          >
            Your session has expired
          </h2>

          {/* Body */}
          <p
            id="session-expired-desc"
            className="mt-2 text-center text-sm text-muted-foreground"
          >
            For your security, you were signed out after a period of inactivity.
            Sign in again to continue where you left off.
          </p>

          {/* Countdown */}
          <p
            aria-live="polite"
            aria-atomic="true"
            className="mt-4 text-center text-xs text-muted-foreground/70"
          >
            Redirecting to sign-in in{" "}
            <span className="font-semibold tabular-nums text-foreground/70">
              {seconds}s
            </span>
          </p>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={signInNow}
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign in again
            </button>

            <button
              type="button"
              onClick={() => {
                if (intervalRef.current) clearInterval(intervalRef.current);
                onStay();
              }}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/60"
            >
              Stay on page
            </button>
          </div>

          {/* Fine print */}
          <p className="mt-4 text-center text-xs text-muted-foreground/50">
            Your work is safe. You will be returned to this page after signing in.
          </p>
        </div>
      </div>
    </div>
  );
}
