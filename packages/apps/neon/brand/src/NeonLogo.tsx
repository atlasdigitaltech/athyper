/**
 * @athyper/icons — Neon Product Logo
 *
 * Fills with currentColor — use a Tailwind text color class to control the color.
 *
 * Usage:
 *   <NeonLogo className="text-primary-foreground" width={56} height={56} />
 */
import { type SVGProps } from "react";

export function NeonLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 278 257"
      fill="currentColor"
      role="img"
      aria-label="Neon logo"
      width={278}
      height={257}
      {...props}
    >
      <polygon points="125,17 14,244 75,244 155,82" />
      <polygon points="223,120 169,120 109,244 163,243" />
      <polygon points="225,164 199,220 212,244 263,244" />
    </svg>
  );
}
