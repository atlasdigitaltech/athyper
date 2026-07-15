/**
 * Lines renderer registry - shared registration point.
 *
 * Lives in runtime-shared so runtime-canvas surfaces and app/domain line
 * renderers can interact with it without a circular dependency:
 *   runtime-canvas reads resolveLinesRenderer
 *   app/domain packages write registerLinesRenderer
 *
 * Register line renderers at app boot before any detail page mounts.
 */

import type { ComponentType } from "react";

/**
 * Minimal props that every lines renderer receives from runtime detail surfaces.
 * Phase 4 will tighten this to import CompiledEntity directly.
 */
export interface LinesRendererProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entity: any;
  record: { id: string; data: Record<string, unknown>; status?: string };
  recordId: string;
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinesRenderer = ComponentType<any>;

const linesRenderers: Record<string, LinesRenderer> = {};

/** Register a lines renderer under a display_config key (e.g. "generic", "journal"). */
export function registerLinesRenderer(key: string, renderer: LinesRenderer): void {
  linesRenderers[key] = renderer;
}

/**
 * Resolve a lines renderer by key.
 * Returns null when key is null/undefined (master entities have no lines).
 */
export function resolveLinesRenderer(key?: string | null): LinesRenderer | null {
  if (!key) return null;
  return linesRenderers[key] ?? null;
}
