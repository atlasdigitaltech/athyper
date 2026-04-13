/**
 * Zustand store barrel.
 * Import stores directly from their source for tree-shaking,
 * or use this barrel for convenience.
 */

export { useNavStore, type NavTree } from "./nav/useNavStore";
export {
  usePreferencesStore,
  PREFERENCES_DEFAULTS,
  type AppearanceMode,
  type ResolvedAppearanceMode,
  type DensityCode,
  type ThemePresetValue,
  type PreferencesState,
  type PreferencesBootstrapInput,
} from "./preferences/usePreferencesStore";
