"use client";

// stores/nav/nav-store.ts
//
// Zustand store for caching the navigation tree per workbench.
// Prevents re-fetching on every sidebar render.

import { create } from "zustand";

import type { NavTree } from "@/lib/nav/nav-types";

interface NavState {
    /** Cached nav trees keyed by workbench ID. */
    trees: Record<string, NavTree>;
    /** Set the nav tree for a workbench. */
    setTree: (workbench: string, tree: NavTree) => void;
    /** Get the cached nav tree for a workbench. */
    getTree: (workbench: string) => NavTree | undefined;
    /** Clear all cached trees (e.g., on workbench switch or role change). */
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
