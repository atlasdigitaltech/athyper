"use client";

/**
 * /login — Entry point for all authentication flows.
 *
 * Layout: two-panel (left branding + right form) on lg+, single column on mobile.
 *
 * Flows:
 *   - User login        → /api/auth/login?returnUrl=...
 *   - Partner login     → /api/auth/login?returnUrl=...
 *   - GitHub OAuth      → /api/auth/login?provider=github&returnUrl=...
 *   - Platform Admin    → /api/auth/login?realm=platform (feature-flagged)
 *   - Clear Session     → /logout (clears stale session cookies)
 *
 * returnUrl is read from both `redirect` (set by middleware) and `returnUrl`
 * (set by direct deep-links or bookmarks) for backwards compatibility.
 */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NeonLogo } from "@athyper/icons/custom/NeonLogo";
import { Button } from "@athyper/ui/primitives";

// ─── Inner page (needs useSearchParams inside Suspense) ───────────────────────

function LoginPageInner() {
  const params = useSearchParams();

  // Read from both param names: `redirect` (set by middleware) and
  // `returnUrl` (set by direct deep-links / bookmarks)
  const returnUrl =
    params.get("redirect") ?? params.get("returnUrl") ?? "/";

  const errorParam = params.get("error");
  const [loading, setLoading] = useState<string | null>(null);

  function buildLoginUrl(workbench: "user" | "partner" | "platform"): string {
    const url = new URL("/api/auth/login", window.location.origin);
    if (workbench === "platform") {
      url.searchParams.set("realm", "platform");
    } else {
      // Encode a workbench filter so /auth/select only shows relevant workbench
      // options after KC auth (e.g. clicking "Partner Login" hides User tiles).
      const selectTarget = new URL("/auth/select", window.location.origin);
      if (returnUrl && returnUrl !== "/") {
        selectTarget.searchParams.set("returnUrl", returnUrl);
      }
      selectTarget.searchParams.set("filter", workbench);
      url.searchParams.set("returnUrl", selectTarget.pathname + selectTarget.search);
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

  return (
    <div className="flex h-dvh">
      {/* ── Left panel — branding (lg+) ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/3 lg:h-dvh bg-white items-center justify-center border-r border-border">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 900 600"
          role="img"
          aria-label="neon Business Operating Platform"
          className="w-full px-8"
        >
          <g transform="translate(40,35) scale(1.02)">
            <polygon points="125,17 14,244 75,244 155,82" fill="#000000" />
            <polygon points="223,120 169,120 109,244 163,243" fill="#000000" />
            <polygon points="225,164 199,220 212,244 263,244" fill="#000000" />
          </g>
          <text x="315" y="245" fill="#000000" fontFamily="Arial, Helvetica, sans-serif" fontSize="126" fontWeight="700" letterSpacing="-4">neon</text>
          <line x1="38" y1="337" x2="862" y2="337" stroke="#000000" strokeWidth="5" />
          <text x="450" y="455" fill="#000000" fontFamily="Arial, Helvetica, sans-serif" fontSize="59" fontWeight="400" textAnchor="middle" letterSpacing="-1">Business Operating Platform</text>
        </svg>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────── */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-sm space-y-8 py-16 lg:py-24">

          {/* Header — logo visible on mobile only */}
          <div className="space-y-2 text-center">
            <div className="flex flex-col items-center justify-center gap-2 lg:hidden">
              <NeonLogo className="text-primary" width={36} height={36} />
              <span className="text-lg font-light tracking-widest text-foreground">neon</span>
            </div>
            <h2 className="text-2xl font-medium tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your identity provider.
            </p>
          </div>

          {/* Error banner */}
          {errorParam && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {decodeURIComponent(errorParam)}
            </div>
          )}

          {/* Primary login options */}
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => handleLogin("user")}
              loading={loading === "user"}
              disabled={loading !== null}
            >
              Sign in
            </Button>
          </div>

          {/* Divider + Social login (feature-flagged) */}
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

          {/* Footer */}
          <div className="space-y-1 pt-2 text-center">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} athyper. All rights reserved.
            </p>
            <div>
              <button
                className="text-xs text-muted-foreground/60 underline-offset-4 hover:underline disabled:opacity-50"
                onClick={() => { window.location.href = "/logout"; }}
                disabled={loading !== null}
              >
                Clear Session
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
