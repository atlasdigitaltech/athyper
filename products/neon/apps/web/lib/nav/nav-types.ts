// lib/nav/nav-types.ts
//
// Type definitions for the dynamic navigation tree.
// The nav tree is loaded from the core.module DB table via /api/nav/modules
// and rendered in the sidebar as a hierarchical structure:
//   Workspace > Module > Entity

/** Represents a single entity (leaf node) in the navigation tree. */
export interface NavEntity {
    /** URL-safe identifier (e.g., "supplier"). Used in /app/:entity routes. */
    slug: string;
    /** Display name (e.g., "Suppliers"). */
    label: string;
    /** Lucide icon name (e.g., "Building2"). */
    icon: string;
    /** Sort order within the parent module. */
    sortOrder: number;
    /** Optional required role to see this entity (e.g., "neon:MODULE:ACC"). */
    requiredRole?: string;
}

/** Represents a module grouping entities within a workspace. */
export interface NavModule {
    /** Module code (e.g., "procurement"). */
    code: string;
    /** Display name (e.g., "Procurement"). */
    label: string;
    /** Lucide icon name. */
    icon: string;
    /** Entities within this module. */
    entities: NavEntity[];
    /** Sort order within the parent workspace. */
    sortOrder: number;
    /** Optional required role to see this module. */
    requiredRole?: string;
}

/** Represents a workspace (business domain) grouping modules. */
export interface NavWorkspace {
    /** Workspace code (e.g., "operations"). */
    code: string;
    /** Display name (e.g., "Operations"). */
    label: string;
    /** Modules within this workspace. */
    modules: NavModule[];
    /** Sort order within the nav tree. */
    sortOrder: number;
}

/** The full navigation tree returned by /api/nav/modules. */
export interface NavTree {
    /** Workspaces containing modules and entities. */
    workspaces: NavWorkspace[];
}

/** API response shape from /api/nav/modules. */
export interface NavTreeResponse {
    tree: NavTree;
    /** Whether the response is from a static fallback (DB unavailable). */
    isFallback: boolean;
}
