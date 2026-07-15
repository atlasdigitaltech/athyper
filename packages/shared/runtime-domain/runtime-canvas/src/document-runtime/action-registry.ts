"use client";

/**
 * @athyper/runtime-canvas — Document toolbar action aggregator.
 *
 * Cleanup Plan v5 §4.3 + amendment 3.
 *
 * NOT a global module-level registry like the composer / sidecar /
 * strategy ones — toolbar actions are SCOPED to a single document
 * page's surfaces. The aggregator runs once at provider mount: walk
 * `descriptor.surfaces`, pull each `toolbar_action` (or `toolbar_actions`)
 * out of the config, dedupe, return.
 *
 * This avoids cross-page state pollution and side-effect cross-surface
 * registration (amendment 3 — surfaces are independent; the registry
 * is the only coordination point).
 */

import type {
  MetaEntitySurface,
  SurfaceToolbarAction,
} from "@athyper/runtime-contracts";

/**
 * Aggregates toolbar actions from a descriptor's surfaces. Last write
 * wins on duplicate code (per design plan §4.3 — descriptor authors
 * resolve conflicts at seed time).
 */
export function aggregateToolbarActions(
  surfaces: ReadonlyArray<MetaEntitySurface>,
): Map<string, SurfaceToolbarAction> {
  const actions = new Map<string, SurfaceToolbarAction>();
  for (const surface of surfaces) {
    if (!surface.enabled) continue;
    extractActionsFromSurface(surface).forEach((action) => {
      actions.set(action.code, action);
    });
  }
  return actions;
}

/** Pull toolbar actions out of a single surface's config. */
function extractActionsFromSurface(surface: MetaEntitySurface): SurfaceToolbarAction[] {
  // document_header: surface.config.toolbar_actions[]
  // postings_preview: surface.config.toolbar_action (singular; optional)
  if (surface.kind === "postings_preview") {
    const action = surface.config.toolbar_action;
    return action ? [action] : [];
  }
  return [];
}
