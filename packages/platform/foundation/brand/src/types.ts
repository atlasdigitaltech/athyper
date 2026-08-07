/**
 * @athyper/platform-brand — Canonical brand types.
 *
 * TenantBrandConfig   — what is stored in the DB per tenant.
 * ResolvedBrandConfig — what the server produces and the client consumes.
 * ResolvedBrandAssets — full asset URL map with OG/email/PWA slots.
 */

import type { ComponentType, SVGProps } from "react";

// ── Shared ────────────────────────────────────────────────────────────────────

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {}

/** All four deployed planes, including the platform-level Athyper brand. */
export type ProductId = "athyper" | "neon" | "mesh" | "admin";

/**
 * Asset URLs for a plane's brand static files (served from /brand/*).
 *
 * Naming convention:
 *   wordmarkBlack   = dark-coloured logo → use on LIGHT backgrounds
 *   wordmarkWhite   = light-coloured logo → use on DARK backgrounds
 *   wordmarkOnBlack = light-coloured logo overlaid on a dark bg (marketing use)
 *   wordmarkOnWhite = dark-coloured logo overlaid on a white bg (marketing use)
 */
export interface PublicBrandAssets {
  wordmarkBlack: string;
  wordmarkWhite: string;
  wordmarkOnBlack: string;
  wordmarkOnWhite: string;
  /** Square icon mark (e.g. app launcher tile). */
  icon: string;
  /** App icon for PWA manifest and home-screen. */
  appIcon: string;
  /** Browser tab favicon (ICO or PNG). */
  favicon: string;
  /** Open Graph image for link previews (1200×630). Null when not yet produced by the build pipeline. */
  ogImage: string | null;
  /** Email-safe logo (PNG, max 200 px wide). Null when not yet produced by the build pipeline. */
  emailLogo: string | null;
  /** PWA manifest icon (512×512 PNG). Null when not yet produced by the build pipeline. */
  pwaManifestIcon: string | null;
  /** PWA/native splash screen. Null when the plane has no PWA target. */
  splashScreen: string | null;
}

/** Shape of a plane-specific brand entry (packages/products/{plane}/brand). */
export interface ProductBrandEntry {
  productCode: ProductId;
  productName: string;
  descriptor: string;
  Icon: ComponentType<LogoProps>;
  IconMark: ComponentType<LogoProps>;
  LogoCompact: ComponentType<LogoProps>;
  LogoPrimary: ComponentType<LogoProps>;
  publicAssets: PublicBrandAssets;
}

// ── Tenant-level customisation ────────────────────────────────────────────────

/**
 * Per-tenant brand configuration stored in the database.
 * All asset fields are nullable — null means "use platform default".
 *
 * DB: brand_config jsonb column on master.tenant
 */
export interface TenantBrandConfig {
  /**
   * Customer primary color in #hex. Drives CSS variable overrides via
   * generateBrandColorOverrides(). When absent the presetBase is used.
   */
  primaryHex?: string;
  /** Optional accent hex. Defaults to a +30° hue-shifted variant of primary. */
  accentHex?: string;
  /**
   * One of the shipped preset names (e.g. "athyper-base", "neon-modern").
   * Serves as the color foundation that brand overrides are layered on top of.
   */
  presetBase: string;
  /** Google Fonts or self-hosted @font-face URL for the sans-serif stack. */
  fontSansUrl?: string | null;
  /** Google Fonts or self-hosted @font-face URL for the monospace stack. */
  fontMonoUrl?: string | null;
  /**
   * CDN URL for the wordmark used on LIGHT backgrounds (dark-coloured logo).
   * Maps to wordmarkBlack in the resolved asset map.
   */
  logoWordmarkLight?: string | null;
  /**
   * CDN URL for the wordmark used on DARK backgrounds (light-coloured logo).
   * Maps to wordmarkWhite in the resolved asset map.
   */
  logoWordmarkDark?: string | null;
  /** CDN URL for the square icon mark. */
  logoMark?: string | null;
  /** CDN URL for the favicon. */
  favicon?: string | null;
  /** CDN URL for the OG image (1200×630). */
  ogImage?: string | null;
  /** CDN URL for the email logo. */
  emailLogo?: string | null;
  /** CDN URL for the PWA manifest icon (512×512). */
  pwaManifestIcon?: string | null;
  /** CDN URL for the PWA splash screen. */
  splashScreen?: string | null;
}

/**
 * Resolved asset map — same shape as PublicBrandAssets with tenant assets
 * overlaid where available and platform defaults filled for the rest.
 */
export type ResolvedBrandAssets = PublicBrandAssets;

/**
 * Server-produced, client-consumed brand snapshot.
 *
 * Produced by /api/brand/config and passed as a prop to <BrandProvider>.
 * Cached by ETag.
 */
export interface ResolvedBrandConfig {
  tenantId: string;
  /**
   * True when the tenant has uploaded at least one custom logo asset.
   * Used by LogoSlot to decide whether to render the tenant logo or the
   * product SVG fallback.
   */
  hasCustomBrand: boolean;
  /**
   * Preset CSS class name for <html data-theme-preset="...">. Controls
   * which shipped preset is used as the color foundation.
   */
  presetBase: string;
  /**
   * CSS variable overrides (brand delta). Apply on top of presetBase.
   * `light` overrides go in `:root`; `dark` overrides go in `.dark :root`.
   * Only variables that differ from the base preset are included.
   */
  cssVariableOverrides: { light: Record<string, string>; dark: Record<string, string> };
  /** Custom sans-serif font URL, or null to use the platform Geist stack. */
  fontSansUrl: string | null;
  /** Custom monospace font URL, or null to use the platform Geist Mono stack. */
  fontMonoUrl: string | null;
  /** Resolved asset URLs with tenant overrides and platform fallbacks applied. */
  assets: ResolvedBrandAssets;
  /** ETag for HTTP 304 caching on the /api/brand/config route. */
  etag?: string;
}
