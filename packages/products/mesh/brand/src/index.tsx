/**
 * @athyper/app-mesh-brand
 *
 * Mesh plane brand assets — SVG lockups and product registry entry.
 * Static source assets live in src/ (built by pnpm brand:refresh).
 */

import type { LogoProps, ProductBrandEntry, PublicBrandAssets } from "@athyper/brand";
import { getPublicBrandAssets } from "@athyper/brand";

// ─── SVG Components ────────────────────────────────────────────────────────────

/**
 * Mesh icon mark — 2 × 2 grid, square 180 × 180 viewBox.
 * Optimised for 24–32 px rendering in nav rails and topbars.
 */
export function MeshIconMark({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      fill="currentColor"
      role="img"
      aria-label="mesh"
      className={className}
      {...props}
    >
      <polygon points="8,8 84,8 84,84 8,84" />
      <polygon points="96,8 172,8 172,84 96,84" />
      <polygon points="8,96 84,96 84,172 8,172" />
      <polygon points="96,96 172,96 172,172 96,172" />
    </svg>
  );
}

/**
 * Mesh icon — four-square grid mark.
 * viewBox: 278 × 257
 */
export function MeshIcon({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 278 257"
      fill="currentColor"
      role="img"
      aria-label="mesh"
      className={className}
      {...props}
    >
      <polygon points="19,9 129,9 129,119 19,119" />
      <polygon points="149,9 259,9 259,119 149,119" />
      <polygon points="19,138 129,138 129,248 19,248" />
      <polygon points="149,138 259,138 259,248 149,248" />
    </svg>
  );
}

/**
 * Mesh compact lockup — grid icon + "mesh" wordmark.
 * viewBox: 550 × 210
 */
export function MeshLogoCompact({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 550 210"
      role="img"
      aria-label="mesh"
      className={className}
      {...props}
    >
      <g transform="translate(20,12) scale(0.7)">
        <polygon points="19,9 129,9 129,119 19,119" fill="currentColor" />
        <polygon points="149,9 259,9 259,119 149,119" fill="currentColor" />
        <polygon points="19,138 129,138 129,248 19,248" fill="currentColor" />
        <polygon points="149,138 259,138 259,248 149,248" fill="currentColor" />
      </g>
      <text x="230" y="192" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="150" fontWeight="700" letterSpacing="-6">mesh</text>
    </svg>
  );
}

// ─── Brand Entry ───────────────────────────────────────────────────────────────

const publicAssets: PublicBrandAssets = getPublicBrandAssets("mesh");

export const meshBrandEntry: ProductBrandEntry = {
  productCode: "mesh",
  productName: "mesh",
  descriptor: "Partner Network",
  Icon: MeshIcon,
  IconMark: MeshIconMark,
  LogoCompact: MeshLogoCompact,
  LogoPrimary: MeshLogoCompact,
  publicAssets,
};
