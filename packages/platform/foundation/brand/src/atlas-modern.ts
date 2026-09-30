/**
 * Canonical Athyper visual identity shared by browser metadata, UI themes,
 * Keycloak, and gateway-owned public surfaces.
 */
export const ATLAS_MODERN_BRAND = Object.freeze({
  id: "atlas-modern",
  name: "Atlas Modern",
  colors: Object.freeze({
    primary: "#234B84",
    primaryForeground: "#FFFFFF",
    primaryHover: "color-mix(in srgb, var(--a-brand) 82%, black)",
    primarySoft: "color-mix(in srgb, var(--a-brand) 8%, white)",
    storyStart: "color-mix(in srgb, var(--a-brand) 24%, black)",
    storyEnd: "color-mix(in srgb, var(--a-brand) 64%, black)",
    storyForeground: "var(--a-brand-foreground)",
    storyMuted: "color-mix(in srgb, var(--a-brand-foreground) 78%, transparent)",
    storyEyebrow: "color-mix(in srgb, var(--a-brand) 38%, white)",
    storyWave: "color-mix(in srgb, var(--a-brand) 55%, white)",
    storyWaveBright: "color-mix(in srgb, var(--a-brand) 38%, white)",
    storyGlow: "color-mix(in srgb, var(--a-brand) 30%, transparent)",
    storyDot: "color-mix(in srgb, var(--a-brand-foreground) 70%, transparent)",
  }),
});

export type AtlasModernBrand = typeof ATLAS_MODERN_BRAND;
