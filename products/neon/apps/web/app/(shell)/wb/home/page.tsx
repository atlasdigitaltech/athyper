"use client";

// /wb/home — Resolver page
// Redirects to the user's default workbench based on their roles.

import { Command } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import {
  isWorkbench,
  type Workbench,
  WORKBENCH_PRIORITY,
} from "@/lib/auth/types";
import { getWorkbenchDefaultRoute } from "@/lib/auth/workbench-config";

const LAST_WB_KEY = "neon_last_workbench";

export default function WorkbenchHomePage() {
  const router = useRouter();

  useEffect(() => {
    const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as
      | SessionBootstrap
      | undefined;
    if (!bootstrap) {
      // No session — redirect to login
      router.replace("/login");
      return;
    }

    const allowed = (bootstrap.allowedWorkbenches ?? []).filter(isWorkbench);

    if (allowed.length === 0) {
      router.replace("/wb/unauthorized");
      return;
    }

    if (allowed.length === 1) {
      // Single workbench — go directly
      router.replace(getWorkbenchDefaultRoute(allowed[0]));
      return;
    }

    // Multiple workbenches — check last-used preference
    const lastUsed = localStorage.getItem(LAST_WB_KEY);
    if (
      lastUsed &&
      isWorkbench(lastUsed) &&
      allowed.includes(lastUsed as Workbench)
    ) {
      router.replace(getWorkbenchDefaultRoute(lastUsed as Workbench));
      return;
    }

    // Apply priority order: user > partner > ops > admin
    const resolved = WORKBENCH_PRIORITY.find((wb) => allowed.includes(wb));
    if (resolved) {
      router.replace(getWorkbenchDefaultRoute(resolved));
      return;
    }

    // Ambiguous — show workspace chooser
    router.replace("/workspace");
  }, [router]);

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="space-y-4 text-center">
        <Command className="mx-auto size-8 animate-pulse text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading workbench...</p>
      </div>
    </div>
  );
}
