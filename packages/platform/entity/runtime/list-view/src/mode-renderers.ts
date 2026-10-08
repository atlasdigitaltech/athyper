import type {
  EntityListDescriptorV1,
  ListUnavailableModeV1,
  ListViewMode,
} from "@athyper/contract-platform-entity-list";
import type { ListWidthTier } from "./presentation-tier";

/** The shared renderer families a list body can use. */
export type ListRendererKind = "table" | "cards";

/** Mode → renderer registry. A mode is rendered only through an entry here;
 * adding a layout means registering its renderer, not adding a branch. */
const LIST_MODE_RENDERERS: Readonly<Partial<Record<ListViewMode, ListRendererKind>>> =
  Object.freeze({ table: "table", compact: "cards" });

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
  return widthTier === "narrow" ? "cards" : registered;
}

/** Moves supported modes that this runtime cannot render into
 * `unavailableModes`, so every consumer (layout control, URL and saved-view
 * state, list body) sees only modes it can draw. */
export function withRenderableModes(
  descriptor: EntityListDescriptorV1,
): EntityListDescriptorV1 {
  const { supportedModes, defaultState } = descriptor.surface;
  const missing = supportedModes.filter((mode) => !LIST_MODE_RENDERERS[mode]);
  if (!missing.length) return descriptor;
  const renderable = supportedModes.filter((mode) => LIST_MODE_RENDERERS[mode]);
  const fallback: ListViewMode = renderable[0] ?? "table";
  const unavailableModes: readonly ListUnavailableModeV1[] = [
    ...(descriptor.surface.unavailableModes ?? []),
    ...missing.map((mode) => ({ mode, code: LIST_MODE_RENDERER_MISSING })),
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
