/**
 * @athyper/platform-brand — asset resolution with three-tier fallback.
 *
 * Tier 1: tenant-uploaded CDN asset
 * Tier 2: explicit fallback passed by the caller
 * Tier 3: platform default (/brand/* static path)
 *
 * Each deployed app serves its own plane-specific assets at /brand/* via its
 * public/brand directory (populated by `pnpm brand:refresh`). The productId
 * argument is accepted for call-site documentation but does not change the
 * returned paths — the plane's public directory is always mounted at /brand/.
 */

import type { ProductId, PublicBrandAssets, TenantBrandConfig } from "./types";

// ── Platform defaults ─────────────────────────────────────────────────────────

const PLATFORM_BRAND_ASSETS: PublicBrandAssets = {
  wordmarkBlack:    "/brand/wordmark-black.png",
  wordmarkWhite:    "/brand/wordmark-white.png",
  wordmarkOnBlack:  "/brand/wordmark-on-black.png",
  wordmarkOnWhite:  "/brand/wordmark-on-white.png",
  icon:             "/brand/icon.png",
  appIcon:          "/brand/appicon.png",
  favicon:          "/brand/favicon.png",
  ogImage:          null,
  emailLogo:        null,
  pwaManifestIcon:  null,
  splashScreen:     null,
};

/**
 * Returns the platform default brand asset URLs for the given plane.
 *
 * The productId is informational only — each deployed app mounts its own
 * plane-specific assets at the canonical /brand/* path.
 */
export function getPublicBrandAssets(_productId?: ProductId): PublicBrandAssets {
  return PLATFORM_BRAND_ASSETS;
}

// ── Asset key map (TenantBrandConfig field → PublicBrandAssets key) ───────────

const ASSET_KEY_MAP = {
  logoWordmarkLight: "wordmarkBlack",
  logoWordmarkDark:  "wordmarkWhite",
  logoMark:          "icon",
  favicon:           "favicon",
  ogImage:           "ogImage",
  emailLogo:         "emailLogo",
  pwaManifestIcon:   "pwaManifestIcon",
  splashScreen:      "splashScreen",
} as const satisfies Partial<Record<keyof TenantBrandConfig, keyof PublicBrandAssets>>;

/**
 * Resolves a single brand asset URL using the three-tier fallback chain:
 *   tenant CDN → explicit fallback → platform default.
 */
export function resolveBrandAssetUrl(
  config: TenantBrandConfig | null,
  assetKey: keyof typeof ASSET_KEY_MAP,
  fallback?: string,
): string | null {
  const tenantValue = config?.[assetKey];
  if (tenantValue != null) return tenantValue;
  if (fallback != null) return fallback;
  const platformKey = ASSET_KEY_MAP[assetKey];
  return PLATFORM_BRAND_ASSETS[platformKey] ?? null;
}

/**
 * Resolves the full PublicBrandAssets map for a tenant, merging tenant
 * overrides with platform defaults.
 */
export function resolveAllBrandAssets(
  config: TenantBrandConfig | null,
): PublicBrandAssets {
  return {
    wordmarkBlack:   config?.logoWordmarkLight ?? PLATFORM_BRAND_ASSETS.wordmarkBlack,
    wordmarkWhite:   config?.logoWordmarkDark  ?? PLATFORM_BRAND_ASSETS.wordmarkWhite,
    wordmarkOnBlack: config?.logoWordmarkDark  ?? PLATFORM_BRAND_ASSETS.wordmarkOnBlack,
    wordmarkOnWhite: config?.logoWordmarkLight ?? PLATFORM_BRAND_ASSETS.wordmarkOnWhite,
    icon:            config?.logoMark          ?? PLATFORM_BRAND_ASSETS.icon,
    appIcon:         config?.logoMark          ?? PLATFORM_BRAND_ASSETS.appIcon,
    favicon:         config?.favicon           ?? PLATFORM_BRAND_ASSETS.favicon,
    ogImage:         config?.ogImage           ?? PLATFORM_BRAND_ASSETS.ogImage,
    emailLogo:       config?.emailLogo         ?? PLATFORM_BRAND_ASSETS.emailLogo,
    pwaManifestIcon: config?.pwaManifestIcon   ?? PLATFORM_BRAND_ASSETS.pwaManifestIcon,
    splashScreen:    config?.splashScreen      ?? PLATFORM_BRAND_ASSETS.splashScreen,
  };
}

/**
 * Returns true when the tenant has uploaded at least one custom logo asset
 * (i.e. any logo field is a CDN URL rather than a platform /brand/* default).
 */
export function hasCustomBrandAssets(config: TenantBrandConfig | null): boolean {
  if (!config) return false;
  return !!(
    config.logoWordmarkLight ||
    config.logoWordmarkDark  ||
    config.logoMark          ||
    config.favicon
  );
}
