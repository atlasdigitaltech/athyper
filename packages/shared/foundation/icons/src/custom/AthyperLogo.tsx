/**
 * @athyper/icons — Athyper Logo
 *
 * The only custom SVG in the icons package.
 * Everything else maps to Lucide components.
 *
 * Renders the brand mark: a filled circle with three white polygon cutouts
 * forming the stylised "A". The circle uses fill="currentColor" so a Tailwind
 * text color class controls the brand color (e.g. "text-primary", "text-white").
 *
 * The cutout polygons are always white — this logo is intended for use on
 * coloured or dark backgrounds.
 *
 * Usage:
 *   <AthyperLogo className="text-primary" width={32} height={32} />
 */
import { type SVGProps } from "react";

export function AthyperLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      role="img"
      aria-label="Athyper"
      width={24}
      height={24}
      {...props}
    >
      {/* Brand circle — colour controlled by currentColor / text-* class */}
      <circle cx="256" cy="290" r="220" fill="currentColor" />
      {/* White cutouts forming the stylised "A" mark */}
      <polygon points="237,108 91,415 171,415 278,192" fill="white" />
      <polygon points="360,250 287,250 208,415 283,415" fill="white" />
      <polygon points="365,307 329,381 347,415 420,415" fill="white" />
    </svg>
  );
}
