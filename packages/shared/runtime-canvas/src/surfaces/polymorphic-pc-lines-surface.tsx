"use client";

/**
 * @athyper/runtime-canvas — polymorphic_pc_lines surface renderer.
 *
 * Cleanup Plan v5 §4.3 + §6.1 + amendments 2 + 6.
 *
 * Composes LineItemsSurface (line-item-runtime) with controlled-data
 * from DocumentRuntimeContext. The row-expansion drawer (PiLineDrawer
 * for now; DocumentLineWaterfallDrawer post-P2c rename) mounts below
 * each expanded row via `renderRowExpansion`.
 *
 * Amendment 2: this surface DOES NOT fetch lines itself. It reads
 * ctx.children.lines from the provider; LineItemsSurface uses
 * controlledData mode (Sprint 2 P2b).
 *
 * Amendment 6: PC + AD are split into headerScope/byLineId in the
 * provider; this renderer just passes the per-line slices to the
 * row drawer.
 */

import type { ReactNode } from "react";
import { LineItemsSurface } from "@athyper/line-item-runtime/surface";
import type { LineRecord } from "@athyper/line-item-runtime";
import type { MetaEntityLineItemsSurface } from "@athyper/runtime-contracts";
import type { AccountingDistribution } from "@athyper/api-contracts/documents";
import {
  PiLineDrawer,
  projectLine,
  projectPricingComponents,
  projectAccountingDistributions,
} from "@athyper/content-ui";
import { useDocumentRuntimeContext } from "../document-runtime/DocumentRuntimeContext";
import type { RuntimeSurfaceRendererProps } from "./types";

export function PolymorphicPcLinesSurfaceRenderer({
  surface,
  contract,
  recordId,
  record,
}: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "polymorphic_pc_lines") return null;
  const ctx = useDocumentRuntimeContext();

  // ── Synthesize a MetaEntityLineItemsSurface so LineItemsSurface can
  // mount unchanged. The line entity code comes from the binding row
  // resolved during useDocumentChildren (Sprint 3 P3a). For now we
  // surface it via config or fall back to a heuristic. The full binding
  // → line_entity_code resolution wires in when descriptor compile lands.
  const lineEntityCode = readLineEntityCode(surface, contract);
  if (!lineEntityCode) {
    return (
      <div className="text-xs italic text-muted-foreground p-3 border border-dashed border-border rounded-md">
        polymorphic_pc_lines surface: cannot resolve line entity code from binding.
      </div>
    );
  }

  const synthesizedSurface: MetaEntityLineItemsSurface = {
    kind:       "line_items",
    key:        surface.key,
    label:      surface.label,
    order:      surface.order,
    placement:  surface.placement,
    enabled:    surface.enabled,
    entityCode: lineEntityCode,
    displayMode: "grid",
    canCreate: true,
    canEdit:   true,
    canDelete: true,
    affectsTotals:     false,
    requiredForSubmit: false,
  };

  // Lines slice (raw RuntimeRecordRow → LineRecord cast); P2c rename
  // will tighten this contract.
  const lines = ctx.children.lines as unknown as LineRecord[];
  const distributions = ctx.children.distributions.all as unknown as AccountingDistribution[];

  return (
    <div data-document-runtime-surface="polymorphic_pc_lines">
      <LineItemsSurface
        surface={synthesizedSurface}
        entityCode={contract.entityCode}
        recordId={recordId}
        record={record}
        editMode={true}
        controlledData={{
          lines,
          distributions,
          isLoading: ctx.children.isLoading,
          error:     ctx.children.error,
          onRefresh: ctx.children.onRefresh,
        }}
        renderRowExpansion={(line: LineRecord) => renderPiLineDrawerExpansion(line, ctx)}
      />
    </div>
  );
}

/**
 * Row drawer for a single PI line. Reads per-line PC + AD slices from
 * DocumentRuntimeContext (single canonical line collection per
 * amendment 2) and mounts `PiLineDrawer` from `@athyper/content-ui`.
 *
 * Affordances are pinned to `read_only` for PR3. Write paths (add /
 * edit / delete component + distribution, supersede, audit) wire in
 * with the action-registry handlers later.
 */
function renderPiLineDrawerExpansion(
  line: LineRecord,
  ctx: ReturnType<typeof useDocumentRuntimeContext>,
): ReactNode {
  const lineId = String((line as { id?: unknown }).id ?? "");
  if (!lineId) return null;

  const projectedLine = projectLine(line as unknown as Record<string, unknown>);
  const componentsForLine = projectPricingComponents(
    (ctx.children.pricingComponents.byLineId.get(lineId) ?? []) as ReadonlyArray<Record<string, unknown>>,
  );
  const distributionsForLine = projectAccountingDistributions(
    (ctx.children.distributions.byLineId.get(lineId) ?? []) as ReadonlyArray<Record<string, unknown>>,
  );

  return (
    <div className="px-3 py-3" data-document-runtime-surface="polymorphic_pc_lines_row_drawer">
      <PiLineDrawer
        line={projectedLine}
        components={componentsForLine}
        distributions={distributionsForLine}
        componentsAffordance="read_only"
        distributionsAffordance="read_only"
      />
    </div>
  );
}

interface ContractLike {
  entityCode: string;
  /** Optional display config that may carry line_entity_code. */
  extensions?: Record<string, unknown>;
}

function readLineEntityCode(
  surface: { config?: { line_binding_code?: unknown } },
  contract: ContractLike,
): string | null {
  // Future: resolve binding_code → child_entity_code via descriptor compile.
  // For now: read from config.line_binding_code as a string, OR fall back
  // to `<parent>_line` heuristic to match line-item-runtime defaults.
  const fromConfig = surface.config?.line_binding_code;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    // binding_code convention is "<parent>__<child>"; split on "__".
    const childCode = fromConfig.split("__")[1];
    if (childCode) return childCode;
  }
  if (contract.entityCode) return `${contract.entityCode}_line`;
  return null;
}
