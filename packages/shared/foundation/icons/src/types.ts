/**
 * @athyper/icons — Shared Types
 */
import { type LucideIcon } from "lucide-react";

/** Any icon component that accepts standard Lucide props. */
export type IconComponent = LucideIcon;

/** Standard props passed to icon wrapper components. */
export interface IconProps {
  /** Icon size in pixels. Default: 16. */
  size?: number;
  /** Tailwind class string. currentColor means theme text color applies automatically. */
  className?: string;
  /** Accessible label for screen readers. */
  "aria-label"?: string;
}
