/**
 * Entity Metadata Utilities (Client-Safe)
 *
 * Pure string conversion functions for entity slug ↔ name transformations.
 * This file has NO server-side dependencies (no kysely, no sql) so it can
 * be safely imported by "use client" components.
 *
 * Server-side DB-backed resolution lives in entity-meta.ts.
 */

/** "chart-of-accounts" → "ChartOfAccounts" */
export function slugToEntityName(slug: string): string {
    return slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

/** "ChartOfAccounts" → "chart-of-accounts" */
export function entityNameToSlug(name: string): string {
    return name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}

/** "ChartOfAccounts" → "Chart Of Accounts" */
export function entityNameToDisplayName(name: string): string {
    return name
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}
