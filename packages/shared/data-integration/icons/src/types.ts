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
  /**
   * Stroke width. Default: 2 (Lucide default).
   * Use 1.5 for large display icons, 2.5 for very small badges.
   */
  strokeWidth?: number;
  /** Tailwind class string. currentColor means theme text color applies automatically. */
  className?: string;
  /** Accessible label. Set when the icon conveys meaning not present in surrounding text. */
  "aria-label"?: string;
  /** Set to true when the icon is purely decorative beside visible text. */
  "aria-hidden"?: boolean | "true" | "false";
}
