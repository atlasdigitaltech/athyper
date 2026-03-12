// lib/schema-manager/capability-flags.ts
//
// Rule-driven guardrails per entity class.
// Determines which tabs and features are available for each entity type.

import type { EntityClass } from "./types";

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
  supportsControls: boolean;
  supportsOperations: boolean;
}

/**
 * Capability matrix per entity class.
 *
 * - REFERENCE: Lightweight lookup tables. No lifecycle, workflows, or overlays.
 * - MASTER: Full-featured business entities. All capabilities enabled.
 * - DOCUMENT: Document-oriented entities. Most features except temporal.
 * - CONTROL: Configuration/rules entities. Basic capabilities.
 * - LEDGER: Immutable append-only records. Limited capabilities.
 * - LOG: Operational event streams. Minimal capabilities.
 */
export const ENTITY_CAPABILITIES: Record<EntityClass, CapabilityFlags> = {
  REFERENCE: {
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
    supportsControls: true,
    supportsOperations: true,
  },
  MASTER: {
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
    supportsControls: true,
    supportsOperations: true,
  },
  DOCUMENT: {
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
    supportsControls: true,
    supportsOperations: true,
  },
  CONTROL: {
    supportsLifecycle: false,
    supportsApprovals: false,
    supportsNumbering: false,
    supportsTemporal: false,
    supportsOverlays: true,
    supportsWorkflows: false,
    supportsForms: true,
    supportsViews: true,
    supportsIntegrations: false,
    supportsValidation: true,
    supportsControls: true,
    supportsOperations: true,
  },
  LEDGER: {
    supportsLifecycle: false,
    supportsApprovals: false,
    supportsNumbering: true,
    supportsTemporal: false,
    supportsOverlays: false,
    supportsWorkflows: false,
    supportsForms: false,
    supportsViews: true,
    supportsIntegrations: false,
    supportsValidation: true,
    supportsControls: true,
    supportsOperations: true,
  },
  LOG: {
    supportsLifecycle: false,
    supportsApprovals: false,
    supportsNumbering: false,
    supportsTemporal: false,
    supportsOverlays: false,
    supportsWorkflows: false,
    supportsForms: false,
    supportsViews: true,
    supportsIntegrations: false,
    supportsValidation: false,
    supportsControls: false,
    supportsOperations: true,
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
  controls: "supportsControls",
  operations: "supportsOperations",
};

/**
 * Check whether a tab should be visible for a given entity class.
 * Tabs not in the capability map are always visible (e.g., fields, relations, indexes).
 */
export function isTabEnabled(segment: string, entityClass: EntityClass): boolean {
  const capKey = TAB_CAPABILITY_MAP[segment];
  if (!capKey) return true; // Structural tabs are always visible
  return ENTITY_CAPABILITIES[entityClass][capKey];
}
