// lib/schema-manager/capability-flags.ts
//
// Rule-driven guardrails per entity kind.
// Determines which tabs and features are available for each entity type.

export interface CapabilityFlags {
    supportsLifecycle: boolean;
    supportsApprovals: boolean;
    supportsNumbering: boolean;
    supportsTemporal: boolean;
    supportsOverlays: boolean;
    supportsWorkflows: boolean;
    supportsForms: boolean;
    supportsViews: boolean;
    supportsIntegrations: boolean;
    supportsValidation: boolean;
}

export type EntityKind = "ref" | "ent" | "doc";

/**
 * Capability matrix per entity kind.
 *
 * - ref (Reference Data): Lightweight lookup tables. No lifecycle, workflows, or overlays.
 * - ent (Entity): Full-featured business entities. All capabilities enabled.
 * - doc (Document): Document-oriented entities. Most features except temporal.
 */
export const ENTITY_CAPABILITIES: Record<EntityKind, CapabilityFlags> = {
    ref: {
        supportsLifecycle: false,
        supportsApprovals: false,
        supportsNumbering: false,
        supportsTemporal: false,
        supportsOverlays: false,
        supportsWorkflows: false,
        supportsForms: true,
        supportsViews: true,
        supportsIntegrations: false,
        supportsValidation: true,
    },
    ent: {
        supportsLifecycle: true,
        supportsApprovals: true,
        supportsNumbering: true,
        supportsTemporal: true,
        supportsOverlays: true,
        supportsWorkflows: true,
        supportsForms: true,
        supportsViews: true,
        supportsIntegrations: true,
        supportsValidation: true,
    },
    doc: {
        supportsLifecycle: true,
        supportsApprovals: true,
        supportsNumbering: true,
        supportsTemporal: false,
        supportsOverlays: true,
        supportsWorkflows: true,
        supportsForms: true,
        supportsViews: true,
        supportsIntegrations: true,
        supportsValidation: true,
    },
};

/**
 * Maps tab segments to the capability flag that controls them.
 */
export const TAB_CAPABILITY_MAP: Record<string, keyof CapabilityFlags> = {
    lifecycle: "supportsLifecycle",
    workflows: "supportsWorkflows",
    overlays: "supportsOverlays",
    forms: "supportsForms",
    views: "supportsViews",
    integrations: "supportsIntegrations",
    validation: "supportsValidation",
};

/**
 * Check whether a tab should be visible for a given entity kind.
 * Tabs not in the capability map are always visible (e.g., fields, relations, indexes).
 */
export function isTabEnabled(segment: string, kind: EntityKind): boolean {
    const capKey = TAB_CAPABILITY_MAP[segment];
    if (!capKey) return true; // Structural tabs are always visible
    return ENTITY_CAPABILITIES[kind][capKey];
}
