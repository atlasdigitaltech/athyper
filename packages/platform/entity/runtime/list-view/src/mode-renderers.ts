import type { ListViewMode } from "@athyper/contract-platform-entity-list";
import type { ListWidthTier } from "./presentation-tier";

/** The shared renderer families a list body can use. */
export type ListRendererKind = "table" | "cards";

/** Mode → renderer registry. A mode is rendered only through an entry here;
 * adding a layout means registering its renderer, not adding a branch. */
const LIST_MODE_RENDERERS: Readonly<Partial<Record<ListViewMode, ListRendererKind>>> =
  Object.freeze({ table: "table", compact: "cards" });

/** Narrow lists present the same rows as record cards: geometry changes, the
 * saved table state (columns, sort, grouping) does not. Unregistered modes
 * still fall through to the table renderer, as before; Phase 0b of the Board
 * blueprint replaces that fall-through with an unavailable mode. */
export function listRendererKind(
  mode: ListViewMode,
  widthTier: ListWidthTier | undefined,
): ListRendererKind {
  if (widthTier === "narrow") return "cards";
  return LIST_MODE_RENDERERS[mode] ?? "table";
}
