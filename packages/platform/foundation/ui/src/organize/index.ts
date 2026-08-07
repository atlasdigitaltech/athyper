/**
 * @athyper/ui/organize
 *
 * Shared organize-palette UI toolkit — reusable across neon, mesh, and admin.
 *
 * Exports:
 * - Style constants for all organize-palette surfaces
 * - `ActiveFilterCard`  — shell card for active filter rows
 * - `ValueChip`         — compact removable/static value chip
 *
 * The typography root (`@athyper/ui/typography`) is also re-exported so that
 * consumers can reach semantic type constants through a single import path
 * when working on palette-adjacent UI.
 */

export { ActiveFilterCard } from "./active-filter-card";
export { ValueChip }        from "./value-chip";
export * from "./styles";

// Re-export typography layer for palette consumers
export * from "../typography/index";

