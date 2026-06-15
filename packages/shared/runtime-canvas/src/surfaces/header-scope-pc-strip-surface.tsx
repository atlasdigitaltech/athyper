"use client";

/**
 * @athyper/runtime-canvas — header_scope_pc_strip surface renderer.
 *
 * Cleanup Plan v5 §4.4 + §6.1.
 *
 * Renders the real `HeaderScopePcStrip` below the lines grid using
 * `DocumentRuntimeContext.children.pricingComponents` (amendment 6 —
 * already split into headerScope vs byLineId in the provider).
 *
 * Apportionment is computed client-side via
 * `projectHeaderScopeProjections` — basis from PC.apportion_basis,
 * overrides detected against line-scope PC with the same
 * condition_type_code on the same line.
 *
 * Affordance pinned to `read_only` for PR4. Add / edit / replace /
 * jump-to-line wire in with the action registry handlers later.
 */

import {
  HeaderScopePcStrip,
  projectLine,
  projectPricingComponents,
  projectHeaderScopeProjections,
} from "@athyper/content-ui";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { useDocumentRuntimeContext } from "../document-runtime/DocumentRuntimeContext";
import type { RuntimeSurfaceRendererProps } from "./types";

export function HeaderScopePcStripSurfaceRenderer({ surface }: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "header_scope_pc_strip") return null;
  const ctx = useDocumentRuntimeContext();

  const headerScopeRows = ctx.children.pricingComponents.headerScope as ReadonlyArray<RuntimeRecordRow>;

  // Per UI-P6: hide entirely when there are no header-scope rows.
  if (headerScopeRows.length === 0) return null;

  const headerScopeComponents = projectPricingComponents(
    headerScopeRows as ReadonlyArray<Record<string, unknown>>,
  );
  const lines = (ctx.children.lines as ReadonlyArray<Record<string, unknown>>).map(projectLine);
  const lineScopeRows: Record<string, unknown>[] = [];
  for (const slice of ctx.children.pricingComponents.byLineId.values()) {
    for (const row of slice) lineScopeRows.push(row as unknown as Record<string, unknown>);
  }
  const lineScopeComponents = projectPricingComponents(lineScopeRows);
  const projections = projectHeaderScopeProjections(
    headerScopeComponents,
    lines,
    lineScopeComponents,
  );

  // Pull the document currency triad off the parent record. PI uses
  // currency_code / base_currency_code / exchange_rate; defaults match
  // projectHeader so the strip renders something useful even when
  // hydration is partial.
  const record = ctx.record;
  const currencyCode     = typeof record["currency_code"] === "string" ? record["currency_code"] as string : "INR";
  const baseCurrencyCode = typeof record["base_currency_code"] === "string" ? record["base_currency_code"] as string : currencyCode;
  const exchangeRate     = typeof record["exchange_rate"] === "number" ? record["exchange_rate"] as number : 1;

  return (
    <div data-document-runtime-surface="header_scope_pc_strip">
      <HeaderScopePcStrip
        projections={projections}
        currencyCode={currencyCode}
        baseCurrencyCode={baseCurrencyCode}
        exchangeRate={exchangeRate}
        affordance="read_only"
      />
    </div>
  );
}
