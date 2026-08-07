/**
 * @athyper/platform-brand — TenantLogo
 *
 * Renders a tenant's uploaded wordmark with dark/light mode switching.
 * Falls back to the provided fallback node when no custom logos are uploaded.
 *
 * Light/dark selection:
 *   assets.wordmarkBlack → shown on light backgrounds (dark:hidden)
 *   assets.wordmarkWhite → shown on dark backgrounds (hidden dark:block)
 *
 * If the tenant has uploaded only one variant, it is shown in both modes.
 * If neither variant is a custom CDN URL, the fallback is rendered.
 */
import { type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import type { ResolvedBrandAssets } from "../types";

export interface TenantLogoProps {
  assets: ResolvedBrandAssets;
  alt: string;
  className?: string;
  /** Rendered when the tenant has no custom logo URLs. */
  fallback?: ReactNode;
}

/** True when the URL is a tenant-uploaded CDN asset, not a platform /brand/* default. */
function isCustomAsset(url: string | null | undefined): url is string {
  return !!url && !url.startsWith("/brand/");
}

export function TenantLogo({ assets, alt, className, fallback }: TenantLogoProps) {
  const hasLight = isCustomAsset(assets.wordmarkBlack);
  const hasDark  = isCustomAsset(assets.wordmarkWhite);

  if (!hasLight && !hasDark) return <>{fallback ?? null}</>;

  // Degrade gracefully when only one variant is uploaded.
  const lightSrc = hasLight ? assets.wordmarkBlack : (assets.wordmarkWhite as string);
  const darkSrc  = hasDark  ? assets.wordmarkWhite  : (assets.wordmarkBlack as string);

  return (
    <span className="relative inline-flex shrink-0">
      <img
        src={lightSrc}
        alt={alt}
        draggable={false}
        className={cn("block dark:hidden", className)}
      />
      <img
        src={darkSrc}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("hidden dark:block", className)}
      />
    </span>
  );
}
