"use client";

// lib/auth/auth-context.tsx
//
// React context that provides authorization state to the component tree.
// Wraps the shell layout so all pages/components can use `useAuth()`.
//
// Data flow:
//   1. Root layout.tsx injects `window.__SESSION_BOOTSTRAP__` via <script>
//   2. Shell layout renders <AuthProvider activeWorkbench={workbench}>
//   3. AuthProvider reads bootstrap data, builds AuthContextValue
//   4. Components call useAuth() to access authorization helpers

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
    isWorkbench,
    type NeonRole,
    parseNeonRole,
    type Workbench,
} from "./types";

import type { SessionBootstrap } from "../session-bootstrap";

export interface AuthContextValue {
    userId: string;
    displayName: string;
    tenantId: string;
    activeWorkbench: Workbench;
    allowedWorkbenches: Workbench[];
    /** Module codes the user has access to. */
    modules: string[];
    /** Persona codes assigned to the user. */
    personas: string[];
    groups: string[];
    realmRoles: string[];
    clientRoles: string[];
    persona: string;

    /** Check if the user has access to a specific workbench. */
    hasWorkbench(wb: Workbench): boolean;
    /** Check if the user has access to a specific module. */
    hasModule(mod: string): boolean;
    /** Check if the user has a specific persona. */
    hasPersona(persona: string): boolean;
    /** Check if the user has a specific neon:* role. */
    can(role: NeonRole): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
    children: React.ReactNode;
    activeWorkbench: Workbench;
}

export function AuthProvider({ children, activeWorkbench }: AuthProviderProps) {
    const [bootstrap, setBootstrap] = useState<SessionBootstrap | null>(null);

    useEffect(() => {
        const bs = (window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
        if (bs) setBootstrap(bs);
    }, []);

    const value = useMemo<AuthContextValue | null>(() => {
        if (!bootstrap) return null;

        const allowedWorkbenches = (bootstrap.allowedWorkbenches ?? []).filter(isWorkbench);
        const modules = bootstrap.modules ?? [];
        const personas = bootstrap.personas ?? [];
        const groups = bootstrap.groups ?? [];
        const realmRoles = bootstrap.roles ?? [];
        const clientRoles = bootstrap.clientRoles ?? [];

        const hasWorkbench = (wb: Workbench): boolean => allowedWorkbenches.includes(wb);

        const hasModule = (mod: string): boolean => modules.includes(mod);

        const hasPersona = (p: string): boolean => personas.includes(p);

        const can = (role: NeonRole): boolean => {
            const parsed = parseNeonRole(role);
            if (!parsed) return false;

            switch (parsed.domain) {
                case "WORKBENCH":
                    return hasWorkbench(parsed.value);
                case "MODULE":
                    return hasModule(parsed.value);
                case "PERSONA":
                    return hasPersona(parsed.value);
            }
        };

        return {
            userId: bootstrap.userId ?? "",
            displayName: bootstrap.displayName ?? "",
            tenantId: bootstrap.tenantId ?? "default",
            activeWorkbench,
            allowedWorkbenches,
            modules,
            personas,
            groups,
            realmRoles,
            clientRoles,
            persona: bootstrap.persona ?? "viewer",
            hasWorkbench,
            hasModule,
            hasPersona,
            can,
        };
    }, [bootstrap, activeWorkbench]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Access the authorization context. Returns null before bootstrap hydration.
 */
export function useAuthOptional(): AuthContextValue | null {
    return useContext(AuthContext);
}

/**
 * Access the authorization context. Throws if called before bootstrap hydration
 * or outside an AuthProvider.
 */
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth() called outside AuthProvider or before bootstrap hydration");
    }
    return ctx;
}
