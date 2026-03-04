// lib/auth/data-scopes.ts
//
// Derives structured data restriction scopes from Keycloak group paths.
//
// Keycloak groups follow a hierarchical path convention:
//   /branches/HQ       → user can see data for branch "HQ"
//   /branches/North    → user can see data for branch "North"
//   /costCenters/CC100 → user can see data for cost center "CC100"
//
// If a user has no group memberships, they are "unrestricted" (can see all data).
// This is the backward-compatible default for users without groups configured.

export interface DataScopes {
    /** Branch restrictions from /branches/* groups. */
    branches: string[];
    /** Cost center restrictions from /costCenters/* groups. */
    costCenters: string[];
    /** True if the user has no data restrictions (no groups assigned). */
    isUnrestricted: boolean;
}

/**
 * Extract structured data scopes from Keycloak group paths.
 *
 * @param groups - Raw group paths from the Keycloak token (e.g., ["/branches/HQ", "/costCenters/CC100"])
 */
export function extractDataScopes(groups: string[]): DataScopes {
    const branches: string[] = [];
    const costCenters: string[] = [];

    for (const group of groups) {
        const parts = group.split("/").filter(Boolean);
        if (parts.length < 2) continue;

        const category = parts[0];
        const value = parts.slice(1).join("/"); // Handle nested groups

        switch (category) {
            case "branches":
                branches.push(value);
                break;
            case "costCenters":
                costCenters.push(value);
                break;
            // Add more categories as needed (e.g., "departments", "regions")
        }
    }

    return {
        branches,
        costCenters,
        isUnrestricted: branches.length === 0 && costCenters.length === 0,
    };
}

/**
 * Serialize data scopes to a header-safe JSON string.
 * Used for X-Data-Scopes header when calling the runtime API.
 */
export function serializeDataScopes(scopes: DataScopes): string {
    if (scopes.isUnrestricted) return "unrestricted";
    return JSON.stringify({
        branches: scopes.branches,
        costCenters: scopes.costCenters,
    });
}
