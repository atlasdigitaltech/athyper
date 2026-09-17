"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { EntitySectionWorkspace } from "@athyper/platform-entity-form-detail";
export type CompositionView = "compose" | "preview" | "changes" | "checks";
const Navigation = createContext<{
  view?: CompositionView;
  go: (view: CompositionView, focus?: boolean) => void;
  counts: (changes: number, issues: number) => void;
}>({ go: () => {}, counts: () => {} });
export const useCompositionNavigation = () => useContext(Navigation);
export function CompositionNavigation({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    view: "compose" as CompositionView,
    focus: false,
    sequence: 0,
  });
  const view = state.view;
  const [counts, setCounts] = useState([0, 0]);
  const updateCounts = useCallback(
    (changes: number, issues: number) =>
      setCounts((old) =>
        old[0] === changes && old[1] === issues ? old : [changes, issues],
      ),
    [],
  );
  const go = (next: CompositionView, focus = true) =>
    setState((old) => ({ view: next, focus, sequence: old.sequence + 1 }));
  useEffect(() => {
    if (!state.focus) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(
        state.view === "changes"
          ? "studio-composition-differences"
          : `composition-view-${state.view}`,
      );
      target?.focus();
      target?.scrollIntoView?.({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);
  return (
    <Navigation.Provider
      value={{
        view,
        go,
        counts: updateCounts,
      }}
    >
      <EntitySectionWorkspace
        label="Workspace view"
        activeSection={view}
        onNavigate={(key) => go(key as CompositionView)}
        sections={[
          { key: "compose", label: "Compose" },
          { key: "preview", label: "Preview" },
          { key: "changes", label: "Changes", count: counts[0] },
          { key: "checks", label: "Checks", count: counts[1] },
        ]}
      >
        {children}
      </EntitySectionWorkspace>
    </Navigation.Provider>
  );
}
