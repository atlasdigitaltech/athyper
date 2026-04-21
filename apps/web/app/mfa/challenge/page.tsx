"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonLogoPrimary } from "@athyper/brand";
import { AthyperLogo } from "@athyper/icons/custom/AthyperLogo";
import { getCsrfToken } from "@/lib/bff-fetch";

const SLIDES = [
  {
    workspace: "Finance",
    headline: "Master Every Dollar.\nCommand Every Decision.",
    description:
      "Unify accounting, payments, cash flow, budgets, and digital transactions into a single financial command center.",
  },
  {
    workspace: "Supply Chain",
    headline: "Orchestrate\nComplexity.",
    description:
      "Command sourcing, procurement, inventory, warehousing, logistics, and supplier performance through one intelligent backbone.",
  },
  {
    workspace: "Commercial",
    headline: "Turn Every Conversation\ninto Revenue.",
    description:
      "Capture, nurture, and convert demand with a seamlessly connected engine across customer engagement, sales, and order execution.",
  },
  {
    workspace: "People",
    headline: "Empower Every Person.\nElevate the Organization.",
    description:
      "Fuel the full workforce lifecycle with intelligent HR and payroll capabilities that keep talent engaged, aligned, and compliant.",
  },
  {
    workspace: "Projects & Services",
    headline: "Deliver Brilliance.\nControl Every Cost.",
    description:
      "Manage projects, service workflows, budgets, and revenue-linked execution — all in one command center.",
  },
  {
    workspace: "Operations",
    headline: "Run Without\nInterruption.",
    description:
      "Power production and maintenance with intelligent tools that maximize uptime, sharpen planning, and drive operational excellence.",
  },
];

function MfaChallengeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/auth/select";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [slide, setSlide] = useState(0);
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleVerify() {
    if (code.length !== 6 || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        // Optionally register this device as trusted before redirecting.
        // Uses dedicated BFF route that supplies X-Org from session
        // (activeOrg is null before /auth/select so the generic relay can't be used).
        if (trustDevice) {
          await fetch("/api/auth/mfa/trust-device", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
            body: JSON.stringify({ device_name: deviceLabel.trim() || undefined, ttl_days: 30 }),
          }).catch(() => { /* best-effort */ });
        }
        router.replace(returnUrl);
      } else {
        const data = await res.json().catch(() => ({})) as { message?: string };
        setError(data.message ?? "Invalid code. Please try again.");
        setCode("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const current = SLIDES[slide] ?? SLIDES[0]!;

  return (
    <div className="flex h-dvh">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-3/5 lg:h-dvh flex-col bg-primary border-r border-border text-primary-foreground">

        {/* Logo */}
        <div className="flex justify-center pt-10 pb-2">
          <NeonLogoPrimary className="w-[480px]" />
        </div>

        {/* Marketing slider */}
        <div className="flex flex-1 flex-col justify-center px-16 pb-10">
          <div key={slide} className="space-y-4 animate-in fade-in duration-500">
            <p className="text-xs font-semibold tracking-widest uppercase opacity-50">
              {current.workspace}
            </p>
            <h3 className="text-[2.2rem] font-bold leading-[1.15] whitespace-pre-line">
              {current.headline}
            </h3>
            <p className="text-base leading-relaxed opacity-60">
              {current.description}
            </p>
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-2 mt-10">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 bg-primary-foreground ${
                  i === slide ? "w-6 opacity-100" : "w-1.5 opacity-30"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="flex w-full flex-col bg-background lg:w-2/5">

        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8">

            {/* Header */}
            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-medium tracking-tight">Two-factor authentication</h2>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>

            {/* Code input */}
            <div className="space-y-3">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                placeholder="000000"
                disabled={pending}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={code.length !== 6 || pending}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying…
                  </>
                ) : "Verify"}
              </button>

              {/* Trust this device */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-muted-foreground">Trust this device for 30 days</span>
                </label>
                {trustDevice && (
                  <input
                    type="text"
                    value={deviceLabel}
                    onChange={(e) => setDeviceLabel(e.target.value)}
                    placeholder="Device label (optional, e.g. Work Laptop)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="space-y-1 pb-8 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} athyper. All rights reserved.
          </p>
          <div>
            <button
              className="text-xs text-muted-foreground opacity-60 underline-offset-4 hover:underline"
              onClick={() => { window.location.href = "/api/auth/logout"; }}
            >
              Sign out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function MfaChallengePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background">
          <AthyperLogo className="animate-pulse text-primary" width={40} height={40} />
        </div>
      }
    >
      <MfaChallengeInner />
    </Suspense>
  );
}
