/**
 * @athyper/app-neon-brand
 *
 * Neon plane brand assets — SVG lockups and product registry entry.
 * Static source assets live in src/ (built by pnpm brand:refresh).
 */

import type { LogoProps, ProductBrandEntry, PublicBrandAssets } from "@athyper/platform-brand";
import { getPublicBrandAssets } from "@athyper/platform-brand";

// ─── SVG Components ────────────────────────────────────────────────────────────

/**
 * Neon primary lockup — three-polygon icon + "neon" wordmark + descriptor text.
 * viewBox: 900 × 230  |  designed for ~432 px rendered width at 60% of screen
 */
export function NeonLogoPrimary({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 900 230"
      role="img"
      aria-label="neon — Business Operating Platform"
      className={className}
      {...props}
    >
      <g transform="translate(176,35) scale(0.65)">
        <polygon points="125,17 14,244 75,244 155,82" fill="currentColor" />
        <polygon points="223,120 169,120 109,244 163,243" fill="currentColor" />
        <polygon points="225,164 199,220 212,244 263,244" fill="currentColor" />
      </g>
      <text x="366" y="192" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="150" fontWeight="700" letterSpacing="-6">neon</text>
      <text x="450" y="225" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="25" fontWeight="300" letterSpacing="7.5" opacity="0.55" textAnchor="middle">Business Operating Platform</text>
    </svg>
  );
}

/**
 * Neon compact lockup — icon + wordmark only, no descriptor.
 * viewBox: 550 × 210
 */
export function NeonLogoCompact({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 550 210"
      role="img"
      aria-label="neon"
      className={className}
      {...props}
    >
      <g transform="translate(40,35) scale(0.65)">
        <polygon points="125,17 14,244 75,244 155,82" fill="currentColor" />
        <polygon points="223,120 169,120 109,244 163,243" fill="currentColor" />
        <polygon points="225,164 199,220 212,244 263,244" fill="currentColor" />
      </g>
      <text x="230" y="192" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="150" fontWeight="700" letterSpacing="-6">neon</text>
    </svg>
  );
}

/**
 * Neon icon — three polygon marks only, no wordmark.
 * viewBox: 278 × 257
 */
export function NeonIcon({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 278 257"
      fill="currentColor"
      role="img"
      aria-label="neon"
      className={className}
      {...props}
    >
      <polygon points="125,17 14,244 75,244 155,82" />
      <polygon points="223,120 169,120 109,244 163,243" />
      <polygon points="225,164 199,220 212,244 263,244" />
    </svg>
  );
}

/**
 * Neon icon mark — three-peak cascade, square 156 × 156 viewBox.
 * Optimised for 24–32 px rendering in nav rails and topbars.
 */
export function NeonIconMark({ className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 156 156"
      fill="currentColor"
      role="img"
      aria-label="neon"
      className={className}
      {...props}
    >
      <polygon points="38,0 0,156 76,156" />
      <polygon points="88,40 122,40 130,156 96,156" />
      <polygon points="134,78 128,156 156,156" />
    </svg>
  );
}

// ─── Brand Entry ───────────────────────────────────────────────────────────────

const publicAssets: PublicBrandAssets = getPublicBrandAssets("neon");

export const neonBrandEntry: ProductBrandEntry = {
  productCode: "neon",
  productName: "neon",
  descriptor: "Business Operating Platform",
  Icon: NeonIcon,
  IconMark: NeonIconMark,
  LogoCompact: NeonLogoCompact,
  LogoPrimary: NeonLogoPrimary,
  publicAssets,
};
