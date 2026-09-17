import {
  reduceShellSurface,
  type ShellSurface,
  type ShellSurfaceAction,
} from "./shell-surfaces";

export interface ShellOverlayState {
  readonly surface: ShellSurface;
  readonly atlas: {
    readonly open: boolean;
    readonly pinned: boolean;
    readonly full: boolean;
  };
  readonly compact: boolean;
}
export const initialOverlayState: ShellOverlayState = {
  surface: { kind: "none" },
  atlas: { open: false, pinned: false, full: false },
  compact: false,
};
type Update = boolean | ((previous: boolean) => boolean);
export type ShellOverlayAction =
  | { readonly type: "surface"; readonly event: ShellSurfaceAction }
  | {
      readonly type: "atlas";
      readonly field: "open" | "pinned" | "full";
      readonly value: Update;
    }
  | { readonly type: "compact"; readonly value: boolean }
  | { readonly type: "dismiss-context" };

export function reduceShellOverlay(
  state: ShellOverlayState,
  event: ShellOverlayAction,
): ShellOverlayState {
  if (event.type === "dismiss-context")
    return {
      ...state,
      surface: { kind: "none" },
      atlas: { ...state.atlas, open: false, full: false },
    };
  if (event.type === "compact") {
    return {
      ...state,
      compact: event.value,
      atlas:
        event.value && state.surface.kind !== "none"
          ? { ...state.atlas, open: false, full: false }
          : state.atlas,
    };
  }
  if (event.type === "surface") {
    const surface = reduceShellSurface(state.surface, event.event);
    if (surface === state.surface) return state;
    const atlas =
      surface.kind !== "none" || event.event.type === "dismiss"
        ? {
            ...state.atlas,
            open: state.atlas.open && state.atlas.pinned && !state.compact,
            full: false,
          }
        : state.atlas;
    return { ...state, surface, atlas };
  }
  const value =
    typeof event.value === "function"
      ? event.value(state.atlas[event.field])
      : event.value;
  const atlas = { ...state.atlas, [event.field]: value };
  if (event.field === "open" && !value) atlas.full = false;
  if (event.field === "full" && value) atlas.open = true;
  // Unpinning or expanding makes Atlas transient; opening explicitly transfers ownership.
  const takesFocus =
    atlas.open &&
    ((event.field === "open" && value) ||
      atlas.full ||
      !atlas.pinned ||
      state.compact);
  return {
    ...state,
    atlas,
    surface: takesFocus ? { kind: "none" } : state.surface,
  };
}
