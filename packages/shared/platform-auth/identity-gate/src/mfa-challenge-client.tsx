"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlaneKey } from "@athyper/session-plane";

import {
  AuthCard,
  AuthShell,
  ErrorBanner,
  LoadingState,
  PrimaryAction,
  SecondaryAction,
} from "./components";
import { csrfHeaders } from "./csrf";
import { authErrorMessage } from "./errors";
import type { BrowserLocationSnapshot } from "./types";
import { sanitizeAuthFlowContinuation } from "./url";

export function MfaChallengeClient({ plane }: { plane: PlaneKey }) {
  const [location, setLocation] = useState<BrowserLocationSnapshot | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }, []);

  const continuation = useMemo(() => {
    if (!location) return "/auth/select";
    const params = new URLSearchParams(location.search);
    return sanitizeAuthFlowContinuation(params.get("returnUrl"), "/auth/select");
  }, [location]);

  if (!location) {
    return <LoadingState plane={plane} message="Preparing verification..." />;
  }

  async function submit() {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders(plane) },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? authErrorMessage(body.error) ?? "Verification failed.");
      }
      window.location.replace(continuation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      plane={plane}
      title="Verify sign in"
      subtitle={plane === "admin" ? "Admin access requires step-up verification." : "Enter your verification code to continue."}
      variant="compact"
    >
      <AuthCard>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ErrorBanner message={error} />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mfa-code">
              Verification code
            </label>
            <input
              autoComplete="one-time-code"
              className="h-11 w-full rounded-md border bg-background px-3 text-center font-mono text-lg font-medium outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/15"
              disabled={submitting}
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              pattern="[0-9]{6}"
              placeholder="000000"
              value={code}
            />
          </div>
          <PrimaryAction disabled={submitting} type="submit">
            {submitting ? "Verifying..." : "Verify"}
          </PrimaryAction>
          <SecondaryAction disabled={submitting} href="/logout">
            Cancel sign in
          </SecondaryAction>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
