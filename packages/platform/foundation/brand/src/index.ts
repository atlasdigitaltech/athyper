/**
 * @athyper/platform-brand
 *
 * Brand contracts, runtime utilities, and React surfaces for Athyper.
 * Maps tenant configuration and product identity to CSS variables,
 * asset URLs, and logo components.
 *
 * Prefer subpath imports for clarity:
 *   import { AthyperLogo, PlaneWordmark } from "@athyper/platform-brand/logos";
 *   import { TenantLogo, LogoSlot }       from "@athyper/platform-brand/tenant";
 *
 * Or use this barrel for multiple imports:
 *   import { BrandProvider, useBrand, getPublicBrandAssets } from "@athyper/platform-brand";
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  LogoProps,
  ProductId,
  PublicBrandAssets,
  ProductBrandEntry,
  TenantBrandConfig,
  ResolvedBrandConfig,
  ResolvedBrandAssets,
} from "./types";

// ── Asset resolution ──────────────────────────────────────────────────────────
export {
  getPublicBrandAssets,
  resolveBrandAssetUrl,
  resolveAllBrandAssets,
  hasCustomBrandAssets,
} from "./brand-assets";

// ── CSS variable generation ───────────────────────────────────────────────────
export { buildBrandCssOverrides, buildCssStyleBlock } from "./brand-css";

// ── React brand surface ───────────────────────────────────────────────────────
export { BrandProvider, useBrand } from "./brand-provider";
export type { BrandProviderProps } from "./brand-provider";

// ── Platform logo + plane wordmark ───────────────────────────────────────────
export { AthyperLogo, PlaneWordmark } from "./logos/index";
export type { PlaneWordmarkProps } from "./logos/index";

// ── Tenant logo + logo slot ───────────────────────────────────────────────────
export { TenantLogo, LogoSlot } from "./tenant/index";
export type { TenantLogoProps, LogoSlotProps } from "./tenant/index";
