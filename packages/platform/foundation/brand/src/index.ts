export { ATLAS_MODERN_BRAND, type AtlasModernBrand } from "./atlas-modern";
import { ATLAS_MODERN_BRAND } from "./atlas-modern";
import presentation from "./plane-presentation.json";

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
  readonly appIcon: BrandAssetDescriptor;
  readonly favicon: `/${string}`;
  readonly manifest: `/${string}`;
  readonly themeColor: string;
}

const asset = (src: `/${string}`, width: number, height: number, alt: string): BrandAssetDescriptor =>
  Object.freeze({ src, width, height, alt });

export const PLANE_BRANDS: Readonly<Record<BrandPlane, PlaneBrand>> = Object.freeze({
  neon: Object.freeze({
    plane: "neon", applicationName: presentation.planes.neon.applicationName, shortName: presentation.planes.neon.shortName,
    description: presentation.planes.neon.description,
    identityLockup: asset("/brand/neon/identity-lockup.svg", 565, 189, "Athyper Neon"),
    appIcon: asset("/brand/neon/app-icon.png", 2048, 2048, ""),
    favicon: "/brand/neon/athyper-favicon.svg",
    manifest: "/brand/neon/manifest.webmanifest", themeColor: ATLAS_MODERN_BRAND.colors.primary,
  }),
  mesh: Object.freeze({
    plane: "mesh", applicationName: presentation.planes.mesh.applicationName, shortName: presentation.planes.mesh.shortName,
    description: presentation.planes.mesh.description,
    identityLockup: asset("/brand/mesh/identity-lockup.svg", 567, 189, "Athyper Mesh"),
    appIcon: asset("/brand/mesh/app-icon.png", 2048, 2048, ""),
    favicon: "/brand/mesh/athyper-favicon.svg",
    manifest: "/brand/mesh/manifest.webmanifest", themeColor: ATLAS_MODERN_BRAND.colors.primary,
  }),
  studio: Object.freeze({
    plane: "studio", applicationName: presentation.planes.studio.applicationName, shortName: presentation.planes.studio.shortName,
    description: presentation.planes.studio.description,
    identityLockup: asset("/brand/studio/identity-lockup.svg", 736, 189, "Athyper Studio"),
    appIcon: asset("/brand/studio/app-icon.png", 2048, 2048, ""),
    favicon: "/brand/studio/athyper-favicon.svg",
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
  const expand = (pattern: string, values: Readonly<Record<string, string>>) => Object.entries(values).reduce((value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement), pattern);
  return Object.freeze({ applicationName: brand.applicationName, shortName: brand.shortName, title: expand(presentation.browserTitle.plane, { plane: brand.shortName, description: brand.description }), titleTemplate: expand(presentation.browserTitle.page, { page: "%s", plane: brand.shortName }), description: brand.description,
    favicon: brand.favicon, appleTouchIcon: brand.appIcon.src, manifest: brand.manifest, themeColor: brand.themeColor });
}

export function isSafePublicAssetUrl(value: string): value is `/${string}` {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.split("/").includes("..");
}

export function getPlaneBrand(plane: BrandPlane): PlaneBrand {
  return PLANE_BRANDS[plane];
}
