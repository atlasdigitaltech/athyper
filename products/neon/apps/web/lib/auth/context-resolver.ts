"use client";

import type { Workbench } from "./types";

const LAST_WB_KEY = "neon:lastWorkbench";

/** Persist the user's last-used workbench to localStorage. */
export function setLastWorkbench(wb: Workbench): void {
    try {
        localStorage.setItem(LAST_WB_KEY, wb);
    } catch {
        // SSR or storage full — ignore
    }
}

/** Read the user's last-used workbench from localStorage (if any). */
export function getLastWorkbench(): Workbench | null {
    try {
        const value = localStorage.getItem(LAST_WB_KEY);
        if (value && ["user", "partner", "admin", "ops"].includes(value)) {
            return value as Workbench;
        }
    } catch {
        // SSR or storage unavailable
    }
    return null;
}
