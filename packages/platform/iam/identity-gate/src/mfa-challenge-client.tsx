"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlaneKey } from "@athyper/platform-iam-session-plane";

import {
  AuthCard,
  AuthShell,
  ErrorBanner,
  LoadingState,
  PrimaryAction,
  SecondaryAction,
} from "./components";
import { useMinimumAuthReveal, waitForMinimumAuthTransition } from "./auth-transition-timing";
import { csrfHeaders } from "./csrf";
import type { BrowserLocationSnapshot } from "./types";
import { sanitizeAuthFlowContinuation } from "./url";

export function MfaChallengeClient({ plane }: { plane: PlaneKey }) {
  const [location, setLocation] = useState<BrowserLocationSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minimumRevealReady = useMinimumAuthReveal();

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

  async function submit() {
    const transitionStartedAt = Date.now();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders(plane) },
        body: JSON.stringify({ returnUrl: continuation }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; reauthenticate_url?: string };
        if (body.reauthenticate_url) {
          await waitForMinimumAuthTransition(transitionStartedAt);
          window.location.assign(body.reauthenticate_url);
          return;
        }
        throw new Error(body.message ?? "Keycloak verification could not be started.");
      }
      await waitForMinimumAuthTransition(transitionStartedAt);
      window.location.replace(continuation);
    } catch (err) {
      await waitForMinimumAuthTransition(transitionStartedAt);
      setError(err instanceof Error ? err.message : "Verification failed.");
      setSubmitting(false);
    }
  }

  if (!minimumRevealReady || !location || submitting) {
    return (
      <LoadingState
        plane={plane}
        message={submitting ? "Opening secure verification..." : "Preparing verification..."}
      />
    );
  }

  return (
    <AuthShell
      plane={plane}
      title="Verify sign in"
      subtitle={plane === "admin"
        ? "Admin access requires multi-factor authentication."
        : "Your organization requires additional verification."}
      variant="brand"
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
          <p className="text-sm text-muted-foreground">
            Continue to the Athyper identity service to complete verification.
            Your application never receives or stores your authenticator code.
          </p>
          <PrimaryAction disabled={submitting} type="submit">
            {submitting ? "Opening secure verification..." : "Continue to verification"}
          </PrimaryAction>
          <SecondaryAction disabled={submitting} href="/logout">
            Cancel sign in
          </SecondaryAction>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
