/**
 * @athyper/platform-icons — Shared Types
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

/**
 * Resolver function signature — accepts a string key and returns an icon
 * component (or undefined for unknown keys).
 */
export type IconResolverFn = (key: string) => IconComponent | undefined;

/**
 * Tenant-level icon overrides. Map an icon key to a custom icon component
 * to replace the platform default without patching the registry.
 *
 * Keys are the same strings accepted by the registry functions
 * (e.g., module codes, entity icon_key values, action verbs).
 */
export type TenantIconOverrides = Record<string, IconComponent>;
