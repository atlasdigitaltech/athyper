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

export const ADMIN_ROUTE_MANIFEST = ROUTE_MANIFESTS.admin;
export const ADMIN_NAV_ITEMS = NAV_ITEMS.admin;

/**
 * First-level setup sections accepted by the admin catch-all route.
 * Keep route vocabulary here so the Next app, shell, and navigation policy share
 * the same allow-list without depending on a page package.
 */
export const ADMIN_SETUP_SECTIONS = [
  "iam",
  "operations",
  "audit",
  "integrations",
  "metadata",
  "security",
  "tenants",
  "roles",
  "sessions",
  "jobs",
] as const;

export type AdminSetupSection = (typeof ADMIN_SETUP_SECTIONS)[number];

export function isAdminSetupSection(value: string | null | undefined): value is AdminSetupSection {
  return ADMIN_SETUP_SECTIONS.includes(value as AdminSetupSection);
}

export function isPublicPath(pathname: string): boolean {
  return _isPublicPath("admin", pathname);
}

export function isForbiddenPath(pathname: string): boolean {
  return _isForbiddenPath("admin", pathname);
}

export function resolveRouteEntry(pathname: string): RouteEntry | null {
  return _resolveRouteEntry("admin", pathname);
}
