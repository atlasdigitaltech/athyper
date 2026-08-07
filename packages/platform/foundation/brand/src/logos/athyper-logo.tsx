/**
 * @athyper/platform-brand — Athyper platform logo mark.
 *
 * A filled circle with the stylised "A" cut through it using SVG evenodd fill
 * rule. The entire mark is a single currentColor path — no hardcoded colours —
 * so it works on any background at any text colour.
 *
 * @example
 *   <AthyperLogo className="h-6 w-6 text-sidebar-primary" />   // coloured
 *   <AthyperLogo className="h-6 w-6 text-foreground" />        // adapts to theme
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
      {/*
        Single evenodd path: circle outer shape + three polygon subpaths.
        Where the polygons overlap the circle, evenodd punches them through
        as transparent cutouts — no hardcoded fill="white" needed.
      */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M 256,290 m -220,0 a 220,220 0 1,0 440,0 a 220,220 0 1,0 -440,0
          M 237,108 L 91,415 L 171,415 L 278,192 Z
          M 360,250 L 287,250 L 208,415 L 283,415 Z
          M 365,307 L 329,381 L 347,415 L 420,415 Z
        "
      />
    </svg>
  );
}
