// lib/user-menu/visibility.ts
//
// Capability-based visibility predicates for user menu sections.
//
// Today: capabilities are derived from persona strings + platform roles.
// Tomorrow: can be replaced with RBAC capability grants without changing
// the predicate signatures — only deriveCapabilities() needs to evolve.

// ─── Capability constants ────────────────────────────────────────────────────

export const CAP = {
    TENANT_PROFILE_READ: "tenant:profile:read",
    LEGAL_PROFILE_READ: "tenant:legal_profile:read",
    SUBSCRIPTION_READ: "tenant:subscription:read",
    TENANT_SWITCH: "tenant:switch",
    DIAGNOSTICS_READ: "system:diagnostics:read",
    VIEWPORT_DEV: "system:viewport:dev",
} as const;

// ─── Context types ───────────────────────────────────────────────────────────

export interface MenuVisibilityInput {
    personas: string[];
    isPlatformAdmin: boolean;
    platformRoles: string[];
    featureFlags: Record<string, boolean>;
    modules: string[];
    environment: string;
}

export interface MenuVisibilityContext extends MenuVisibilityInput {
    capabilities: Set<string>;
}

export interface MenuVisibilityResult {
    tenantProfile: boolean;
    legalProfile: boolean;
    subscription: boolean;
    switchTenant: boolean;
    diagnostics: boolean;
    savedSuppliers: boolean;
    viewport: boolean;
}

// ─── Capability derivation ───────────────────────────────────────────────────

/** Personas that grant tenant-admin-level capabilities. */
const ADMIN_PERSONAS = new Set(["tenant_admin"]);

/** Personas that grant finance/compliance capabilities. */
const FINANCE_PERSONAS = new Set(["tenant_admin", "finance_admin", "compliance_officer"]);

/**
 * Derive a capability set from the user's personas and platform roles.
 *
 * This is the single evolution point: when RBAC capabilities arrive,
 * replace the persona-based logic here with a capability lookup.
 */
export function deriveCapabilities(input: MenuVisibilityInput): Set<string> {
    const caps = new Set<string>();
    const { personas, isPlatformAdmin, environment } = input;

    const isAdmin = personas.some((p) => ADMIN_PERSONAS.has(p));
    const isFinance = personas.some((p) => FINANCE_PERSONAS.has(p));

    // Tenant management capabilities
    if (isAdmin || isPlatformAdmin) {
        caps.add(CAP.TENANT_PROFILE_READ);
        caps.add(CAP.SUBSCRIPTION_READ);
        caps.add(CAP.TENANT_SWITCH);
        caps.add(CAP.DIAGNOSTICS_READ);
    }

    if (isFinance || isPlatformAdmin) {
        caps.add(CAP.LEGAL_PROFILE_READ);
    }

    // Dev viewport — available in development or for platform admins
    if (environment === "local" || environment === "development" || isPlatformAdmin) {
        caps.add(CAP.VIEWPORT_DEV);
    }

    return caps;
}

// ─── Individual predicates ───────────────────────────────────────────────────

export function canViewTenantProfile(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.TENANT_PROFILE_READ);
}

export function canViewLegalProfile(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.LEGAL_PROFILE_READ);
}

export function canViewSubscription(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.SUBSCRIPTION_READ);
}

export function canSwitchTenant(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.TENANT_SWITCH);
}

export function canViewDiagnostics(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.DIAGNOSTICS_READ);
}

export function canViewSavedSuppliers(ctx: MenuVisibilityContext): boolean {
    return ctx.featureFlags["PROCUREMENT_MODULE_ENABLED"] === true;
}

export function canViewViewport(ctx: MenuVisibilityContext): boolean {
    return ctx.capabilities.has(CAP.VIEWPORT_DEV);
}

// ─── Convenience: compute all at once ────────────────────────────────────────

/**
 * Compute the full visibility result in one pass.
 * Called once per render cycle in the model hook.
 */
export function computeVisibility(input: MenuVisibilityInput): MenuVisibilityResult {
    const capabilities = deriveCapabilities(input);
    const ctx: MenuVisibilityContext = { ...input, capabilities };

    return {
        tenantProfile: canViewTenantProfile(ctx),
        legalProfile: canViewLegalProfile(ctx),
        subscription: canViewSubscription(ctx),
        switchTenant: canSwitchTenant(ctx),
        diagnostics: canViewDiagnostics(ctx),
        savedSuppliers: canViewSavedSuppliers(ctx),
        viewport: canViewViewport(ctx),
    };
}
