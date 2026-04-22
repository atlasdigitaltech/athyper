/**
 * @athyper/brand
 *
 * Canonical brand assets for the Athyper product family.
 * This is the single source of truth for all logo lockups, icons, and brand metadata.
 *
 * Do not copy or recreate these assets in individual apps or Keycloak themes.
 * The Keycloak theme receives generated copies via `pnpm brand:refresh`.
 */

import type { SVGProps } from "react";

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {}

// ─── Neon ─────────────────────────────────────────────────────────────────────

/**
 * Neon primary lockup — three-polygon icon + "neon" wordmark + descriptor text.
 *
 * This is the official brand asset for:
 * - App login page (left panel)
 * - Keycloak login theme (left panel)
 * - Any full-brand hero placement
 *
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
      <text
        x="366"
        y="192"
        fill="currentColor"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="150"
        fontWeight="700"
        letterSpacing="-6"
      >
        neon
      </text>
      <text
        x="450"
        y="225"
        fill="currentColor"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="25"
        fontWeight="300"
        letterSpacing="7.5"
        opacity="0.55"
        textAnchor="middle"
      >
        Business Operating Platform
      </text>
    </svg>
  );
}

/**
 * Neon compact lockup — icon + wordmark only, no descriptor.
 *
 * Use in confined horizontal spaces: sidebar headers, mobile nav bars, compact cards.
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
      <text
        x="230"
        y="192"
        fill="currentColor"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="150"
        fontWeight="700"
        letterSpacing="-6"
      >
        neon
      </text>
    </svg>
  );
}

/**
 * Neon icon — three polygon marks only, no wordmark.
 *
 * Use as favicon, avatar, icon-only badge, or any context where text is redundant.
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

// ─── Brand metadata ───────────────────────────────────────────────────────────

export const NEON_BRAND = {
  productCode: "neon",
  productName: "neon",
  descriptor: "Business Operating Platform",
  logoFiles: {
    primary: "logo-primary.svg",
    compact: "logo-compact.svg",
    icon: "icon.svg",
  },
} as const;
