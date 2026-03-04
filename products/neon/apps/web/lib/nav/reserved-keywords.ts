// lib/nav/reserved-keywords.ts
//
// Reserved path segments under /app/:entity/* that cannot be used as entity IDs.
// These are enforced at both the routing level (Next.js static routes take precedence)
// and the validation level (entity slug registration rejects these).

/**
 * Reserved URL segments that cannot be used as entity slugs or record IDs.
 * These correspond to static route segments under /app/[entity]/* and
 * system-level paths that must not collide with dynamic entity routing.
 */
export const RESERVED_SLUGS = new Set([
    // System-level paths
    "wb",
    "app",
    "api",
    "login",
    "callback",
    "logout",
    "health",
    "public",
    "select",
    "unauthorized",
    "forbidden",
    "home",
    "dashboards",
    "settings",
    "meta",

    // Entity route keywords (static segments under /app/[entity]/*)
    "view",
    "new",
    "edit",
    "bulk",
    "import",
    "mapping",
    "templates",
    "admin",
    "embed",
    "workflow",
    "approvals",
    "tasks",
    "actions",
    "share",
    "comments",
    "watchers",
    "access-request",
    "reports",
    "export",
    "print",
    "events",
    "integrations",
    "webhooks",
    "versions",
    "compare",
    "restore",
    "quality",
    "validate",
    "rules",
    "clone",
]);

/**
 * Check if a slug is reserved and cannot be used as an entity slug or record ID.
 */
export function isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug.toLowerCase());
}
