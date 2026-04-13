"use client";

/**
 * useNavStore — Zustand store for caching the navigation tree per workbench.
 *
 * Prevents redundant sidebar re-fetches on every render.
 * Cleared on workbench toggle, role change, or delegation activate/deactivate.
 *
 * Ported from F1/stores/nav/nav-store.ts — adapted for @athyper/navigation types.
 */

import { create } from "zustand";

import type { MenuWorkspaceGroup } from "@athyper/navigation";

/** Cached navigation tree keyed by workbench code. */
export type NavTree = MenuWorkspaceGroup[];

interface NavState {
  /** Per-workbench nav tree cache. */
  trees: Record<string, NavTree>;
  /** Cache the resolved tree for a workbench. */
  setTree: (workbench: string, tree: NavTree) => void;
  /** Retrieve the cached tree, or undefined if not yet fetched. */
  getTree: (workbench: string) => NavTree | undefined;
  /**
   * Invalidate all cached trees.
   * Call on: workbench toggle, delegation activate/deactivate, logout.
   */
  clearAll: () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  trees: {},

  setTree: (workbench, tree) =>
    set((state) => ({
      trees: { ...state.trees, [workbench]: tree },
    })),

  getTree: (workbench) => get().trees[workbench],

  clearAll: () => set({ trees: {} }),
}));
