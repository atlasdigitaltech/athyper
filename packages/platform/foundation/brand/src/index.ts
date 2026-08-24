export { ATLAS_MODERN_BRAND, type AtlasModernBrand } from "./atlas-modern";
import { ATLAS_MODERN_BRAND } from "./atlas-modern";

export const BRAND_PLANES = ["neon", "mesh", "studio"] as const;
export type BrandPlane = (typeof BRAND_PLANES)[number];

export interface BrandAssetDescriptor {
  readonly src: `/${string}`;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface PlaneBrand {
  readonly plane: BrandPlane;
  readonly applicationName: string;
  readonly shortName: string;
  readonly description: string;
  readonly identityLockup: BrandAssetDescriptor;
  readonly wordmark: BrandAssetDescriptor;
  readonly inverseWordmark: BrandAssetDescriptor;
  readonly appIcon: BrandAssetDescriptor;
  readonly favicon: `/${string}`;
  readonly icon: BrandAssetDescriptor;
  readonly manifest: `/${string}`;
  readonly themeColor: string;
}

const asset = (src: `/${string}`, width: number, height: number, alt: string): BrandAssetDescriptor =>
  Object.freeze({ src, width, height, alt });

export const PLANE_BRANDS: Readonly<Record<BrandPlane, PlaneBrand>> = Object.freeze({
  neon: Object.freeze({
    plane: "neon", applicationName: "Athyper Neon", shortName: "Neon",
    description: "Business Operating Platform",
    identityLockup: asset("/brand/neon/identity-lockup.svg", 565, 189, "Athyper Neon"),
    wordmark: asset("/brand/neon/wordmark.svg", 1000, 1000, "Neon"),
    inverseWordmark: asset("/brand/neon/wordmark-inverse.svg", 1000, 1000, "Neon"),
    appIcon: asset("/brand/neon/app-icon.png", 2048, 2048, ""),
    icon: asset("/brand/neon/icon.png", 2048, 2048, ""), favicon: "/brand/neon/favicon.png",
    manifest: "/brand/neon/manifest.webmanifest", themeColor: ATLAS_MODERN_BRAND.colors.primary,
  }),
  mesh: Object.freeze({
    plane: "mesh", applicationName: "Athyper Mesh", shortName: "Mesh",
    description: "Business Collaboration Network",
    identityLockup: asset("/brand/mesh/identity-lockup.svg", 567, 189, "Athyper Mesh"),
    wordmark: asset("/brand/mesh/wordmark.png", 3920, 748, "Mesh"),
    inverseWordmark: asset("/brand/mesh/wordmark-inverse.png", 3920, 748, "Mesh"),
    appIcon: asset("/brand/mesh/app-icon.png", 2048, 2048, ""),
    icon: asset("/brand/mesh/icon.png", 2048, 2048, ""), favicon: "/brand/mesh/favicon.png",
    manifest: "/brand/mesh/manifest.webmanifest", themeColor: ATLAS_MODERN_BRAND.colors.primary,
  }),
  studio: Object.freeze({
    plane: "studio", applicationName: "Athyper Studio", shortName: "Studio",
    description: "Business Technology Platform",
    identityLockup: asset("/brand/studio/identity-lockup.svg", 736, 189, "Athyper Studio"),
    wordmark: asset("/brand/studio/wordmark.png", 6520, 748, "Athyper"),
    inverseWordmark: asset("/brand/studio/wordmark-inverse.png", 6520, 748, "Athyper"),
    appIcon: asset("/brand/studio/app-icon.png", 2048, 2048, ""),
    icon: asset("/brand/studio/icon.png", 2048, 2048, ""), favicon: "/brand/studio/favicon.png",
    manifest: "/brand/studio/manifest.webmanifest", themeColor: ATLAS_MODERN_BRAND.colors.primary,
  }),
});

export interface PlaneWebMetadata {
  readonly applicationName: string;
  readonly shortName: string;
  readonly title: string;
  readonly titleTemplate: string;
  readonly description: string;
  readonly favicon: `/${string}`;
  readonly appleTouchIcon: `/${string}`;
  readonly manifest: `/${string}`;
  readonly themeColor: string;
}

export function getPlaneWebMetadata(plane: BrandPlane): PlaneWebMetadata {
  const brand = getPlaneBrand(plane);
  return Object.freeze({ applicationName: brand.applicationName, shortName: brand.shortName, title: `${brand.shortName} — ${brand.description}`, titleTemplate: `%s — ${brand.shortName}`, description: brand.description,
    favicon: brand.favicon, appleTouchIcon: brand.appIcon.src, manifest: brand.manifest, themeColor: brand.themeColor });
}

export function isSafePublicAssetUrl(value: string): value is `/${string}` {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.split("/").includes("..");
}

export function getPlaneBrand(plane: BrandPlane): PlaneBrand {
  return PLANE_BRANDS[plane];
}
