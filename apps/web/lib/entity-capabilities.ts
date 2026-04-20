import type { CompiledEntity, DetailTab } from "@athyper/api-contracts/metadata";
import { resolveTabs, resolveRendererFamily, type RendererFamily } from "@athyper/metadata-client/compiled-reader";

/**
 * Resolved capability set for a compiled entity.
 *
 * Drives which subroutes and tabs are available in the shell.
 * Computed once per entity via resolveCapabilities(); consumed by
 * Server Components for conditional link rendering and by page guards.
 */
export interface EntityCapabilities {
  // ── Subroute availability ─────────────────────────────────────
  /** /app/[entity]/[id]/flow is reachable */
  hasFlow: boolean;
  /** /app/[entity]/[id]/attachments is reachable */
  hasAttachments: boolean;
  /** /app/[entity]/[id]/versions is reachable */
  hasVersions: boolean;
  /** /app/[entity]/[id]/compare is reachable */
  hasCompare: boolean;
  /** /app/[entity]/[id]/edit is reachable */
  hasEdit: boolean;
  /** /app/[entity]/import is reachable */
  hasImport: boolean;
  /** /app/[entity]/bulk is reachable */
  hasBulk: boolean;

  // ── Tab set (ordered, resolved by resolveTabs) ─────────────────
  tabs: DetailTab[];

  // ── Renderer strategy ─────────────────────────────────────────
  renderer: RendererFamily;
}

/**
 * Derive the full capability set from a compiled entity descriptor.
 *
 * Pure function — no I/O. Call it after fetching via getCompiledEntity().
 */
export function resolveCapabilities(meta: CompiledEntity): EntityCapabilities {
  const flags = meta.feature_flags ?? {};
  const tabs = resolveTabs(meta, null, []);
  const renderer = resolveRendererFamily(meta);

  const hasVersions = Boolean(flags.version_control ?? flags.has_versioning);

  return {
    // Subroutes
    hasFlow:        Boolean(flags.is_approvable),
    hasAttachments: flags.has_attachments !== false,
    hasVersions,
    hasCompare:     hasVersions,   // compare requires version_control too
    hasEdit:        renderer !== "ledger",
    hasImport:      Boolean(flags.is_importable),
    hasBulk:        Boolean(flags.is_bulk_editable ?? flags.is_exportable),
    // Tabs
    tabs,
    // Renderer
    renderer,
  };
}
