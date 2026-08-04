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
} from "@athyper/route-manifest-core";

import {
  ROUTE_MANIFESTS,
  NAV_ITEMS,
  isPublicPath as _isPublicPath,
  isForbiddenPath as _isForbiddenPath,
  resolveRouteEntry as _resolveRouteEntry,
  type RouteEntry,
} from "@athyper/route-manifest-core";

export const MESH_ROUTE_MANIFEST = ROUTE_MANIFESTS.mesh;
export const MESH_NAV_ITEMS = NAV_ITEMS.mesh;

export function isPublicPath(pathname: string): boolean {
  return _isPublicPath("mesh", pathname);
}

export function isForbiddenPath(pathname: string): boolean {
  return _isForbiddenPath("mesh", pathname);
}

export function resolveRouteEntry(pathname: string): RouteEntry | null {
  return _resolveRouteEntry("mesh", pathname);
}
