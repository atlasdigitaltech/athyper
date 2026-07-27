import { getPlaneConfig, type PlaneKey } from "@athyper/session-plane";

export type RouteSurface =
  | "public"
  | "command"
  | "runtime"
  | "workbench"
  | "content"
  | "governance"
  | "setup"
  | "api";

export interface RouteEntry {
  path: string;
  label: string;
  surface: RouteSurface;
  exact?: boolean;
  readonly?: boolean;
  requiresSupportContext?: boolean;
}

export interface PlaneRouteManifest {
  plane: PlaneKey;
  defaultPath: string;
  publicPrefixes: readonly string[];
  shellRoutes: readonly RouteEntry[];
  apiPrefixes: readonly string[];
  forbiddenPrefixes: readonly string[];
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: "home" | "inbox" | "bell" | "bookmark" | "settings" | "workbench" | "app" | "content" | "shield" | "setup";
  surface: RouteSurface;
  category: "global" | "workspace" | "setup" | "utility";
}

export type RuntimeMutationMode = "none" | "delegated-submit" | "direct";

export interface RuntimeEntityPolicy {
  entity: string;
  label: string;
  list: boolean;
  detail: boolean;
  create: boolean;
  mutationMode: RuntimeMutationMode;
}

/**
 * Canonical three-plane route manifest registry.
 * Topology-level config; each plane's app package re-exports its slice.
 */
export const ROUTE_MANIFESTS = {
  neon: {
    plane: "neon",
    defaultPath: "/dashboard",
    publicPrefixes: ["/login", "/logout", "/auth", "/mfa", "/livez"],
    apiPrefixes: ["/api"],
    forbiddenPrefixes: ["/setup/platform", "/admin"],
    shellRoutes: [
      { path: "/dashboard",    label: "Dashboard",     surface: "command" },
      { path: "/inbox",        label: "Inbox",         surface: "command" },
      { path: "/notifications",label: "Notifications", surface: "command" },
      { path: "/saved-views",  label: "Saved Views",   surface: "command" },
      { path: "/workbench",    label: "Workbench",     surface: "workbench" },
      { path: "/app",          label: "Records",       surface: "runtime" },
      { path: "/tester",       label: "Tester",        surface: "runtime" },
      { path: "/content",      label: "Content",       surface: "content" },
      { path: "/governance",   label: "Governance",    surface: "governance" },
      { path: "/settings",     label: "Settings",      surface: "command" },
    ],
  },
  mesh: {
    plane: "mesh",
    defaultPath: "/dashboard",
    publicPrefixes: ["/login", "/logout", "/auth", "/mfa", "/livez"],
    apiPrefixes: ["/api"],
    forbiddenPrefixes: ["/setup", "/admin"],
    shellRoutes: [
      { path: "/dashboard",    label: "Dashboard",     surface: "command" },
      { path: "/inbox",        label: "Inbox",         surface: "command" },
      { path: "/notifications",label: "Notifications", surface: "command" },
      { path: "/saved-views",  label: "Saved Views",   surface: "command" },
      { path: "/workbench",    label: "Workbench",     surface: "workbench" },
      { path: "/app",          label: "Exchange",      surface: "runtime", readonly: true },
      { path: "/content",      label: "Payloads",      surface: "content" },
      { path: "/governance",   label: "Connections",   surface: "governance" },
      { path: "/settings",     label: "Settings",      surface: "command" },
    ],
  },
  admin: {
    plane: "admin",
    defaultPath: "/dashboard",
    publicPrefixes: ["/login", "/logout", "/auth", "/mfa", "/livez"],
    apiPrefixes: ["/api"],
    forbiddenPrefixes: ["/app", "/content/governance"],
    shellRoutes: [
      { path: "/dashboard",    label: "Dashboard",     surface: "command" },
      { path: "/inbox",        label: "Inbox",         surface: "command" },
      { path: "/notifications",label: "Notifications", surface: "command" },
      { path: "/saved-views",  label: "Saved Views",   surface: "command" },
      { path: "/setup",        label: "Setup",         surface: "setup" },
      { path: "/settings",     label: "Settings",      surface: "command" },
    ],
  },
} as const satisfies Record<PlaneKey, PlaneRouteManifest>;

