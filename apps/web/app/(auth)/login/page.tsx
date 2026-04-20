"use client";

/**
 * /login — Entry point for all authentication flows.
 *
 * Layout: two-panel (left branding + right form) on lg+, single column on mobile.
 *
 * Flows:
 *   - User login        → /api/auth/login?returnUrl=...
 *   - GitHub OAuth      → /api/auth/login?provider=github&returnUrl=...
 *   - Platform Admin    → /api/auth/login?realm=platform (feature-flagged)
 *   - Clear Session     → /logout (clears stale session cookies)
 *
 * returnUrl is read from both `redirect` (set by middleware) and `returnUrl`
 * (set by direct deep-links or bookmarks) for backwards compatibility.
 */

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@athyper/ui/primitives";
import { NeonLogoPrimary } from "@athyper/brand";
import { AthyperLogo } from "@athyper/icons/custom/AthyperLogo";

// ─── Workspace marketing slides ───────────────────────────────────────────────

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
  {
    workspace: "Assets & Facilities",
    headline: "Maximize What\nYou Own.",
    description:
      "Command fixed assets, property portfolios, leases, facilities, and spaces with lifecycle visibility and bulletproof accountability.",
  },
];

// ─── Inner page (needs useSearchParams inside Suspense) ───────────────────────

function LoginPageInner() {
  const params = useSearchParams();

  const returnUrl =
    params.get("redirect") ?? params.get("returnUrl") ?? "/";

  const errorParam = params.get("error");
  const [loading, setLoading] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  // Auto-advance slides every 5 s
  useEffect(() => {
    const timer = setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  function buildLoginUrl(workbench: "user" | "partner" | "platform"): string {
    const url = new URL("/api/auth/login", window.location.origin);
    if (workbench === "platform") {
      url.searchParams.set("realm", "platform");
    } else {
      if (returnUrl && returnUrl !== "/") {
        url.searchParams.set("returnUrl", returnUrl);
      }
      url.searchParams.set("filter", workbench);
    }
    return url.toString();
  }

  function handleLogin(workbench: "user" | "partner" | "platform") {
    setLoading(workbench);
    window.location.href = buildLoginUrl(workbench);
  }

  function handleGitHub() {
    setLoading("github");
    const url = new URL("/api/auth/login", window.location.origin);
    url.searchParams.set("provider", "github");
    url.searchParams.set("returnUrl", returnUrl);
    window.location.href = url.toString();
  }

  const platformEnabled =
    process.env.NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED === "true";

  const githubEnabled =
    process.env.NEXT_PUBLIC_GITHUB_LOGIN_ENABLED === "true";

  const current = SLIDES[slide] ?? SLIDES[0]!;

  return (
    <div className="flex h-dvh">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-3/5 lg:h-dvh flex-col bg-primary border-r border-border text-primary-foreground">

        {/* Logo — top center */}
        <div className="flex justify-center pt-10 pb-2">
          <NeonLogoPrimary className="w-[480px]" />
        </div>

        {/* Marketing slider — fills remaining height */}
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

        {/* Centered form area */}
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8">

            {/* Header */}
            <div className="space-y-1 text-center">
              <h2 className="text-2xl font-medium tracking-tight">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Sign in to your account</p>
            </div>

            {/* Error banner */}
            {errorParam && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorParam}
              </div>
            )}

            {/* Sign in */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => handleLogin("user")}
              loading={loading === "user"}
              disabled={loading !== null}
            >
              Sign in
            </Button>

            {/* GitHub (feature-flagged) */}
            {githubEnabled && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  size="lg"
                  onClick={handleGitHub}
                  loading={loading === "github"}
                  disabled={loading !== null}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  Continue with GitHub
                </Button>
              </>
            )}

            {/* Platform admin */}
            {platformEnabled && (
              <div className="text-center">
                <button
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                  onClick={() => handleLogin("platform")}
                  disabled={loading !== null}
                >
                  Platform Admin
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Footer — pinned to bottom */}
        <div className="space-y-1 pb-8 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} athyper. All rights reserved.
          </p>
          <div>
            <button
              className="text-xs text-muted-foreground opacity-60 underline-offset-4 hover:underline disabled:opacity-50"
              onClick={() => { window.location.href = "/logout"; }}
              disabled={loading !== null}
            >
              Clear Session
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background">
          <AthyperLogo className="animate-pulse text-primary" width={40} height={40} />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
