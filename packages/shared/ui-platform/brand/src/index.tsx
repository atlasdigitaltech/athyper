/**
 * @athyper/brand
 *
 * Shared brand contracts, types, and URL-path helpers.
 * Plane-specific SVG lockups live in packages/apps/{plane}/brand.
 */

import type { ComponentType, SVGProps } from "react";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {}

export type ProductId = "neon" | "mesh" | "admin";

export interface PublicBrandAssets {
  /**
   * URL paths are stable per app. Files at /brand/* are generated into each
   * app's public/brand folder by `pnpm brand:refresh`.
   */
  wordmarkBlack: string;
  wordmarkWhite: string;
  wordmarkOnBlack: string;
  wordmarkOnWhite: string;
  icon: string;
  appIcon: string;
  favicon: string;
}

/** Shape of a plane-specific brand entry exported from packages/apps/{plane}/brand. */
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

const PUBLIC_BRAND_ASSETS: PublicBrandAssets = {
  wordmarkBlack: "/brand/wordmark-black.png",
  wordmarkWhite: "/brand/wordmark-white.png",
  wordmarkOnBlack: "/brand/wordmark-on-black.png",
  wordmarkOnWhite: "/brand/wordmark-on-white.png",
  icon: "/brand/icon.png",
  appIcon: "/brand/appicon.png",
  favicon: "/brand/favicon.png",
};

/**
 * Returns the public brand asset URL paths for any product.
 * Each deployed app serves its own product-specific assets at these fixed paths.
 */
export function getPublicBrandAssets(_product?: ProductId): PublicBrandAssets {
  return PUBLIC_BRAND_ASSETS;
}
