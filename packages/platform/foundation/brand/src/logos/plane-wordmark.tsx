/**
 * @athyper/platform-brand — PlaneWordmark
 *
 * Renders the plane's static PNG wordmark with dark/light mode switching.
 * Shows wordmarkBlack (dark-coloured logo) on light backgrounds and
 * wordmarkWhite (light-coloured logo) on dark backgrounds via Tailwind dark:.
 *
 * Requires Tailwind darkMode configured for '[data-theme="dark"]' or '.dark'.
 *
 * @example
 *   <PlaneWordmark
 *     light={brand.wordmarkBlack}
 *     dark={brand.wordmarkWhite}
 *     alt="neon"
 *     className="h-5 w-auto max-w-36 object-contain"
 *   />
 */
import { cn } from "@athyper/platform-theme/utils";

export interface PlaneWordmarkProps {
  /** URL to the wordmark for LIGHT backgrounds (dark-coloured logo). */
  light: string;
  /** URL to the wordmark for DARK backgrounds (light-coloured logo). */
  dark: string;
  alt: string;
  className?: string;
}

export function PlaneWordmark({ light, dark, alt, className }: PlaneWordmarkProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <img
        src={light}
        alt={alt}
        draggable={false}
        className={cn("block dark:hidden", className)}
      />
      <img
        src={dark}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("hidden dark:block", className)}
      />
    </span>
  );
}