export const NAV_ITEMS = {
  neon: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard",    icon: "home",      surface: "command",    category: "global" },
    { key: "inbox",     label: "Inbox",     href: "/inbox",        icon: "inbox",     surface: "command",    category: "global" },
    { key: "workbench", label: "Workbench", href: "/workbench",    icon: "workbench", surface: "workbench",  category: "workspace" },
    { key: "records",   label: "Records",   href: "/app/customer", icon: "app",       surface: "runtime",    category: "workspace" },
    { key: "tester",    label: "Tester",    href: "/tester",       icon: "app",       surface: "runtime",    category: "workspace" },
    { key: "content",   label: "Content",   href: "/content",      icon: "content",   surface: "content",    category: "workspace" },
    { key: "governance",label: "Governance",href: "/governance",   icon: "shield",    surface: "governance", category: "workspace" },
    { key: "settings",  label: "Settings",  href: "/settings",     icon: "settings",  surface: "command",    category: "utility" },
  ],
  mesh: [
    { key: "dashboard",   label: "Dashboard",    href: "/dashboard",  icon: "home",      surface: "command",    category: "global" },
    { key: "inbox",       label: "Inbox",        href: "/inbox",      icon: "inbox",     surface: "command",    category: "global" },
    { key: "workbench",   label: "Workbench",    href: "/workbench",  icon: "workbench", surface: "workbench",  category: "workspace" },
    { key: "content",     label: "Payloads",     href: "/content",    icon: "content",   surface: "content",    category: "workspace" },
    { key: "connections", label: "Connections",  href: "/governance", icon: "shield",    surface: "governance", category: "workspace" },
    { key: "settings",    label: "Settings",     href: "/settings",   icon: "settings",  surface: "command",    category: "utility" },
  ],
  admin: [
    { key: "meta-studio", label: "Meta Entity Studio", href: "/setup/metadata", icon: "app", surface: "setup", category: "setup" },
  ],
} as const satisfies Record<PlaneKey, readonly NavItem[]>;

export function getRouteManifest(plane: PlaneKey): PlaneRouteManifest {
  return ROUTE_MANIFESTS[plane];
}

export function getNavItems(plane: PlaneKey): readonly NavItem[] {
  return NAV_ITEMS[plane];
}

export function isPublicPath(plane: PlaneKey, pathname: string): boolean {
  return getRouteManifest(plane).publicPrefixes.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

export function isForbiddenPath(plane: PlaneKey, pathname: string): boolean {
  return getRouteManifest(plane).forbiddenPrefixes.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

export function resolveRouteEntry(plane: PlaneKey, pathname: string): RouteEntry | null {
  const routes = getRouteManifest(plane).shellRoutes;
  return routes.find((route) => (
    route.exact ? pathname === route.path : pathname === route.path || pathname.startsWith(`${route.path}/`)
  )) ?? null;
}

export function getAppSwitchTargets(currentPlane: PlaneKey, currentHost?: string | null): Array<{
  plane: PlaneKey;
  label: string;
  href: string;
  current: boolean;
}> {
  return (["neon", "mesh", "admin"] as const).map((plane) => ({
    plane,
    label: getPlaneConfig(plane).appName,
    href: `${planeBaseUrl(plane, currentHost)}${getRouteManifest(plane).defaultPath}`,
    current: currentPlane === plane,
  }));
}

export function planeBaseUrl(plane: PlaneKey, currentHost?: string | null): string {
  const config = getPlaneConfig(plane);
  const host = normalizeHost(currentHost);
  if (!host) return `https://${config.publicHost}`;

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".athyper.local")
  ) {
    return `https://${config.localHost}`;
  }

  const athyperCom = /^(?:neon|mesh|admin)(-[a-z0-9-]+)?\.athyper\.com$/i.exec(host);
  if (athyperCom) {
    return `https://${plane}${athyperCom[1] ?? ""}.athyper.com`;
  }

  return `https://${config.publicHost}`;
}

function normalizeHost(host?: string | null): string {
  return (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
