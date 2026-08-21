"use client";
import * as React from "react";
import { createContext, useContext, type ReactNode } from "react";
import { accessMessage, decideRouteAccess, hasAnyPermission, hasPermission, isFeatureEnabled, type AccessDecision, type AccessSnapshot, type RouteAccessRequirement } from "./core";
export * from "./core";
const AccessContext = createContext<AccessSnapshot | undefined>(undefined);
export function AccessProvider({ snapshot, children }: { readonly snapshot: AccessSnapshot; readonly children: ReactNode }) { return <AccessContext.Provider value={snapshot}>{children}</AccessContext.Provider>; }
export function useAccessSnapshot(): AccessSnapshot { const value = useContext(AccessContext); if (!value) throw new Error("Access consumers require AccessProvider"); return value; }
export function useHasPermission(code: string): boolean { return hasPermission(useAccessSnapshot(), code); }
export function useHasAnyPermission(codes: readonly string[]): boolean { return hasAnyPermission(useAccessSnapshot(), codes); }
export function useIsFeatureEnabled(code: string): boolean { return isFeatureEnabled(useAccessSnapshot(), code); }
export function PermissionGate({ code, anyOf, children, fallback = null }: { readonly code?: string; readonly anyOf?: readonly string[]; readonly children: ReactNode; readonly fallback?: ReactNode }) { const snapshot = useAccessSnapshot(); const allowed = code ? hasPermission(snapshot, code) : anyOf ? hasAnyPermission(snapshot, anyOf) : false; return <>{allowed ? children : fallback}</>; }
export function FeatureGate({ code, children, fallback = null }: { readonly code: string; readonly children: ReactNode; readonly fallback?: ReactNode }) { return <>{isFeatureEnabled(useAccessSnapshot(), code) ? children : fallback}</>; }
export function RouteGuard({ requirement, children, renderDecision }: { readonly requirement: RouteAccessRequirement; readonly children: ReactNode; readonly renderDecision?: (decision: AccessDecision, message: string) => ReactNode }) { const decision = decideRouteAccess(useAccessSnapshot(), requirement); if (decision.allowed) return <>{children}</>; return <>{renderDecision?.(decision, accessMessage(decision)) ?? null}</>; }
