"use client";

import { useAuthOptional } from "@/lib/auth/auth-context";

interface GateModuleProps {
    /** The module code(s) required to render children. */
    module: string | string[];
    /** Content to render when the user lacks the required module access. */
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Conditionally renders children based on module access (neon:MODULE:*).
 * Renders nothing (or fallback) until auth context is hydrated.
 */
export function GateModule({ module, fallback = null, children }: GateModuleProps) {
    const auth = useAuthOptional();

    // Not hydrated yet — hide to avoid flash
    if (!auth) return null;

    const allowed = Array.isArray(module)
        ? module.some((m) => auth.hasModule(m))
        : auth.hasModule(module);

    return allowed ? <>{children}</> : <>{fallback}</>;
}
