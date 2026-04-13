/**
 * apps/web/lib/workbench-theme.ts
 *
 * Per-workbench accent colour palette.
 * Used to tint the NavRail active indicator, ContextPanel module active state,
 * and WorkbenchToggle pills.
 *
 *   user    → green  (#0d9668)
 *   partner → blue   (#2563eb)
 *   admin   → orange (#dc5b20)
 */

import type { WorkbenchRole } from "./auth/workbench-config";

export interface WorkbenchTheme {
  /** Primary accent hex — active bar, button borders, rings. */
  accent: string;
  /** Very light tint — active item background. */
  accentBg: string;
  /** Dark shade — text / icon on tinted background. */
  accentText: string;
}

export const WORKBENCH_THEMES: Record<WorkbenchRole, WorkbenchTheme> = {
  user: {
    accent:     "#0d9668",
    accentBg:   "#ecfdf5",
    accentText: "#065f46",
  },
  partner: {
    accent:     "#2563eb",
    accentBg:   "#eff6ff",
    accentText: "#1e40af",
  },
  admin: {
    accent:     "#dc5b20",
    accentBg:   "#fff7ed",
    accentText: "#9a3412",
  },
};

const FALLBACK: WorkbenchTheme = WORKBENCH_THEMES.user;

/** Returns the theme for the given workbench role string. Falls back to user theme. */
export function getWorkbenchTheme(workbench: string | null | undefined): WorkbenchTheme {
  return WORKBENCH_THEMES[workbench as WorkbenchRole] ?? FALLBACK;
}
