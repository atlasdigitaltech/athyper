"use client";

/**
 * useRecentTracker — pushes every meaningful route visit to the
 * recent items store (localStorage), feeding the launcher's Recent tab.
 *
 * Designed to be called once, high up in the shell layout (AppShellLayout).
 * Uses `usePathname()` to detect navigation events without any router coupling.
 *
 * Pathname → metadata resolution:
 *   1. Static map for known well-defined routes
 *   2. Pattern matchers for dynamic record routes (/app/[entity]/[id])
 *   3. Fallback: humanised last path segment
 *
 * Routes explicitly excluded: /login, /api, /_next
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { pushRecentItem, type RecordFamily } from "@/lib/recent-items";

// ── Static route map ──────────────────────────────────────────────────────────
//
// Well-known pages with full metadata. Extend as new routes are added.

interface RouteMeta {
  label: string;
  moduleCode?: string;
  recordFamily: RecordFamily;
}

const STATIC_ROUTES: Record<string, RouteMeta> = {
  "/home":                          { label: "Home",                  recordFamily: "page" },
  "/inbox":                         { label: "Work Inbox",            recordFamily: "page" },
  "/notifications":                 { label: "Notifications",         recordFamily: "page" },
  "/saved-views":                   { label: "Saved Views",           recordFamily: "page" },
  "/settings":                      { label: "Settings",              recordFamily: "page" },
  "/dashboard":                     { label: "Dashboard",             recordFamily: "page" },
  "/dashboards":                    { label: "Dashboards",            recordFamily: "page" },
  // Finance
  "/finance":                       { label: "Finance Overview",      moduleCode: "ACC", recordFamily: "page" },
  "/finance/gl":                    { label: "GL Workbench",          moduleCode: "ACC", recordFamily: "page" },
  "/finance/coa":                   { label: "Chart of Accounts",     moduleCode: "ACC", recordFamily: "page" },
  "/finance/views/trial-balance":   { label: "Trial Balance",         moduleCode: "ACC", recordFamily: "page" },
  "/finance/reports":               { label: "Financial Reports",     moduleCode: "ACC", recordFamily: "page" },
  "/finance/close":                 { label: "Period Close",          moduleCode: "ACC", recordFamily: "page" },
  "/finance/admin":                 { label: "Finance Admin",         moduleCode: "ACC", recordFamily: "page" },
  // Admin / Setup
  "/setup/tenant":                  { label: "Tenant Setup",          recordFamily: "page" },
  "/setup/metadata":                { label: "Metadata Studio",       recordFamily: "page" },
  "/setup/metadata/modules":        { label: "Module Setup",          recordFamily: "page" },
  "/setup/metadata/lookups":        { label: "Lookup Domains",        recordFamily: "page" },
  "/setup/metadata/lifecycle":      { label: "Lifecycle Bindings",    recordFamily: "page" },
  "/setup/metadata/operations":     { label: "Entity Operations",     recordFamily: "page" },
  "/setup/metadata/field-groups":   { label: "Field Groups",          recordFamily: "page" },
  "/setup/metadata/entity-policies": { label: "Entity Policies",      recordFamily: "page" },
  "/setup/metadata/erd":            { label: "Schema ERD",            recordFamily: "page" },
  "/setup/metadata/descriptor":     { label: "Descriptor Tool",       recordFamily: "page" },
  "/setup/blueprints":              { label: "Blueprints",            recordFamily: "page" },
  "/metadata-studio":               { label: "Metadata Studio",       recordFamily: "page" },
  "/setup/policies":                { label: "Policy Setup",          recordFamily: "page" },
  // Core
  "/core":                          { label: "Core Overview",         recordFamily: "page" },
};

// ── Pattern matchers for dynamic routes ───────────────────────────────────────

// Regex to detect common document/record reference codes (e.g. PO-8812, JE-10455)
const REF_CODE_RE = /^[A-Z]{2,10}-\d+$/;

function humanise(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ResolvedRoute {
  label: string;
  refCode?: string;
  moduleCode?: string;
  recordFamily: RecordFamily;
}

function resolveRoute(pathname: string): ResolvedRoute | null {
  // Static map hit
  const staticMeta = STATIC_ROUTES[pathname];
  if (staticMeta) {
    return staticMeta;
  }

  // /finance/views/[viewCode]
  const viewMatch = pathname.match(/^\/finance\/views\/([^/]+)$/);
  if (viewMatch) {
    return {
      label: humanise(viewMatch[1]!),
      moduleCode: "ACC",
      recordFamily: "page",
    };
  }

  // /app/[entity]/[id] — record detail
  const appDetailMatch = pathname.match(/^\/app\/([^/]+)\/([^/]+)$/);
  if (appDetailMatch) {
    const entity = appDetailMatch[1]!;
    const id = appDetailMatch[2]!;
    if (id === "new") return null; // skip creation forms
    const refCode = REF_CODE_RE.test(id) ? id : undefined;
    return {
      label: refCode ?? humanise(id),
      refCode,
      recordFamily: "document",
    };
  }

  // /app/[entity] — entity list page
  const appEntityMatch = pathname.match(/^\/app\/([^/]+)$/);
  if (appEntityMatch) {
    return {
      label: humanise(appEntityMatch[1]!),
      recordFamily: "page",
    };
  }

  // /module/[code] — module launcher page
  const moduleMatch = pathname.match(/^\/module\/([^/]+)$/);
  if (moduleMatch) {
    return {
      label: humanise(moduleMatch[1]!),
      moduleCode: moduleMatch[1]!.toUpperCase(),
      recordFamily: "module",
    };
  }

  // /core/[code] — platform section
  const coreMatch = pathname.match(/^\/core\/([^/]+)$/);
  if (coreMatch) {
    return {
      label: humanise(coreMatch[1]!),
      recordFamily: "page",
    };
  }

  // Generic fallback — humanise last non-empty segment
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1]!;
  // Skip pure UUIDs or creation paths
  if (/^[0-9a-f-]{36}$/i.test(last) || last === "new") return null;
  return {
    label: humanise(last),
    recordFamily: "page",
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRecentTracker() {
  const pathname = usePathname();
  const prevPath = useRef<string>("");

  useEffect(() => {
    if (!pathname || pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Exclude non-app routes
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname === "/"
    ) {
      return;
    }

    const resolved = resolveRoute(pathname);
    if (!resolved) return;

    pushRecentItem({
      href: pathname,
      label: resolved.label,
      refCode: resolved.refCode,
      moduleCode: resolved.moduleCode,
      recordFamily: resolved.recordFamily,
    });
  }, [pathname]);
}
