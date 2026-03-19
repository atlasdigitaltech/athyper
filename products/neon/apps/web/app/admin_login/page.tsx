"use client";

import { Command, Shield } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";

const BRAND = { bg: "#059669", bgHover: "#047857", light: "#d1fae5" };

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/wb/admin/home";

  function handleLogin() {
    const params = new URLSearchParams({ workbench: "admin", returnUrl });
    window.location.href = `/api/auth/login?${params.toString()}`;
  }

  return (
    <div className="flex min-h-dvh">
      {/* Left branding panel */}
      <div
        className="hidden lg:flex lg:w-1/3 items-center justify-center"
        style={{ backgroundColor: BRAND.bg }}
      >
        <div className="space-y-6 text-center p-12">
          <Shield className="mx-auto size-12" style={{ color: "#fff" }} />
          <div className="space-y-2">
            <h1 className="font-light text-4xl" style={{ color: "#fff" }}>
              Admin Portal
            </h1>
            <p className="text-lg" style={{ color: BRAND.light }}>
              System administration
            </p>
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center gap-2 lg:hidden">
              <Command className="size-6" />
              <span className="text-lg font-semibold">Neon</span>
            </div>
            <h2 className="text-2xl font-medium tracking-tight">
              Admin Sign In
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to access the administration workbench.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleLogin}
              className="w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              style={{ backgroundColor: BRAND.bg, color: "#fff" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = BRAND.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = BRAND.bg)
              }
            >
              Sign in with Keycloak
            </button>
            <SocialLoginButtons workbench="admin" returnUrl={returnUrl} />
            <a
              href="/"
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to login options
            </a>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} athyper. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
