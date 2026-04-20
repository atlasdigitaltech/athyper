"use client";

// lib/auth/context-resolver.ts
//
// Persists the user's last-used org + workbench selection to localStorage.
// Used by /auth/select to pre-highlight the previous context and to
// auto-select when the user has only one available option.
//
// v4 stores { org, workbench } (alias + role) instead of F1's single Workbench.
// The stored context is validated against the live session before trusting it.

const LAST_CONTEXT_KEY = "neon:lastContext";

export interface LastContext {
  org: string;      // org alias, e.g. "athyper--ATHQ"
  workbench: string; // role, e.g. "user" | "partner" | "admin"
}

/** Persist the user's last-used org + workbench to localStorage. */
export function setLastContext(org: string, workbench: string): void {
  try {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({ org, workbench }));
  } catch {
    // SSR or storage full — ignore
  }
}

/** Read the user's last-used context from localStorage (if any). */
export function getLastContext(): LastContext | null {
  try {
    const value = localStorage.getItem(LAST_CONTEXT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "org" in parsed &&
      typeof (parsed as { org: unknown }).org === "string" &&
      "workbench" in parsed &&
      typeof (parsed as { workbench: unknown }).workbench === "string"
    ) {
      return parsed as LastContext;
    }
  } catch {
    // SSR or storage unavailable
  }
  return null;
}

/** Clear the stored last context (e.g. on explicit logout). */
export function clearLastContext(): void {
  try {
    localStorage.removeItem(LAST_CONTEXT_KEY);
  } catch {
    // SSR or storage unavailable
  }
}
