"use client";
import { useCallback, useReducer, useEffect, type SetStateAction } from "react";
import type { ShellQuickAccessTab } from "./quick-access";
import { type HeaderActionKind } from "./shell-surfaces";

import { initialOverlayState, reduceShellOverlay } from "./shell-overlay-state";

export function useShellSurfaces() {
  const [state, send] = useReducer(reduceShellOverlay, initialOverlayState);
  const surface = state.surface;
  const dispatch = useCallback(
    (event: import("./shell-surfaces").ShellSurfaceAction) =>
      send({ type: "surface", event }),
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => send({ type: "compact", value: media.matches });
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const setAtlasOpen = useCallback(
    (value: SetStateAction<boolean>) =>
      send({ type: "atlas", field: "open", value }),
    [],
  );
  const setAtlasPinned = useCallback(
    (value: SetStateAction<boolean>) =>
      send({ type: "atlas", field: "pinned", value }),
    [],
  );
  const setAtlasFull = useCallback(
    (value: SetStateAction<boolean>) =>
      send({ type: "atlas", field: "full", value }),
    [],
  );
  const setContext = useCallback(
    (id: string, open: boolean) => dispatch({ type: "context", id, open }),
    [dispatch],
  );
  const dismissContext = useCallback(
    () => send({ type: "dismiss-context" }),
    [],
  );
  const setDrawerOpen = useCallback(
    (value: SetStateAction<boolean>) => dispatch({ type: "navigation", value }),
    [],
  );
  const setHeaderAction = useCallback(
    (value: SetStateAction<HeaderActionKind | undefined>) =>
      dispatch({ type: "header", value }),
    [],
  );
  const setQuickAccessTab = useCallback(
    (value: SetStateAction<ShellQuickAccessTab | undefined>) =>
      dispatch({ type: "quick-access", value }),
    [],
  );
  const dismissTransient = useCallback(() => dispatch({ type: "dismiss" }), []);
  return {
    surface,
    setContext,
    dismissContext,
    compact: state.compact,
    atlasOpen: state.atlas.open,
    atlasPinned: state.atlas.pinned,
    atlasFull: state.atlas.full,
    setAtlasOpen,
    setAtlasPinned,
    setAtlasFull,
    drawerOpen: surface.kind === "navigation",
    headerAction: surface.kind === "header" ? surface.action : undefined,
    quickAccessTab: surface.kind === "quick-access" ? surface.tab : undefined,
    setDrawerOpen,
    setHeaderAction,
    setQuickAccessTab,
    dismissTransient,
  };
}
