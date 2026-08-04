export {
  type RouteSurface,
  type RouteEntry,
  type PlaneRouteManifest,
  type NavItem,
  type RuntimeMutationMode,
  type RuntimeEntityPolicy,
  ROUTE_MANIFESTS,
  NAV_ITEMS,
  getRouteManifest,
  getNavItems,
  getAppSwitchTargets,
  planeBaseUrl,
  resolveRouteEntry as resolveRouteEntryForPlane,
} from "@athyper/route-manifest-core";

import {
  ROUTE_MANIFESTS,
  NAV_ITEMS,
  isPublicPath as _isPublicPath,
  isForbiddenPath as _isForbiddenPath,
  resolveRouteEntry as _resolveRouteEntry,
  type RouteEntry,
} from "@athyper/route-manifest-core";

export const NEON_ROUTE_MANIFEST = ROUTE_MANIFESTS.neon;
export const NEON_NAV_ITEMS = NAV_ITEMS.neon;

export function isPublicPath(pathname: string): boolean {
  return _isPublicPath("neon", pathname);
}

export function isForbiddenPath(pathname: string): boolean {
  return _isForbiddenPath("neon", pathname);
}

export function resolveRouteEntry(pathname: string): RouteEntry | null {
  return _resolveRouteEntry("neon", pathname);
}
