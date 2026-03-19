"use client";

import { Command } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/workspace";
  const errorParam = searchParams.get("error");

  function handleLogin() {
    const params = new URLSearchParams({ returnUrl });
    window.location.href = `/api/auth/login?${params.toString()}`;
  }

  return (
    <div className="flex h-dvh">
      {/* Left panel - branding */}
      <div className="hidden bg-primary lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            <Command className="mx-auto size-12 text-primary-foreground" />
            <div className="space-y-2">
              <h1 className="font-light text-5xl text-primary-foreground">
                Welcome
              </h1>
              <p className="text-primary-foreground/80 text-xl">
                Sign in to continue to Neon
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          {/* Header */}
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center gap-2 lg:hidden">
              <Command className="size-6" />
              <span className="text-lg font-semibold">Neon</span>
            </div>
            <h2 className="text-2xl font-medium tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your identity provider. Your workspace will be
              determined after sign-in.
            </p>
          </div>

          <div className="space-y-6">
            {/* Error display */}
            {errorParam && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {errorParam}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={handleLogin}>
                Sign in with Keycloak
              </Button>
              <SocialLoginButtons returnUrl={returnUrl} />
              <Button
                className="w-full"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const res = await fetch("/api/auth/logout", {
                    method: "POST",
                  });
                  const data = (await res.json()) as { logoutUrl?: string };
                  if (data.logoutUrl) {
                    window.location.href = data.logoutUrl;
                  } else {
                    window.location.reload();
                  }
                }}
              >
                Clear Session
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-1 text-center">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} athyper. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Platform admin?{" "}
              <a href="/ops_login" className="underline underline-offset-2 hover:text-muted-foreground">
                Sign in here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
