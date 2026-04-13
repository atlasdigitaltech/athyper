"use client";

/**
 * usePreferencesStore — Zustand store for UI preferences.
 *
 * Stores appearance, density, theme preset, and sidebar state.
 * Seeded from bootstrap `uiProfile` (server-side) — not from localStorage.
 * Writes are persisted to `principal_ui_profile` via the Settings page API.
 *
 * Adapted from F1/stores/preferences/preferences-store.ts
 * Maps to athyper's @athyper/theme preset registry instead of F1's theme system.
 *
 * DOM sync:
 *   - `themePreset` → document.documentElement.dataset.themePreset
 *   - `appearanceMode` (resolved to 'light'|'dark') → document.documentElement.classList
 *   - `densityCode` → document.documentElement.dataset.density
 */

import { create } from "zustand";

import type { ThemePresetMeta } from "@athyper/theme";

// ── Types ────────────────────────────────────────────────────────────────────

export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedAppearanceMode = "light" | "dark";
export type DensityCode = "compact" | "comfortable" | "spacious";

/** Preset value — must match a `ThemePresetMeta.value` in @athyper/theme. */
export type ThemePresetValue = ThemePresetMeta["value"];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const PREFERENCES_DEFAULTS = {
  appearanceMode: "system" as AppearanceMode,
  resolvedAppearanceMode: "light" as ResolvedAppearanceMode,
  themePreset: "base" as ThemePresetValue,
  densityCode: "comfortable" as DensityCode,
  sidebarCollapsed: false,
} as const;

// ── State ─────────────────────────────────────────────────────────────────────

export interface PreferencesState {
  appearanceMode: AppearanceMode;
  resolvedAppearanceMode: ResolvedAppearanceMode;
  themePreset: ThemePresetValue;
  densityCode: DensityCode;
  sidebarCollapsed: boolean;

  /** True once seeded from bootstrap response. */
  isSynced: boolean;

  // Setters
  setAppearanceMode: (mode: AppearanceMode) => void;
  setResolvedAppearanceMode: (mode: ResolvedAppearanceMode) => void;
  setThemePreset: (preset: ThemePresetValue) => void;
  setDensityCode: (density: DensityCode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setIsSynced: (synced: boolean) => void;

  /**
   * Seed the store from bootstrap `uiProfile`.
   * Called once on login / session hydration.
   */
  seedFromBootstrap: (profile: Partial<PreferencesBootstrapInput>) => void;
}

export interface PreferencesBootstrapInput {
  appearanceMode: string;
  densityCode: string;
  themePreset?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePreferencesStore = create<PreferencesState>((set) => ({
  appearanceMode: PREFERENCES_DEFAULTS.appearanceMode,
  resolvedAppearanceMode: PREFERENCES_DEFAULTS.resolvedAppearanceMode,
  themePreset: PREFERENCES_DEFAULTS.themePreset,
  densityCode: PREFERENCES_DEFAULTS.densityCode,
  sidebarCollapsed: PREFERENCES_DEFAULTS.sidebarCollapsed,
  isSynced: false,

  setAppearanceMode: (mode) => {
    const resolved: ResolvedAppearanceMode =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    set({ appearanceMode: mode, resolvedAppearanceMode: resolved });
    syncAppearanceToDom(resolved);
  },

  setResolvedAppearanceMode: (mode) => {
    set({ resolvedAppearanceMode: mode });
    syncAppearanceToDom(mode);
  },

  setThemePreset: (preset) => {
    set({ themePreset: preset });
    syncPresetToDom(preset);
  },

  setDensityCode: (density) => {
    set({ densityCode: density });
    syncDensityToDom(density);
  },

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setIsSynced: (synced) => set({ isSynced: synced }),

  seedFromBootstrap: (profile) => {
    const themePreset =
      (profile.themePreset as ThemePresetValue | undefined) ??
      PREFERENCES_DEFAULTS.themePreset;
    const appearanceMode =
      (profile.appearanceMode as AppearanceMode | undefined) ??
      PREFERENCES_DEFAULTS.appearanceMode;
    const densityCode =
      (profile.densityCode as DensityCode | undefined) ??
      PREFERENCES_DEFAULTS.densityCode;

    const resolved: ResolvedAppearanceMode =
      appearanceMode === "system"
        ? typeof window !== "undefined" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : appearanceMode;

    set({
      themePreset,
      appearanceMode,
      resolvedAppearanceMode: resolved,
      densityCode,
      isSynced: true,
    });

    syncPresetToDom(themePreset);
    syncAppearanceToDom(resolved);
    syncDensityToDom(densityCode);
  },
}));

// ── DOM sync helpers ──────────────────────────────────────────────────────────

function syncPresetToDom(preset: string) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreset = preset;
}

function syncAppearanceToDom(mode: ResolvedAppearanceMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function syncDensityToDom(density: DensityCode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}
