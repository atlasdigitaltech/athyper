"use client";

import { useEffect } from "react";
import { AthyperLogo } from "@athyper/icons/custom/AthyperLogo";
import { clearLastContext } from "@/lib/auth/context-resolver";

export default function LogoutPage() {
  useEffect(() => {
    async function doLogout() {
      clearLastContext();
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        const data = (await res.json()) as { logoutUrl?: string };
        if (data.logoutUrl) {
          window.location.href = data.logoutUrl;
        } else {
          window.location.href = "/login";
        }
      } catch {
        window.location.href = "/login";
      }
    }
    doLogout();
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <AthyperLogo
          className="animate-pulse text-muted-foreground"
          width={32}
          height={32}
        />
        <p className="text-sm text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}
