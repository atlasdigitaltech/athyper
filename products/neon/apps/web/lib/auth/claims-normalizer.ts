// lib/auth/claims-normalizer.ts
//
// Converts parsed Keycloak token claims into a normalized authorization context.
// This is the bridge between raw JWT claims and the application's role model.
//
// Role syntax (Neon v2 — singular namespaces):
//   neon:WORKBENCH:<workbench>  → workbench access  (e.g., neon:WORKBENCH:ADMIN)
//   neon:MODULE:<module>        → module access      (e.g., neon:MODULE:ACC)
//   neon:PERSONA:<persona>      → persona assignment  (e.g., neon:PERSONA:tenant_admin)
//
// Backward compatibility:
//   If no neon:* client roles are present (Keycloak not configured yet),
//   the normalizer falls back to deriving workbench access from realm roles:
//     - realm "admin" role → all workbench access
//     - otherwise → "user" workbench only

import {
    parseNeonRole,
    type Workbench,
    WORKBENCHES,
} from "./types";

import type { ParsedTokenClaims } from "./parse-keycloak-token";

export interface NormalizedAuth {
    userId: string;
    displayName: string;
    email?: string;
    tenantId: string;
    /** Workbenches the user is allowed to access. */
    allowedWorkbenches: Workbench[];
    /** Module codes the user has access to. */
    modules: string[];
    /** Persona codes assigned to the user. */
    personas: string[];
    /** Raw group paths for data scoping. */
    groups: string[];
    realmRoles: string[];
    clientRoles: string[];
}

/**
 * Normalize parsed Keycloak claims into an authorization context.
 *
 * Extracts workbench access from `neon:WORKBENCH:*` client roles,
 * module access from `neon:MODULE:*`, and personas from `neon:PERSONA:*`.
 * Falls back to realm roles if no client roles are present.
 */
export function normalizeClaims(parsed: ParsedTokenClaims): NormalizedAuth {
    const allowedWorkbenches: Workbench[] = [];
    const modules: string[] = [];
    const personas: string[] = [];

    // Parse client roles into workbench, module, and persona access
    for (const role of parsed.clientRoles) {
        const parsed_role = parseNeonRole(role);
        if (!parsed_role) continue;

        switch (parsed_role.domain) {
            case "WORKBENCH":
                if (!allowedWorkbenches.includes(parsed_role.value)) {
                    allowedWorkbenches.push(parsed_role.value);
                }
                break;
            case "MODULE":
                if (!modules.includes(parsed_role.value)) {
                    modules.push(parsed_role.value);
                }
                break;
            case "PERSONA":
                if (!personas.includes(parsed_role.value)) {
                    personas.push(parsed_role.value);
                }
                break;
        }
    }

    // Backward compatibility: if no neon:WORKBENCH:* client roles found, derive from realm roles
    if (allowedWorkbenches.length === 0) {
        if (parsed.realmRoles.includes("admin")) {
            // Admin realm role → full workbench access
            for (const wb of WORKBENCHES) {
                allowedWorkbenches.push(wb);
            }
        } else if (parsed.realmRoles.includes("partner")) {
            allowedWorkbenches.push("partner", "user");
        } else if (parsed.realmRoles.includes("ops")) {
            allowedWorkbenches.push("ops", "user");
        } else {
            // Default: user workbench only
            allowedWorkbenches.push("user");
        }
    }

    return {
        userId: parsed.sub,
        displayName: parsed.name,
        email: parsed.email,
        tenantId: parsed.tenantId,
        allowedWorkbenches,
        modules,
        personas,
        groups: parsed.groups,
        realmRoles: parsed.realmRoles,
        clientRoles: parsed.clientRoles,
    };
}

/**
 * Serialize modules array to a plain object for JSON transport.
 * Kept as string[] for simplicity since modules don't have action granularity.
 */
export function serializeModules(modules: string[]): string[] {
    return [...modules];
}

/**
 * Serialize personas array to a plain object for JSON transport.
 */
export function serializePersonas(personas: string[]): string[] {
    return [...personas];
}
