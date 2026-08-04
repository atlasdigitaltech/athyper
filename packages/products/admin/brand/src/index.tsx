/**
 * @athyper/app-admin-brand
 *
 * Admin plane brand assets — SVG lockups and product registry entry.
 * Static source assets live in src/ (built by pnpm brand:refresh).
 */

import type { LogoProps, ProductBrandEntry, PublicBrandAssets } from "@athyper/brand";
import { getPublicBrandAssets } from "@athyper/brand";

// ─── SVG Components ────────────────────────────────────────────────────────────

/**
 * Admin icon mark — hexagonal ring, square 180 × 180 viewBox.
 * Optimised for 24–32 px rendering.
 */
export function AdminIconMark({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      fill="currentColor"
      role="img"
      aria-label="admin"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M90,8 L170,54 L170,126 L90,172 L10,126 L10,54 Z
           M90,42 L142,72 L142,108 L90,138 L38,108 L38,72 Z"
      />
    </svg>
  );
}

/**
 * Admin icon — hexagonal ring mark.
 * viewBox: 278 × 257
 */
export function AdminIcon({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 278 257"
      fill="currentColor"
      role="img"
      aria-label="admin"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M139,10 L241,69 L241,187 L139,246 L37,187 L37,69 Z
           M139,63 L195,96 L195,160 L139,193 L83,160 L83,96 Z"
      />
    </svg>
  );
}

/**
 * Admin compact lockup — hexagonal ring icon + "admin" wordmark.
 * viewBox: 580 × 210
 */
export function AdminLogoCompact({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 580 210"
      role="img"
      aria-label="admin"
      className={className}
      {...props}
    >
      <g transform="translate(20,12) scale(0.7)">
        <path
          fillRule="evenodd"
          fill="currentColor"
          d="M139,10 L241,69 L241,187 L139,246 L37,187 L37,69 Z
             M139,63 L195,96 L195,160 L139,193 L83,160 L83,96 Z"
        />
      </g>
      <text x="230" y="192" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="150" fontWeight="700" letterSpacing="-6">admin</text>
    </svg>
  );
}

// ─── Brand Entry ───────────────────────────────────────────────────────────────

const publicAssets: PublicBrandAssets = getPublicBrandAssets("admin");

export const adminBrandEntry: ProductBrandEntry = {
  productCode: "admin",
  productName: "admin",
  descriptor: "Platform Control",
  Icon: AdminIcon,
  IconMark: AdminIconMark,
  LogoCompact: AdminLogoCompact,
  LogoPrimary: AdminLogoCompact,
  publicAssets,
};
