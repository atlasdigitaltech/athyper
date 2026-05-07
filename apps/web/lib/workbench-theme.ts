/**
 * apps/web/lib/workbench-theme.ts
 *
 * Per-workbench accent palette. Values are CSS variables so the shell accents
 * follow the selected theme preset instead of carrying app-owned hex colors.
 */

import type { WorkbenchRole } from "./auth/workbench-config";

export interface WorkbenchTheme {
  /** Primary accent CSS color value. */
  accent: string;
}

export const WORKBENCH_THEMES: Record<WorkbenchRole, WorkbenchTheme> = {
  user: {
    accent: "var(--success)",
  },
  partner: {
    accent: "var(--info)",
  },
  admin: {
    accent: "var(--warning)",
  },
};

const FALLBACK: WorkbenchTheme = WORKBENCH_THEMES.user;

/** Returns the theme for the given workbench role string. Falls back to user theme. */
export function getWorkbenchTheme(workbench: string | null | undefined): WorkbenchTheme {
  return WORKBENCH_THEMES[workbench as WorkbenchRole] ?? FALLBACK;
}
