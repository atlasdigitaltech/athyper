/**
 * @athyper/icons — Athyper Logo
 *
 * The only custom SVG in the icons package.
 * Everything else maps to Lucide components.
 *
 * Renders with stroke="currentColor" so it adapts to any theme preset.
 * Use a Tailwind text color class to control the color.
 *
 * Usage:
 *   <AthyperLogo className="text-primary" width={32} height={32} />
 */
import { type SVGProps } from "react";

export function AthyperLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={24}
      height={24}
      {...props}
    >
      {/* Stylised "A" with circuit/node motif */}
      <path d="M12 2L3 20h4l1.5-4h7L17 20h4L12 2z" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="12.5" x2="12" y2="16" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}
