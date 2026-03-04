"use client";

import type { Workbench } from "@/lib/auth/types";

import { useAuthOptional } from "@/lib/auth/auth-context";

interface GateWorkbenchProps {
  /** The workbench(es) required to render children. */
  workbench: Workbench | Workbench[];
  /** Content to render when the user lacks the required workbench access. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children based on workbench access.
 * Renders nothing (or fallback) until auth context is hydrated.
 */
export function GateWorkbench({
  workbench,
  fallback = null,
  children,
}: GateWorkbenchProps) {
  const auth = useAuthOptional();

  // Not hydrated yet — hide to avoid flash
  if (!auth) return null;

  const allowed = Array.isArray(workbench)
    ? workbench.some((wb) => auth.hasWorkbench(wb))
    : auth.hasWorkbench(workbench);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
