/**
 * @athyper/platform-brand — LogoSlot
 *
 * The canonical logo surface for shell topbars and sidebars.
 * Renders the tenant's custom wordmark when hasCustomBrand is true;
 * falls back to the product's SVG logo component otherwise.
 *
 * @example
 *   // In a product shell (neon/mesh/admin):
 *   <LogoSlot
 *     config={brand}
 *     productEntry={neonBrandEntry}
 *     variant="compact"
 *     className="h-5 w-auto max-w-36"
 *   />
 */
import { cn } from "@athyper/platform-theme/utils";
import type { ProductBrandEntry, ResolvedBrandConfig } from "../types";
import { TenantLogo } from "./tenant-logo";

export interface LogoSlotProps {
  /** Server-resolved brand config from BrandProvider or direct prop. */
  config: ResolvedBrandConfig;
  /** The plane's canonical brand entry (neonBrandEntry, meshBrandEntry, etc.). */
  productEntry: ProductBrandEntry;
  /**
   * Which product SVG component to use as the fallback:
   *   icon    → IconMark (square, 24–32 px nav rail use)
   *   compact → LogoCompact (icon + wordmark, topbar use)
   *   wordmark → LogoPrimary (icon + wordmark + descriptor, marketing use)
   */
  variant?: "icon" | "compact" | "wordmark";
  className?: string;
}

export function LogoSlot({
  config,
  productEntry,
  variant = "compact",
  className,
}: LogoSlotProps) {
  if (config.hasCustomBrand) {
    return (
      <TenantLogo
        assets={config.assets}
        alt={productEntry.productName}
        className={className}
      />
    );
  }

  const Logo =
    variant === "icon"    ? productEntry.IconMark :
    variant === "compact" ? productEntry.LogoCompact :
                            productEntry.LogoPrimary;

  return <Logo className={cn(className)} aria-label={productEntry.productName} />;
}
