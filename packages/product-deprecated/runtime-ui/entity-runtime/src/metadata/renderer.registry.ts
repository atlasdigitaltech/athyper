/**
 * Renderer registry — static detail/list strategy map + lines registration.
 *
 * Static detail and list renderers live here (all Layer-3 components).
 * Dynamic lines renderers are owned by the lines registry in runtime-shared
 * (Layer 2) and populated at app boot by document-runtime/src/register.ts.
 *
 * Layer rule: this file MUST NOT import from document-runtime (Layer 4).
 */

import { EntityDetailPage } from "../detail";

// Re-export the lines registry from runtime-shared so callers can
// import everything from a single "@athyper/entity-runtime/metadata" path.
export {
  registerLinesRenderer,
  resolveLinesRenderer,
  type LinesRenderer,
  type LinesRendererProps,
} from "@athyper/runtime-shared/renderer-registry";

// ── Static renderer maps ────────────────────────────────────────────────────

/**
 * Maps display_config.detail_renderer → the React component that renders
 * the detail page for that strategy. MasterDetailPage is not listed here —
 * it is selected internally by EntityDetailPage when detail_renderer = "master".
 */
export const detailRendererMap = {
  master:   EntityDetailPage,
  document: EntityDetailPage,
  ledger:   EntityDetailPage,
} as const;

export type DetailRendererKey = keyof typeof detailRendererMap;
