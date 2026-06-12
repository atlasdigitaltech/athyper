"use client";

// Lifted to @athyper/me-ui — typed against MePreferences/MePreferencesPatch
// and MeSavedView from @athyper/api-contracts/me, with the theme DOM applier
// injected via MeUIProvider (see apps/neon/app/providers.tsx).
//
// Re-exported under the legacy name so the existing settings page imports
// keep working.
export { PreferencesSection } from "@athyper/me-ui";
