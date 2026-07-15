"use client";

/**
 * @athyper/runtime-canvas — postings_preview surface renderer.
 *
 * Cleanup Plan v5 §4.5 + §6.1 + amendment 11.
 *
 * Listens for its declared `toolbar_action.code` on the
 * DocumentRuntimeContext action pub/sub (amendment 3). When the
 * header dispatches the action, this renderer opens the real
 * `PostingsPreviewSheet` from `@athyper/content-ui`.
 *
 * The current `buildPostingsPreview` is AP-hardcoded (see the file
 * comment in `postingsPreviewBuilder.ts`) — the registered strategy
 * code is verified at mount but only used as a sanity check today.
 * Future refactor (strategy contract extension) will route through
 * the strategy's own `deriveHeaderRows`/`accountLabels` to support
 * AR / payments / GR / SES with the same surface kind.
 */

import { useEffect, useMemo, useState } from "react";
import {
  PostingsPreviewSheet,
  projectHeader,
  projectLine,
  projectPricingComponents,
  projectAccountingDistributions,
} from "@athyper/content-ui";
import { useDocumentRuntimeContext } from "../document-runtime/document-runtime-context";
import { resolvePostingStrategy } from "../document-runtime/strategy-registry";
import type { RuntimeSurfaceRendererProps } from "./types";

export function PostingsPreviewSurfaceRenderer({ surface }: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "postings_preview") return null;
  const ctx = useDocumentRuntimeContext();
  const [open, setOpen] = useState(false);

  const strategyCode = surface.config.posting_strategy_code;
  const toolbarActionCode = surface.config.toolbar_action?.code;

  // Verify the strategy is registered. Errors loud on missing seed.
  // We resolve eagerly so dev catches the misconfig at mount, not on
  // user click.
  useEffect(() => {
    if (!strategyCode) return;
    resolvePostingStrategy(strategyCode, { isDescriptorSeeded: true });
  }, [strategyCode]);

  // Subscribe to the toolbar action dispatched by the header.
  useEffect(() => {
    if (!toolbarActionCode) return;
    return ctx.subscribeAction(toolbarActionCode, () => setOpen(true));
  }, [ctx, toolbarActionCode]);

  const header = useMemo(
    () => projectHeader(ctx.record, ctx.recordId),
    [ctx.record, ctx.recordId],
  );
  const lines = useMemo(
    () => (ctx.children.lines as ReadonlyArray<Record<string, unknown>>).map(projectLine),
    [ctx.children.lines],
  );
  const components = useMemo(
    () => projectPricingComponents(
      ctx.children.pricingComponents.all as ReadonlyArray<Record<string, unknown>>,
    ),
    [ctx.children.pricingComponents.all],
  );
  const distributions = useMemo(
    () => projectAccountingDistributions(
      ctx.children.distributions.all as ReadonlyArray<Record<string, unknown>>,
    ),
    [ctx.children.distributions.all],
  );

  return (
    <PostingsPreviewSheet
      open={open}
      onOpenChange={setOpen}
      builderInput={{ header, lines, components, distributions }}
      currencyCode={header.currency_code}
      baseCurrencyCode={header.base_currency_code}
      exchangeRate={header.exchange_rate}
      piCode={header.code}
      piSupplierLabel={header.supplier_label}
    />
  );
}
