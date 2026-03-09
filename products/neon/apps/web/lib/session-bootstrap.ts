// lib/session-bootstrap.ts
//
// SSR Session Bootstrap — inline safe session data into the initial HTML
// response so the client can hydrate without an extra /api/auth/session call.
//
// Security invariant:
//   The bootstrap NEVER includes tokens (accessToken, refreshToken, idToken).
//   It only contains display metadata and timing values needed for client-side UX logic.

import { cookies } from "next/headers";

import {
  normalizeClaims,
  serializeModules,
  serializePersonas,
} from "./auth/claims-normalizer";
import { getSessionRedis } from "./auth/session-redis";
import { WORKBENCHES } from "./auth/types";

import type { Workbench } from "./auth/types";

const IDLE_TIMEOUT_SEC = 900;

export interface SessionBootstrap {
  displayName: string;
  roles: string[];
  persona: string;
  /** Active workbench. null when workspaceResolutionState is "pending". */
  workbench: string | null;
  /**
   * "pending"  — user has authenticated but workspace has not been resolved yet.
   * "resolved" — workspace is active and the user can access /wb/* routes.
   * Missing field in pre-existing sessions is treated as "resolved".
   */
  workspaceResolutionState: "pending" | "resolved";
  featureFlags: Record<string, boolean>;
  /** Epoch seconds when the access token expires. Used by useSessionRefresh. */
  accessExpiresAt: number;
  /** Idle timeout in seconds. Used by useIdleTracker. */
  idleTimeoutSec: number;
  /** CSRF token for double-submit pattern. */
  csrfToken: string;
  /** User locale (e.g. "en", "ms", "ta"). */
  locale: string;
  /** Workbenches the user is authorized to access. */
  allowedWorkbenches: Workbench[];
  /** Client roles from Keycloak resource_access. */
  clientRoles: string[];
  /** Module codes the user has access to (derived from neon:MODULE:* roles). */
  modules: string[];
  /** Persona codes assigned to the user (derived from neon:PERSONA:* roles). */
  personas: string[];
  /** Group membership paths for data scoping. */
  groups: string[];
  /** Tenant ID from the session. */
  tenantId: string;
  /** Human-readable tenant display name (e.g. "Acme Corp"). Falls back to tenantId. */
  tenantDisplayName: string;
  /** User ID (Keycloak sub). */
  userId: string;
  /** Deployment environment (local, staging, production). */
  environment: string;
  /** Subscription tier for the tenant (e.g. "Standard", "Professional", "Enterprise"). */
  subscriptionTier: string;
  /** Whether the user is a platform administrator (from platform-control realm). */
  isPlatformAdmin: boolean;
  /** Platform-level roles (empty for regular users). */
  platformRoles: string[];
  /** Currently selected tenant ID for platform admin. null = no tenant selected yet. */
  selectedTenantId: string | null;
}

/**
 * Reads the Redis session and returns a safe public subset for client hydration.
 *
 * Called from layout.tsx (server component) during SSR.
 */
export async function getSessionBootstrap(): Promise<SessionBootstrap | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return null;

  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  try {
    const redis = await getSessionRedis();
    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) return null;

    const session = JSON.parse(raw);

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

    // Normalize claims to derive allowedWorkbenches, modules, and personas
    const normalized = normalizeClaims({
      sub: session.userId ?? session.username ?? "",
      preferredUsername: session.username ?? "",
      email: session.email,
      name: session.displayName ?? session.username ?? "",
      realmRoles: session.roles ?? [],
      clientRoles: session.clientRoles ?? [],
      groups: session.groups ?? [],
      tenantId: session.tenantId ?? tenantId,
    });

    return {
      displayName: session.displayName ?? session.username ?? "",
      roles: session.roles ?? [],
      persona: session.persona ?? "viewer",
      workbench: session.workbench ?? null,
      workspaceResolutionState:
        session.workspaceResolutionState === "pending" ? "pending" : "resolved",
      featureFlags: {},
      accessExpiresAt: session.accessExpiresAt ?? 0,
      idleTimeoutSec: IDLE_TIMEOUT_SEC,
      csrfToken: session.csrfToken ?? "",
      locale: cookieStore.get("neon_locale")?.value ?? "en",
      // In local dev, grant all workbenches so developers can switch freely
      allowedWorkbenches:
        (process.env.ENVIRONMENT ?? "local") === "local"
          ? ([...WORKBENCHES] as Workbench[])
          : normalized.allowedWorkbenches,
      clientRoles: normalized.clientRoles,
      modules: serializeModules(normalized.modules),
      personas: serializePersonas(normalized.personas),
      groups: normalized.groups,
      tenantId: normalized.tenantId,
      tenantDisplayName: session.tenantDisplayName ?? normalized.tenantId,
      userId: normalized.userId,
      environment: process.env.ENVIRONMENT ?? "local",
      subscriptionTier: "Standard",
      // Platform admin fields
      isPlatformAdmin: session.isPlatformAdmin === true,
      platformRoles: session.platformRoles ?? [],
      selectedTenantId: session.selectedTenantId ?? null,
    };
  } catch {
    return null;
  }
}
