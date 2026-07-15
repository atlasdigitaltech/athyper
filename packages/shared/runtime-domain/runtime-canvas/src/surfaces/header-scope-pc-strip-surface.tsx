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

import { useEffect, useMemo, useRef, useState } from "react";
import { flattenRuntimeRecord, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  ApportionmentBreakupDrawer,
  DiscountDrawer,
  HeaderScopePcStrip,
  TaxDrawer,
  WhtDrawer,
  enrichComponentsWithConditionType,
  projectLine,
  projectPricingComponents,
  projectHeaderScopeProjections,
  readPiStatus,
  resolveEditAffordance,
  useEditDraftContext,
  type EditAffordance,
  type LineRollupGroup,
  type PcDraft,
  type PricingComponent,
} from "@athyper/content-ui";
import { useDocumentRuntimeContext } from "../document-runtime/document-runtime-context";
import { useDocumentLookup } from "../document-runtime/use-document-lookup";
import type { RuntimeSurfaceRendererProps } from "./types";
import {
  DEFAULT_DISCOUNT_CONDITION_LOOKUP_CODE,
  DEFAULT_CHARGE_CONDITION_LOOKUP_CODE,
  DEFAULT_TAX_CONDITION_LOOKUP_CODE,
  DEFAULT_TAX_GROUP_LOOKUP_CODE,
  DEFAULT_WHT_CONDITION_LOOKUP_CODE,
  DEFAULT_WHT_GROUP_LOOKUP_CODE,
  DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE,
  deletePricingComponent,
  patchPricingComponentInPlace,
  postPricingComponentDraft,
  readDocumentPricingComponentContext,
  readSurfaceConfigString,
  toConditionTypeOptions,
  toTaxGroupOptions,
  toWhtGroupOptions,
} from "./pricing-component-actions";

