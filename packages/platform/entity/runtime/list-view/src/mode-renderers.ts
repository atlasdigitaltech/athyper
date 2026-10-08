import type {
  EntityListDescriptorV1,
  ListUnavailableModeV1,
  ListViewMode,
} from "@athyper/contract-platform-entity-list";
import type { ListWidthTier } from "./presentation-tier";

/** The shared renderer families a list body can use. */
export type ListRendererKind =
  "table" | "cards" | "board" | "calendar" | "gantt";

/** Mode → renderer registry. A mode is rendered only through an entry here;
 * adding a layout means registering its renderer, not adding a branch. */
const LIST_MODE_RENDERERS: Readonly<
  Partial<Record<ListViewMode, ListRendererKind>>
> = Object.freeze({
  table: "table",
  compact: "cards",
  board: "board",
  calendar: "calendar",
  gantt: "gantt",
});

export const LIST_MODE_RENDERER_MISSING = "LIST_MODE_RENDERER_MISSING";

/** What a renderer takes over from the shared list chrome. Per-layout list
 * policy lives here, so a new layout declares its traits instead of adding
 * mode comparisons to the list. */
export interface ListRendererTraits {
  /** Adapts itself at narrow widths instead of becoming cards. */
  readonly adaptsWhenNarrow: boolean;
  /** Pages its own rows; the list pagination is hidden. */
  readonly ownPaging: boolean;
  /** Supplies its own grouping; the Group drawer is hidden and a saved group
   * stays for Table and Cards. */
  readonly ownGrouping: boolean;
  /** Its page query is only one of its streams, so the list title shows no
   * record count; the layout reports its own counts under the count-mode
   * rule (foundation section 5). */
  readonly ownCounts: boolean;
}

const LIST_RENDERER_TRAITS: Readonly<
  Record<ListRendererKind, ListRendererTraits>
> = Object.freeze({
  table: {
    adaptsWhenNarrow: false,
    ownPaging: false,
    ownGrouping: false,
    ownCounts: false,
  },
  cards: {
    adaptsWhenNarrow: false,
    ownPaging: false,
    ownGrouping: false,
    ownCounts: false,
  },
  board: {
    adaptsWhenNarrow: true,
    ownPaging: true,
    ownGrouping: true,
    ownCounts: false,
  },
  calendar: {
    adaptsWhenNarrow: true,
    ownPaging: true,
    ownGrouping: true,
    ownCounts: true,
  },
  gantt: {
    adaptsWhenNarrow: true,
    ownPaging: true,
    ownGrouping: true,
    ownCounts: true,
  },
});

const NO_TRAITS: ListRendererTraits = Object.freeze({
  adaptsWhenNarrow: false,
  ownPaging: false,
  ownGrouping: false,
  ownCounts: false,
});

/** The traits of the renderer registered for a mode (independent of width). */
export function listModeTraits(
  mode: ListViewMode | undefined,
): ListRendererTraits {
  const registered = mode ? LIST_MODE_RENDERERS[mode] : undefined;
  return registered ? LIST_RENDERER_TRAITS[registered] : NO_TRAITS;
}

/** Narrow lists present the same rows as record cards: geometry changes, the
 * saved table state (columns, sort, grouping) does not. An unregistered mode
 * has no renderer and is never drawn through another layout. */
export function listRendererKind(
  mode: ListViewMode,
  widthTier: ListWidthTier | undefined,
): ListRendererKind | undefined {
  const registered = LIST_MODE_RENDERERS[mode];
  if (!registered) return undefined;
  // Board, Calendar and Gantt adapt themselves when narrow (one lane; a dated
  // list); other layouts become cards.
  return widthTier === "narrow" &&
    !LIST_RENDERER_TRAITS[registered].adaptsWhenNarrow
    ? "cards"
    : registered;
}

/** Moves supported modes that this runtime cannot render into
 * `unavailableModes`, so every consumer (layout control, URL and saved-view
 * state, list body) sees only modes it can draw. */
export function withRenderableModes(
  descriptor: EntityListDescriptorV1,
  /** Hosts that cannot place a board, calendar or Gantt (for example, record choosers) pass false. */
  options: {
    readonly board?: boolean;
    readonly calendar?: boolean;
    readonly gantt?: boolean;
  } = {},
): EntityListDescriptorV1 {
  const { supportedModes, defaultState } = descriptor.surface;
  const drawable = (mode: ListViewMode) =>
    Boolean(LIST_MODE_RENDERERS[mode]) &&
    (mode !== "board" || options.board !== false) &&
    (mode !== "calendar" || options.calendar !== false) &&
    (mode !== "gantt" || options.gantt !== false);
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
  const { board, calendar, gantt, ...surface } = descriptor.surface;
  return {
    ...descriptor,
    surface: {
      ...surface,
      ...(board && renderable.includes("board") ? { board } : {}),
      ...(calendar && renderable.includes("calendar") ? { calendar } : {}),
      ...(gantt && renderable.includes("gantt") ? { gantt } : {}),
      supportedModes: renderable.length ? renderable : [fallback],
      unavailableModes,
      defaultState: renderable.includes(defaultState.mode)
        ? defaultState
        : { ...defaultState, mode: fallback },
    },
  };
}
