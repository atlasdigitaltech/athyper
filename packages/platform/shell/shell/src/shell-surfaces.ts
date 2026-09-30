import type { ShellActivityTab } from "./activity-center";
import type { ShellQuickAccessTab } from "./quick-access";

export type HeaderActionKind = "search" | ShellActivityTab | "agent" | "utilities" | "more";
export type ShellSurface =
  | { readonly kind: "none" }
  | { readonly kind: "navigation" }
  | { readonly kind: "context"; readonly id: string }
  | { readonly kind: "header"; readonly action: HeaderActionKind }
  | { readonly kind: "quick-access"; readonly tab: ShellQuickAccessTab };

type Update<T> = T | ((previous: T) => T);
export type ShellSurfaceAction =
  | { readonly type: "navigation"; readonly value: Update<boolean> }
  | {
      readonly type: "header";
      readonly value: Update<HeaderActionKind | undefined>;
    }
  | {
      readonly type: "quick-access";
      readonly value: Update<ShellQuickAccessTab | undefined>;
    }
  | { readonly type: "dismiss" }
  | { readonly type: "context"; readonly id: string; readonly open: boolean };

/** Only one transient navigation/header/quick-access surface can own focus at a time. */
export function reduceShellSurface(
  state: ShellSurface,
  event: ShellSurfaceAction,
): ShellSurface {
  switch (event.type) {
    case "context":
      return event.open
        ? { kind: "context", id: event.id }
        : state.kind === "context" && state.id === event.id
          ? { kind: "none" }
          : state;
    case "dismiss":
      return { kind: "none" };
    case "navigation": {
      const open =
        typeof event.value === "function"
          ? event.value(state.kind === "navigation")
          : event.value;
      return open
        ? { kind: "navigation" }
        : state.kind === "navigation"
          ? { kind: "none" }
          : state;
    }
    case "header": {
      const value =
        typeof event.value === "function"
          ? event.value(state.kind === "header" ? state.action : undefined)
          : event.value;
      return value
        ? { kind: "header", action: value }
        : state.kind === "header"
          ? { kind: "none" }
          : state;
    }
    case "quick-access": {
      const value =
        typeof event.value === "function"
          ? event.value(state.kind === "quick-access" ? state.tab : undefined)
          : event.value;
      return value
        ? { kind: "quick-access", tab: value }
        : state.kind === "quick-access"
          ? { kind: "none" }
          : state;
    }
  }
}
