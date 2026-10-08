import type {
  EntityListDescriptorV1,
  ListUnavailableModeV1,
  ListViewMode,
} from "@athyper/contract-platform-entity-list";
import type { ListWidthTier } from "./presentation-tier";

/** The shared renderer families a list body can use. */
export type ListRendererKind = "table" | "cards" | "board";

/** Mode → renderer registry. A mode is rendered only through an entry here;
 * adding a layout means registering its renderer, not adding a branch. */
const LIST_MODE_RENDERERS: Readonly<Partial<Record<ListViewMode, ListRendererKind>>> =
  Object.freeze({ table: "table", compact: "cards", board: "board" });

export const LIST_MODE_RENDERER_MISSING = "LIST_MODE_RENDERER_MISSING";

/** Narrow lists present the same rows as record cards: geometry changes, the
 * saved table state (columns, sort, grouping) does not. An unregistered mode
 * has no renderer and is never drawn through another layout. */
export function listRendererKind(
  mode: ListViewMode,
  widthTier: ListWidthTier | undefined,
): ListRendererKind | undefined {
  const registered = LIST_MODE_RENDERERS[mode];
  if (!registered) return undefined;
  // Board presents one lane at a time when narrow; other layouts become cards.
  return widthTier === "narrow" && registered !== "board" ? "cards" : registered;
}

/** Moves supported modes that this runtime cannot render into
 * `unavailableModes`, so every consumer (layout control, URL and saved-view
 * state, list body) sees only modes it can draw. */
export function withRenderableModes(
  descriptor: EntityListDescriptorV1,
  /** Hosts that cannot place a board (for example, record choosers) pass false. */
  options: { readonly board?: boolean } = {},
): EntityListDescriptorV1 {
  const { supportedModes, defaultState } = descriptor.surface;
  const drawable = (mode: ListViewMode) => Boolean(LIST_MODE_RENDERERS[mode]) && (mode !== "board" || options.board !== false);
  const missing = supportedModes.filter((mode) => !drawable(mode));
  if (!missing.length) return descriptor;
  const renderable = supportedModes.filter(drawable);
  const fallback: ListViewMode = renderable[0] ?? "table";
  // Keep the parser's invariants: each mode is listed once and never also
  // supported, so a server-declared reason wins over the runtime's own.
  const declared = descriptor.surface.unavailableModes ?? [];
  const listed = new Set(declared.map((entry) => entry.mode));
  const unavailableModes: readonly ListUnavailableModeV1[] = [
    ...declared.filter((entry) => !renderable.includes(entry.mode)),
    ...[...new Set(missing)]
      .filter((mode) => !listed.has(mode))
      .map((mode) => ({ mode, code: LIST_MODE_RENDERER_MISSING })),
  ];
  // A projection travels with its mode: an unrenderable Board takes its lanes with it.
  const { board, ...surface } = descriptor.surface;
  return {
    ...descriptor,
    surface: {
      ...surface,
      ...(board && renderable.includes("board") ? { board } : {}),
      supportedModes: renderable.length ? renderable : [fallback],
      unavailableModes,
      defaultState: renderable.includes(defaultState.mode)
        ? defaultState
        : { ...defaultState, mode: fallback },
    },
  };
}
