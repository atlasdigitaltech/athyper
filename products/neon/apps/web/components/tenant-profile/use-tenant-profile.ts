"use client";

// components/tenant-profile/use-tenant-profile.ts
//
// Data hook for the Tenant Profile page.
// Reads SessionBootstrap and derives visible tabs using the shared
// capability system from lib/user-menu/visibility.ts.

import { useEffect, useMemo, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { CAP, deriveCapabilities } from "@/lib/user-menu/visibility";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TenantProfileTab =
  | "overview"
  | "identity"
  | "iam"
  | "users"
  | "domains"
  | "modules";

export interface TenantProfileData {
  // From SessionBootstrap
  tenantId: string;
  tenantDisplayName: string;
  environment: string;
  subscriptionTier: string;
  workbench: string;
  modules: string[];
  personas: string[];
  roles: string[];
  clientRoles: string[];
  groups: string[];
  featureFlags: Record<string, boolean>;
  isPlatformAdmin: boolean;
  platformRoles: string[];
  selectedTenantId: string | null;
  locale: string;
  idleTimeoutSec: number;
  userId: string;
  displayName: string;

  // Derived
  visibleTabs: TenantProfileTab[];
  hasAdminAccess: boolean;
  ready: boolean;
}

// ─── Tab visibility logic ───────────────────────────────────────────────────

/** Tabs always visible to any authenticated user. */
const PUBLIC_TABS: TenantProfileTab[] = ["overview", "identity", "modules"];

/** Tabs that require TENANT_PROFILE_READ capability. */
const ADMIN_TABS: TenantProfileTab[] = ["iam", "users", "domains"];

function computeVisibleTabs(bootstrap: SessionBootstrap): TenantProfileTab[] {
  const caps = deriveCapabilities({
    personas: bootstrap.personas,
    isPlatformAdmin: bootstrap.isPlatformAdmin,
    platformRoles: bootstrap.platformRoles,
    featureFlags: bootstrap.featureFlags,
    modules: bootstrap.modules,
    environment: bootstrap.environment,
  });

  const tabs: TenantProfileTab[] = [...PUBLIC_TABS];

  if (caps.has(CAP.TENANT_PROFILE_READ)) {
    tabs.push(...ADMIN_TABS);
  }

  return tabs;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTenantProfile(): TenantProfileData {
  const [bootstrap, setBootstrap] = useState<SessionBootstrap | null>(null);

  useEffect(() => {
    const bs = (window as any).__SESSION_BOOTSTRAP__ as
      | SessionBootstrap
      | undefined;
    if (bs) setBootstrap(bs);
  }, []);

  return useMemo<TenantProfileData>(() => {
    if (!bootstrap) {
      return {
        tenantId: "",
        tenantDisplayName: "",
        environment: "",
        subscriptionTier: "",
        workbench: "",
        modules: [],
        personas: [],
        roles: [],
        clientRoles: [],
        groups: [],
        featureFlags: {},
        isPlatformAdmin: false,
        platformRoles: [],
        selectedTenantId: null,
        locale: "en",
        idleTimeoutSec: 900,
        userId: "",
        displayName: "",
        visibleTabs: ["overview", "identity", "modules"],
        hasAdminAccess: false,
        ready: false,
      };
    }

    const visibleTabs = computeVisibleTabs(bootstrap);
    const caps = deriveCapabilities({
      personas: bootstrap.personas,
      isPlatformAdmin: bootstrap.isPlatformAdmin,
      platformRoles: bootstrap.platformRoles,
      featureFlags: bootstrap.featureFlags,
      modules: bootstrap.modules,
      environment: bootstrap.environment,
    });

    return {
      tenantId: bootstrap.tenantId,
      tenantDisplayName: bootstrap.tenantDisplayName,
      environment: bootstrap.environment,
      subscriptionTier: bootstrap.subscriptionTier,
      workbench: bootstrap.workbench ?? "",
      modules: bootstrap.modules,
      personas: bootstrap.personas,
      roles: bootstrap.roles,
      clientRoles: bootstrap.clientRoles,
      groups: bootstrap.groups,
      featureFlags: bootstrap.featureFlags,
      isPlatformAdmin: bootstrap.isPlatformAdmin,
      platformRoles: bootstrap.platformRoles,
      selectedTenantId: bootstrap.selectedTenantId,
      locale: bootstrap.locale,
      idleTimeoutSec: bootstrap.idleTimeoutSec,
      userId: bootstrap.userId,
      displayName: bootstrap.displayName,
      visibleTabs,
      hasAdminAccess: caps.has(CAP.TENANT_PROFILE_READ),
      ready: true,
    };
  }, [bootstrap]);
}
