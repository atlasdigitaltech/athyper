// lib/auth/types.ts
//
// Frozen enumerations for the authorization system.
// These define the vocabulary shared between Keycloak client roles,
// the session bootstrap, the AuthProvider, and the nav registry.
//
// Role naming conventions (Neon v2 — singular namespaces):
//   neon:WORKBENCH:<workbench>   → workbench access   (e.g., "neon:WORKBENCH:ADMIN")
//   neon:MODULE:<module>         → module access       (e.g., "neon:MODULE:ACC")
//   neon:PERSONA:<persona>       → persona assignment   (e.g., "neon:PERSONA:tenant_admin")

// ─── Workbenches ──────────────────────────────────────────────────
export const WORKBENCHES = ["user", "partner", "admin", "ops"] as const;
export type Workbench = (typeof WORKBENCHES)[number];

/** Type guard for validating workbench strings at runtime. */
export function isWorkbench(value: string): value is Workbench {
    return (WORKBENCHES as readonly string[]).includes(value);
}

// ─── Role Domains ───────────────────────────────────────────────
export const ROLE_DOMAINS = ["WORKBENCH", "MODULE", "PERSONA"] as const;
export type RoleDomain = (typeof ROLE_DOMAINS)[number];

// ─── Role types ─────────────────────────────────────────────────
export type WorkbenchRole = `neon:WORKBENCH:${Workbench}`;
export type ModuleRole = `neon:MODULE:${string}`;
export type PersonaRole = `neon:PERSONA:${string}`;
export type NeonRole = WorkbenchRole | ModuleRole | PersonaRole;

/** Build a workbench role string. */
export function workbenchRole(wb: Workbench): WorkbenchRole {
    return `neon:WORKBENCH:${wb}`;
}

/** Build a module role string. */
export function moduleRole(mod: string): ModuleRole {
    return `neon:MODULE:${mod}`;
}

/** Build a persona role string. */
export function personaRole(persona: string): PersonaRole {
    return `neon:PERSONA:${persona}`;
}

/** Parsed result of a neon:* role string. */
export type ParsedNeonRole =
    | { domain: "WORKBENCH"; value: Workbench }
    | { domain: "MODULE"; value: string }
    | { domain: "PERSONA"; value: string };

/**
 * Parse a role string into its domain and value, or null if not a neon:* role.
 *
 * Workbench values are normalized to lowercase (Keycloak uses ADMIN, code uses admin).
 *
 * Examples:
 *   "neon:WORKBENCH:ADMIN"       → { domain: "WORKBENCH", value: "admin" }
 *   "neon:MODULE:ACC"            → { domain: "MODULE",    value: "ACC" }
 *   "neon:PERSONA:tenant_admin"  → { domain: "PERSONA",  value: "tenant_admin" }
 *   "some-other-role"            → null
 */
export function parseNeonRole(role: string): ParsedNeonRole | null {
    if (!role.startsWith("neon:")) return null;
    const parts = role.split(":");
    if (parts.length !== 3) return null;

    const domain = parts[1];
    const value = parts[2];

    if (domain === "WORKBENCH") {
        const lower = value.toLowerCase();
        if (isWorkbench(lower)) return { domain: "WORKBENCH", value: lower };
        return null;
    }
    if (domain === "MODULE") {
        return { domain: "MODULE", value };
    }
    if (domain === "PERSONA") {
        return { domain: "PERSONA", value };
    }

    return null;
}

// ─── Workbench priority for default resolution ──────────────────
/** Priority order for resolving default workbench (lower index = higher priority). */
export const WORKBENCH_PRIORITY: readonly Workbench[] = ["user", "partner", "ops", "admin"];
