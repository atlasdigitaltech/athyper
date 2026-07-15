/**
 * Organize palette CSS utility class constants.
 *
 * Single source of truth for all organize-palette UI surfaces:
 * - Neon, Mesh, and Admin apps import via `@athyper/ui/organize`
 * - `@athyper/runtime-list` re-exports through its own `paletteStyles.ts`
 *
 * Typography constants are sourced from `../typography` so that platform-wide
 * semantic values stay in sync automatically.
 */

import {
  LABEL_XS,
  META_XS,
  SECTION_LABEL_XS,
} from "../typography";

// ── Text inputs ───────────────────────────────────────────────────────────────

export const ORGANIZE_INPUT_CLASS =
  "h-9 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const ORGANIZE_INPUT_WITH_CLEAR_CLASS =
  "h-9 w-full rounded-md border bg-background pl-3 pr-9 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const ORGANIZE_COMPACT_DATE_INPUT_CLASS =
  "h-9 w-[10.75rem] shrink-0 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const ORGANIZE_SEARCH_INPUT_CLASS =
  "h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS =
  "h-9 w-full rounded-md border bg-background pl-9 pr-9 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

// ── Icon-only action button ───────────────────────────────────────────────────

export const ORGANIZE_ICON_BUTTON_CLASS =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ── Active filter card ────────────────────────────────────────────────────────
// Left accent stripe (2px) marks this card as an active constraint on the data.
// The rest of the border uses the standard --border token (1px).

export const ORGANIZE_FIELD_CARD_CLASS =
  "rounded-lg border border-l-2 border-l-foreground/20 bg-background px-3 py-2";

// ── Typography roles (re-exported from platform typography layer) ─────────────

export const ORGANIZE_FIELD_LABEL_CLASS   = LABEL_XS;
export const ORGANIZE_META_TEXT_CLASS     = META_XS;
export const ORGANIZE_SECTION_LABEL_CLASS = SECTION_LABEL_XS;

// ── Secondary action button ───────────────────────────────────────────────────

export const ORGANIZE_SECONDARY_BUTTON_CLASS =
  "inline-flex h-9 w-full items-center justify-center rounded-md border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-muted-foreground/30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ── Chip / pill helpers ───────────────────────────────────────────────────────

/**
 * General-purpose organize chip — used for sort direction, group toggles,
 * and other binary selection chips in the palette.
 */
export function organizeChipClass(selected: boolean): string {
  return [
    "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-full border px-3 text-xs font-medium leading-none transition-colors",
    selected
      ? "border-foreground bg-foreground text-background"
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

/**
 * Filter value pill — used inside filter editors (status chips, date shortcuts,
 * null-presence toggles). Proportioned to match the Secondary button height.
 */
export function filterValuePillClass(selected: boolean): string {
  return [
    "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors",
    selected
      ? "border-foreground bg-foreground text-background"
      : "border-input bg-background text-foreground hover:bg-muted",
  ].join(" ");
}