export function HeaderScopePcStripSurfaceRenderer({ surface }: RuntimeSurfaceRendererProps) {
  // Phase 2 — accept both legacy and generic kind names during the compatibility window.
  if (surface.kind !== "header_scope_pc_strip" && surface.kind !== "document_components") return null;
  const ctx = useDocumentRuntimeContext();
  const [discountDrawerOpen, setDiscountDrawerOpen] = useState(false);
  const [chargeDrawerOpen, setChargeDrawerOpen] = useState(false);
  const [taxDrawerOpen, setTaxDrawerOpen] = useState(false);
  const [whtDrawerOpen, setWhtDrawerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // v3.1 Phase 4 — breakup drawer state. `breakupPcId` is the source
  // header PC the user clicked "View breakup" on; null = drawer closed.
  const [breakupPcId, setBreakupPcId] = useState<string | null>(null);
  // v3.1 Phase 5j — edit + delete affordances mirror the line drawer
  // surface. `editingComponent` is the PC being Edited/Replaced; when
  // set, the matching drawer opens in `replace` mode pre-filled with
  // the row's values. Cleared on drawer close or submit success.
  const [editingComponent, setEditingComponent] = useState<PricingComponent | null>(null);
  const sourceDocType = readSurfaceConfigString(
    surface.config,
    "source_doc_type",
    DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE,
  );
  const isPurchaseInvoicePricing = isPurchaseInvoiceSourceDocType(sourceDocType);
  // v3.1 Phase 6 — per-header-PC aggregates from the server. Refetched
  // any time the lines/PC slice changes (ctx.children.onRefresh fires
  // after every mutation). When undefined, the strip falls back to the
  // legacy client-computed totals so the UI still renders during the
  // first paint or if the summary endpoint errors.
  //
  // Phase 5 design decision (intentional gap): the Plan envisioned a
  // "Recompute pending — runs at submit" banner on the document header.
  // That model only applies if PC mutations are queued. We chose the
  // IMMEDIATE refresh model in Phase 0 (`refreshInvoiceCaches` runs
  // synchronously inside each mutator transaction), so there is never a
  // "stale cache pending recompute" state for a user to see — by the
  // time the API call returns, every PIL flat amount and every summary
  // aggregate already reflects the change. The freshness indicator that
  // remains useful is the SummaryExpansion's `Last computed: 2 min ago`,
  // which is per-PC and reads from server `computed_at`. No banner needed.
  const summariesByPcId = useApportionmentSummaries(
    ctx.recordId,
    ctx.children.isLoading,
    isPurchaseInvoicePricing,
  );
  // v3.1 Phase 6b — line-scope component rollup. Fetched in parallel
  // with the per-header summaries; the strip renders rollups as
  // read-only "← from lines" rows below the editable header entries.
  const lineRollups = useLineRollups(
    ctx.recordId,
    ctx.children.isLoading,
    isPurchaseInvoicePricing,
  );

  // Scroll-and-flash handler for the line drawer's "↗ from Header" chip
  // (v3.1 Phase 3). The strip surface is the natural owner — it knows its
  // own DOM. Registers once on mount; unregister on unmount keeps the
  // channel clean if a page swaps strips.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const unsubscribe = ctx.registerHeaderRowJumpHandler((sourceHeaderPcId) => {
      const root = rootRef.current;
      if (!root) return;
      const node = root.querySelector<HTMLElement>(`[data-pc-id="${cssEscape(sourceHeaderPcId)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      // Inline style flash — no global CSS dependency. amber-400 ring
      // mirrors the standard "drawing-your-eye" treatment used elsewhere.
      const prevShadow     = node.style.boxShadow;
      const prevTransition = node.style.transition;
      node.style.transition = "box-shadow 250ms ease-in-out";
      node.style.boxShadow  = "0 0 0 2px rgb(251 191 36)";
      window.setTimeout(() => {
        node.style.boxShadow  = prevShadow;
        node.style.transition = prevTransition;
      }, 800);
    });
    return unsubscribe;
  }, [ctx]);

  const headerScopeRows = ctx.children.pricingComponents.headerScope as ReadonlyArray<RuntimeRecordRow>;
  const labelOverride = typeof surface.config?.label_override === "string"
    ? surface.config.label_override
    : "Components";
  const discountLookupCode = readSurfaceConfigString(
    surface.config,
    "condition_type_lookup_code",
    DEFAULT_DISCOUNT_CONDITION_LOOKUP_CODE,
  );
  const chargeLookupCode = readSurfaceConfigString(
    surface.config,
    "charge_condition_type_lookup_code",
    DEFAULT_CHARGE_CONDITION_LOOKUP_CODE,
  );
  const taxConditionLookupCode = readSurfaceConfigString(
    surface.config,
    "tax_condition_type_lookup_code",
    DEFAULT_TAX_CONDITION_LOOKUP_CODE,
  );
  const taxGroupLookupCode = readSurfaceConfigString(
    surface.config,
    "tax_group_lookup_code",
    DEFAULT_TAX_GROUP_LOOKUP_CODE,
  );
  // WS-D: WHT-specific lookups. Caller can override the codes via surface
  // config to enable the WHT capture path; absent override defaults to
  // `pi_wht_condition_types` / `pi_wht_groups`. When the lookups return
  // empty (or 404 with the codes not yet provisioned), the CTA stays
  // hidden — feature is data-driven, not flag-driven at the surface level.
  const whtConditionLookupCode = readSurfaceConfigString(
    surface.config,
    "wht_condition_type_lookup_code",
    DEFAULT_WHT_CONDITION_LOOKUP_CODE,
  );
  const whtGroupLookupCode = readSurfaceConfigString(
    surface.config,
    "wht_group_lookup_code",
    DEFAULT_WHT_GROUP_LOOKUP_CODE,
  );
  // source_doc_type identifies which document family owns these components.
  // Purchase Order, Purchase Invoice, and future document cycles provide their
  // own value through the surface config while sharing the same renderer.
  const discountLookup = useDocumentLookup({
    lookupCode: discountLookupCode,
    enabled: true,
  });
  const chargeLookup = useDocumentLookup({
    lookupCode: chargeLookupCode,
    enabled: true,
  });
  const taxConditionLookup = useDocumentLookup({
    lookupCode: taxConditionLookupCode,
    enabled: true,
  });
  const taxGroupLookup = useDocumentLookup({
    lookupCode: taxGroupLookupCode,
    enabled: true,
  });
  const whtConditionLookup = useDocumentLookup({
    lookupCode: whtConditionLookupCode,
    enabled: true,
  });
  const whtGroupLookup = useDocumentLookup({
    lookupCode: whtGroupLookupCode,
    enabled: true,
  });
  // Affordance is the AND of two gates (v3.1 Phase 5k):
  //   1. PI status allows mutation (resolveEditAffordance via the
  //      pc-affordance-matrix → "edit" / "replace" / "read_only")
  //   2. The page is in EDIT MODE (the "Editing" pill on the document
  //      header toggles session.isEditing). When the user is in VIEW
  //      mode, no Add/Edit/Delete affordances should appear regardless
  //      of how mutable the PI's status is.
  //
  // useEditDraftContext returns null on pages that don't mount the
  // EditDraftProvider (storybook, classic tabs, etc.) — those default
  // to read_only too. Pages that always want edit affordances mount
  // the provider with isEditing=true.
  const editSession  = useEditDraftContext();
  const isPageEditing = editSession?.isEditing ?? false;
  const baseAffordance = resolveEditAffordance({
    status: readPiStatus(ctx.record["status"]),
    surface: "pc_header",
  });
  const affordance: EditAffordance = isPageEditing
    ? baseAffordance
    : "read_only";

  // When there are no header-scope rows, render a quiet empty-state body
  // rather than returning null. Returning null kept the tab + scrollspy
  // section mounted (the descriptor decides those, not the renderer),
  // which left an unexplained blank section in the page. The empty-state
  // body tells the user there's nothing to see + how to add one, and
  // the children-error path below renders the diagnostic when the
  // upstream binding fetch failed.
  // Records API doesn't hydrate condition_type_label/code on PC rows;
  // enrich client-side using the same lookup data the add drawers
  // depend on, so the TERM column shows the real condition name
  // ("Commercial Discount") instead of falling back to "unnamed".
  // Mirrors the line-drawer surface's enrichment in
  // polymorphic-pc-lines-surface.tsx (Phase 3) — without this, both
  // header rows and the override-detection lookup miss their labels.
  const discountConditionTypes = toConditionTypeOptions(discountLookup.records);
  const chargeConditionTypes   = toConditionTypeOptions(chargeLookup.records);
  const taxConditionTypes      = toConditionTypeOptions(taxConditionLookup.records);
  // WS-D: WHT condition types must participate in name enrichment so
  // withholding rows in the strip render as "Withholding Tax" instead of
  // "unnamed", and override detection by condition_type_code matches.
  const whtConditionTypes      = toConditionTypeOptions(whtConditionLookup.records);
  const enrichmentOptions      = [
    ...discountConditionTypes,
    ...chargeConditionTypes,
    ...taxConditionTypes,
    ...whtConditionTypes,
  ];
  const headerScopeComponents = enrichComponentsWithConditionType(
    projectPricingComponents(headerScopeRows.map((row) => flattenRuntimeRecord(row))),
    enrichmentOptions,
  );
  const lines = (ctx.children.lines as ReadonlyArray<RuntimeRecordRow>)
    .map((row) => projectLine(flattenRuntimeRecord(row)));
  const lineScopeRows: Record<string, unknown>[] = [];
  for (const slice of ctx.children.pricingComponents.byLineId.values()) {
    for (const row of slice) lineScopeRows.push(flattenRuntimeRecord(row as RuntimeRecordRow));
  }
  // Override detection in projectHeaderScopeProjections matches by
  // condition_type_code; enrich line-scope too so the match works.
  const lineScopeComponents = enrichComponentsWithConditionType(
    projectPricingComponents(lineScopeRows),
    enrichmentOptions,
  );
  // Line-owned components (manual, policy-resolved, inherited, etc.) are
  // projected into a single read-only header rollup for every document
  // family. Header-apportioned children are excluded by lineage below, so
  // the projection cannot count a header component back into itself.
  const projectedLineRollups = useMemo(
    () => buildLineRollups(lineScopeComponents),
    [lineScopeComponents],
  );
  const effectiveLineRollups = lineRollups && lineRollups.length > 0
    ? lineRollups
    : projectedLineRollups;
  const projections = projectHeaderScopeProjections(
    headerScopeComponents,
    lines,
    lineScopeComponents,
  );

  // All hooks and both stored/derived projections must run before deciding
  // that the surface is empty. Previously the read-only path returned as
  // soon as headerScopeRows was empty, making valid line-derived rollups
  // unreachable (and conditionally skipping the useMemo above).
  if (ctx.children.error) {
    return (
      <div
        data-document-runtime-surface="header_scope_pc_strip"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
      >
        <span className="font-medium text-destructive">{labelOverride}</span>
        <span className="text-muted-foreground ml-2 italic">
          Failed to load: {ctx.children.error.message}
        </span>
      </div>
    );
  }

  if (shouldShowComponentsEmptyState(
    headerScopeComponents.length,
    effectiveLineRollups.length,
    affordance,
  )) {
    return (
      <div
        data-document-runtime-surface="header_scope_pc_strip"
        className="rounded-md border border-dashed border-border px-3 py-2 text-xs"
      >
        <span className="font-medium text-muted-foreground">{labelOverride}</span>
        <span className="text-muted-foreground ml-2 italic">
          {isPurchaseInvoicePricing
            ? "None yet. Add via the line drawer to apportion across lines."
            : "No header-level components yet."}
        </span>
      </div>
    );
  }

  // Pull the document currency triad off the parent record. PI uses
  // currency_code / base_currency_code / exchange_rate; defaults match
  // projectHeader so the strip renders something useful even when
  // hydration is partial.
  const record = ctx.record;
  const currencyCode     = typeof record["currency_code"] === "string" ? record["currency_code"] as string : "INR";
  const baseCurrencyCode = typeof record["base_currency_code"] === "string" ? record["base_currency_code"] as string : currencyCode;
  const exchangeRate     = typeof record["exchange_rate"] === "number" ? record["exchange_rate"] as number : 1;
  // discountConditionTypes / chargeConditionTypes / taxConditionTypes /
  // whtConditionTypes are computed above for enrichment; reused here for
  // the Add drawers.
  const taxGroups = toTaxGroupOptions(taxGroupLookup.records);
  const whtGroups = toWhtGroupOptions(whtGroupLookup.records);
  const pricingContext = readDocumentPricingComponentContext(ctx.record, ctx.recordId, lines);
  const canAddDiscount = affordance === "edit" && discountConditionTypes.length > 0;
  const canAddCharge = affordance === "edit" && chargeConditionTypes.length > 0;
  const canAddTax = affordance === "edit" && taxConditionTypes.length > 0 && taxGroups.length > 0;
  // WS-D: data-driven gating — when the WHT lookups are not populated
  // for this tenant, the CTA stays hidden. The server-side feature flag
  // ATHYPER_AP_WHT_PC_ENABLED controls whether the lookup endpoints
  // surface rows at all, providing a deployment-level kill switch.
  const canAddWht = affordance === "edit" && whtConditionTypes.length > 0 && whtGroups.length > 0;

  // Submit handler shared by all three drawers (Discount / Charge / Tax).
  // Branches on (a) whether an existing component is being replaced and
  // (b) what status the parent invoice is in:
  //   - draft / rejected + replacingId → in-place PATCH (no v1/v2 audit
  //     chain because there's no audit obligation yet)
  //   - approval-stream + replacingId  → blocked; request revision/reopen
  //   - no replacingId                 → POST create-new
  // Same logic as the line drawer surface in polymorphic-pc-lines-surface.tsx.
  async function submitComponent(input: { draft: PcDraft; replacingId?: string }) {
    try {
      setSaveError(null);
      const piStatus = readPiStatus(ctx.record["status"]);
      const isDraftEdit = input.replacingId
        && editingComponent
        && (piStatus === "draft" || piStatus === "rejected" || String(piStatus) === "proforma");

      if (isDraftEdit) {
        await patchPricingComponentInPlace({
          parentId:    ctx.recordId,
          componentId: input.replacingId!,
          record:      ctx.record,
          lines,
          draft:       input.draft,
          sourceDocType,
        });
      } else {
        if (input.replacingId) {
          throw new Error("Pricing components are read-only unless the document is draft. Request revision before changing pricing.");
        }
        await postPricingComponentDraft({
          recordId: ctx.recordId,
          record:   ctx.record,
          lines,
          draft:    input.draft,
          replace: null,
          sourceDocType,
        });
      }
      setEditingComponent(null);
      await ctx.children.onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      throw err;
    }
  }

  // Route the user's Edit/Replace click to the right drawer based on the
  // PC's term_type. tax → TaxDrawer; withholding → WhtDrawer (WS-D);
  // charge has its own DiscountDrawer mount with termType="charge";
  // everything else (discount, retention, principal_marker) falls through
  // to the discount drawer.
  function openEditFor(componentId: string) {
    const component = headerScopeComponents.find((c) => c.id === componentId);
    if (!component) return;
    setEditingComponent(component);
    if (component.term_type === "tax") {
      setTaxDrawerOpen(true);
    } else if (component.term_type === "withholding") {
      setWhtDrawerOpen(true);
    } else if (component.term_type === "charge") {
      setChargeDrawerOpen(true);
    } else {
      setDiscountDrawerOpen(true);
    }
  }

  async function handleDelete(componentId: string) {
    try {
      setSaveError(null);
      await deletePricingComponent({
        parentId:    ctx.recordId,
        componentId,
        sourceDocType,
      });
      await ctx.children.onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
    }
  }

  // Drawer-close handler: reset `editingComponent` so the next Add click
  // doesn't accidentally land in replace mode against a stale row.
  function handleDrawerOpenChange(setOpen: (open: boolean) => void) {
    return (open: boolean) => {
      setOpen(open);
      if (!open) setEditingComponent(null);
    };
  }

  return (
    <div ref={rootRef} data-document-runtime-surface="header_scope_pc_strip">
      <HeaderScopePcStrip
        projections={projections}
        currencyCode={currencyCode}
        baseCurrencyCode={baseCurrencyCode}
        exchangeRate={exchangeRate}
        affordance={affordance}
        summariesByPcId={summariesByPcId}
        lineRollups={effectiveLineRollups}
        onAdd={canAddDiscount ? () => { setEditingComponent(null); setDiscountDrawerOpen(true); } : undefined}
        onAddCharge={canAddCharge ? () => { setEditingComponent(null); setChargeDrawerOpen(true); } : undefined}
        onAddTax={canAddTax ? () => { setEditingComponent(null); setTaxDrawerOpen(true); } : undefined}
        onAddWithholding={canAddWht ? () => { setEditingComponent(null); setWhtDrawerOpen(true); } : undefined}
        onEdit={affordance === "edit" ? openEditFor : undefined}
        onReplace={affordance === "replace" ? openEditFor : undefined}
        onDelete={affordance === "edit" ? (id) => { void handleDelete(id); } : undefined}
        onViewBreakup={isPurchaseInvoicePricing ? setBreakupPcId : undefined}
      />
      {affordance === "edit" && discountLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Discount lookup failed: {discountLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {affordance === "edit" && chargeLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Charge lookup failed: {chargeLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {affordance === "edit" && taxConditionLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Tax condition lookup failed: {taxConditionLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {affordance === "edit" && taxGroupLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Tax group lookup failed: {taxGroupLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {affordance === "edit" && !discountLookup.isLoading && !discountLookup.isError && discountConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active discount types are configured, so discounts cannot be added yet.
        </div>
      )}
      {affordance === "edit" && !chargeLookup.isLoading && !chargeLookup.isError && chargeConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active charge types are configured, so charges cannot be added yet.
        </div>
      )}
      {affordance === "edit" && !taxConditionLookup.isLoading && !taxConditionLookup.isError && taxConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active tax condition types are configured, so tax cannot be added yet.
        </div>
      )}
      {affordance === "edit" && !taxGroupLookup.isLoading && !taxGroupLookup.isError && taxGroups.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active tax groups are configured, so tax cannot be added yet.
        </div>
      )}
      {saveError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
      <DiscountDrawer
        mode={editingComponent && editingComponent.term_type === "discount" ? (affordance === "edit" ? "edit" : "replace") : "add"}
        termType="discount"
        open={discountDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setDiscountDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={lines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        conditionTypes={discountConditionTypes}
        replacingComponent={editingComponent && editingComponent.term_type === "discount" ? editingComponent : undefined}
        initialApplyTo="whole_invoice"
        onSubmit={submitComponent}
      />
      <DiscountDrawer
        mode={editingComponent && editingComponent.term_type === "charge" ? (affordance === "edit" ? "edit" : "replace") : "add"}
        termType="charge"
        open={chargeDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setChargeDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={lines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        conditionTypes={chargeConditionTypes}
        conditionTypeCapabilities={{ kindLabel: "Charge type" }}
        replacingComponent={editingComponent && editingComponent.term_type === "charge" ? editingComponent : undefined}
        initialApplyTo="whole_invoice"
        onSubmit={submitComponent}
      />
      <TaxDrawer
        mode={editingComponent && editingComponent.term_type === "tax" ? (affordance === "edit" ? "edit" : "replace") : "add"}
        open={taxDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setTaxDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={lines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        taxGroups={taxGroups}
        conditionTypeId={taxConditionTypes[0]?.id}
        conditionTypeSequence={taxConditionTypes[0]?.default_sequence}
        derivedPlaceOfSupply="inter_state"
        replacingComponent={editingComponent && editingComponent.term_type === "tax" ? editingComponent : undefined}
        components={[...headerScopeComponents, ...lineScopeComponents]}
        initialApplyTo="all_items"
        onSubmit={submitComponent}
      />
      {/* WS-D: WhtDrawer — separate drawer for withholding rows. Mounted
          when WHT lookups are populated for the tenant. */}
      <WhtDrawer
        mode={editingComponent && editingComponent.term_type === "withholding" ? (affordance === "edit" ? "edit" : "replace") : "add"}
        open={whtDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setWhtDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={lines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        whtGroups={whtGroups}
        conditionTypeId={whtConditionTypes[0]?.id}
        conditionTypeSequence={whtConditionTypes[0]?.default_sequence ?? 400}
        replacingComponent={editingComponent && editingComponent.term_type === "withholding" ? editingComponent : undefined}
        components={[...headerScopeComponents, ...lineScopeComponents]}
        initialApplyTo="one_item"
        onSubmit={submitComponent}
      />
      {/* v3.1 Phase 4 — breakup audit drawer. Mounted unconditionally so
          the DrawerPeekShell handles its own enter/exit animation; the
          drawer reads `open` from the boolean projection of breakupPcId. */}
      {isPurchaseInvoicePricing ? (
        <ApportionmentBreakupDrawer
          open={breakupPcId !== null}
          onOpenChange={(next) => { if (!next) setBreakupPcId(null); }}
          invoiceId={ctx.recordId}
          headerPcId={breakupPcId}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      ) : null}
    </div>
  );
}

export function shouldShowComponentsEmptyState(
  headerComponentCount: number,
  lineRollupCount: number,
  affordance: EditAffordance,
): boolean {
  return headerComponentCount === 0 && lineRollupCount === 0 && affordance !== "edit";
}

function buildLineRollups(components: ReadonlyArray<PricingComponent>): LineRollupGroup[] {
  const groups = new Map<string, PricingComponent[]>();
  for (const component of components) {
    if (!component.source_line_id
      || component.is_apportioned_from_id
      || component.superseded_by_id) continue;
    const group = groups.get(component.condition_type_id) ?? [];
    group.push(component);
    groups.set(component.condition_type_id, group);
  }

  return [...groups.values()]
    .sort((a, b) => (a[0]?.sequence ?? 0) - (b[0]?.sequence ?? 0))
    .map((group) => {
      const first = group[0]!;
      const rates = new Set(group.map((component) => component.rate_value));
      return {
        condition_type_id: first.condition_type_id,
        condition_type_label: first.condition_type_label || null,
        condition_type_code: first.condition_type_code || null,
        term_type: first.term_type,
        line_count: new Set(group.map((component) => component.source_line_id)).size,
        rate_value: rates.size === 1 && first.rate_value != null ? String(first.rate_value) : null,
        amount: String(group.reduce((sum, component) => sum + component.computed_amount, 0)),
        line_ids: [...new Set(group.flatMap((component) => component.source_line_id ? [component.source_line_id] : []))],
      };
    });
}

/**
 * Escapes a value for use inside an attribute selector. Uses native
 * CSS.escape where available (every supported browser) with a defensive
 * fallback that strips non-uuid chars — our pc ids are UUIDs in practice
 * so the fallback is also lossless.
 */
function cssEscape(value: string): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.CSS?.escape === "function") {
    return globalThis.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// ─── Apportionment summary fetch (v3.1 Phase 6) ───────────────────────

function isPurchaseInvoiceSourceDocType(sourceDocType: string): boolean {
  return sourceDocType.trim().toLowerCase() === "purchase_invoice_line";
}

import type { ApportionmentSummary } from "@athyper/content-ui";

/**
 * Fetches per-header-PC aggregates (line_count, override_count,
 * balance_gap, allocated_sum, computed_at) and indexes by pc_id. The
 * strip component reads from this map for its badges instead of
 * recomputing client-side on every render.
 *
 * Refetches whenever `invoiceId` changes or the page's lines/PC
 * collection finishes a refresh (driven by `childrenIsLoading` going
 * false → false again post-write). Errors are swallowed silently —
 * the strip falls back to client-computed totals on first paint.
 */
function useApportionmentSummaries(
  invoiceId:         string,
  childrenIsLoading: boolean,
  enabled:           boolean,
): Map<string, ApportionmentSummary> | undefined {
  const [map, setMap] = useState<Map<string, ApportionmentSummary> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setMap(undefined);
      return;
    }
    if (!invoiceId || childrenIsLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}/pricing-components/apportionment-summary`,
          { method: "GET", credentials: "include" },
        );
        if (!res.ok) return;
        const body = await res.json() as { summaries: ApportionmentSummary[] };
        if (cancelled) return;
        const next = new Map<string, ApportionmentSummary>();
        for (const summary of body.summaries) {
          next.set(summary.header_pc_id, summary);
        }
        setMap(next);
      } catch {
        // Swallow — strip falls back to client-computed totals.
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId, childrenIsLoading, enabled]);

  return map;
}

/**
 * Fetches line-scope rollup groups (v3.1 Phase 6b). Same lifecycle as
 * useApportionmentSummaries — refetches on invoice change + after the
 * children slice settles, swallows errors so the strip degrades to
 * "no rollups" rather than crashing on a transient network blip.
 */
function useLineRollups(
  invoiceId:         string,
  childrenIsLoading: boolean,
  enabled:           boolean,
): LineRollupGroup[] | undefined {
  const [rollups, setRollups] = useState<LineRollupGroup[] | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setRollups(undefined);
      return;
    }
    if (!invoiceId || childrenIsLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}/pricing-components/line-rollup`,
          { method: "GET", credentials: "include" },
        );
        if (!res.ok) return;
        const body = await res.json() as { rollups: LineRollupGroup[] };
        if (cancelled) return;
        setRollups(body.rollups);
      } catch {
        // Swallow — strip renders without rollups on transient failure.
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId, childrenIsLoading, enabled]);

  return rollups;
}
