/**
 * Greyscale companion to Atlas Modern: no brand hue, chroma reserved for
 * status colors (danger/warning/success/focus), which stay unchanged so
 * status meaning never depends on shade alone.
 */
export const ATLAS_MONO_BRAND = Object.freeze({
  id: "atlas-mono",
  name: "Atlas Mono",
  colors: Object.freeze({
    primary: "#1a1a1a",
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

export type AtlasMonoBrand = typeof ATLAS_MONO_BRAND;
