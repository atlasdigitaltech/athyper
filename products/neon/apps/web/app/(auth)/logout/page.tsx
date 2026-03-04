"use client";

import { Command } from "lucide-react";
import { useEffect } from "react";

export default function LogoutPage() {
    useEffect(() => {
        async function doLogout() {
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
            <div className="space-y-4 text-center">
                <Command className="mx-auto size-8 animate-pulse text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Signing out...</p>
            </div>
        </div>
    );
}
