"use client";

/**
 * @athyper/platform-brand — BrandProvider + useBrand hook.
 *
 * Mount once in the root layout, passing the server-resolved ResolvedBrandConfig.
 * Handles:
 *   1. SSR: renders an inline <style> block so CSS variables are available on
 *      first paint (prevents FOUC). Both :root (light) and .dark :root (dark)
 *      overrides are emitted in a single block.
 *   2. Font: injects <link rel="stylesheet"> for custom font URLs.
 *
 * Usage (Next.js App Router):
 *   // Server component (layout.tsx):
 *   const brand = await fetchTenantBrand(tenantId);
 *   return (
 *     <html>
 *       <body>
 *         <BrandProvider config={brand}>{children}</BrandProvider>
 *       </body>
 *     </html>
 *   );
 */

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { ResolvedBrandConfig, ResolvedBrandAssets } from "./types";
import { buildCssStyleBlock } from "./brand-css";

// ── Context ───────────────────────────────────────────────────────────────────

interface BrandContextValue {
  config: ResolvedBrandConfig;
  assets: ResolvedBrandAssets;
}

const BrandContext = createContext<BrandContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export interface BrandProviderProps {
  config: ResolvedBrandConfig;
  children: ReactNode;
}

export function BrandProvider({ config, children }: BrandProviderProps) {
  // Build a combined style block: :root (light vars) + .dark :root (dark vars).
  // Both are emitted server-side to prevent FOUC and to let the browser's
  // .dark class toggle switch palettes without any JavaScript.
  const lightBlock = buildCssStyleBlock(config.cssVariableOverrides.light);
  const darkBlock  = buildCssStyleBlock(config.cssVariableOverrides.dark, ".dark :root");
  const styleBlock = [lightBlock, darkBlock].filter(Boolean).join("\n");

  // Inject custom font link tags when a font URL is configured.
  useEffect(() => {
    const injected: HTMLLinkElement[] = [];
    if (config.fontSansUrl)
      injected.push(injectFontLink(config.fontSansUrl, "brand-font-sans"));
    if (config.fontMonoUrl)
      injected.push(injectFontLink(config.fontMonoUrl, "brand-font-mono"));
    return () => injected.forEach(l => l.remove());
  }, [config.fontSansUrl, config.fontMonoUrl]);

  return (
    <BrandContext.Provider value={{ config, assets: config.assets }}>
      {/* SSR-safe style injection — prevents FOUC on initial load */}
      {styleBlock && (
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized CSS variable output only
          dangerouslySetInnerHTML={{ __html: styleBlock }}
        />
      )}
      {children}
    </BrandContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the current resolved brand config and asset URLs.
 * Must be called inside a <BrandProvider>.
 */
export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand() must be used inside <BrandProvider>");
  return ctx;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function injectFontLink(href: string, id: string): HTMLLinkElement {
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  if (existing) {
    existing.href = href;
    return existing;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  return link;
}
