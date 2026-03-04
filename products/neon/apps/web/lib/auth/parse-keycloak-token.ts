// lib/auth/parse-keycloak-token.ts
//
// Extracts structured claims from a decoded Keycloak JWT payload.
// Used by the auth callback (server-side) to populate the Redis session,
// and by the claims normalizer to derive authorization context.
//
// Keycloak token claim paths:
//   realm_access.roles          → realm-level roles (e.g., ["admin", "user"])
//   resource_access[client].roles → client-level roles (e.g., ["neon:WORKBENCH:ADMIN", "neon:MODULE:ACC"])
//   groups                      → group membership paths (e.g., ["/branches/HQ"])
//   tenant_id                   → custom claim from token mapper

export interface ParsedTokenClaims {
    sub: string;
    preferredUsername: string;
    email?: string;
    name: string;
    realmRoles: string[];
    /** Client roles from resource_access[clientId].roles — workbench + module + persona roles. */
    clientRoles: string[];
    /** Group membership paths from the `groups` claim. */
    groups: string[];
    /** Tenant ID from the `tenant_id` claim, or fallback. */
    tenantId: string;
}

/**
 * Parse a decoded JWT payload into structured claims.
 *
 * @param claims - The decoded JWT payload (from decodeJwtPayload or similar)
 * @param clientId - The Keycloak client ID (e.g., "neon-web") to look up client roles
 * @param fallbackTenantId - Fallback tenant ID if not present in token (from env var)
 */
export function parseKeycloakToken(
    claims: Record<string, unknown>,
    clientId: string,
    fallbackTenantId: string = "default",
): ParsedTokenClaims {
    const sub = typeof claims.sub === "string" ? claims.sub : "unknown";
    const preferredUsername = typeof claims.preferred_username === "string" ? claims.preferred_username : sub;
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const name = typeof claims.name === "string" ? claims.name : preferredUsername;

    // Realm roles
    const realmRoles: string[] = [];
    const realmAccess = claims.realm_access as { roles?: unknown[] } | undefined;
    if (Array.isArray(realmAccess?.roles)) {
        for (const r of realmAccess.roles) {
            if (typeof r === "string") realmRoles.push(r);
        }
    }

    // Client roles from resource_access
    const clientRoles: string[] = [];
    const resourceAccess = claims.resource_access as Record<string, { roles?: unknown[] }> | undefined;
    if (resourceAccess?.[clientId]?.roles && Array.isArray(resourceAccess[clientId].roles)) {
        for (const r of resourceAccess[clientId].roles) {
            if (typeof r === "string") clientRoles.push(r);
        }
    }

    // Groups
    const groups: string[] = [];
    if (Array.isArray(claims.groups)) {
        for (const g of claims.groups) {
            if (typeof g === "string") groups.push(g);
        }
    }

    // Tenant ID
    const tenantId = typeof claims.tenant_id === "string" ? claims.tenant_id : fallbackTenantId;

    return {
        sub,
        preferredUsername,
        email,
        name,
        realmRoles,
        clientRoles,
        groups,
        tenantId,
    };
}
