"use client";

/**
 * @athyper/runtime-canvas — polymorphic_pc_lines surface renderer.
 *
 * Cleanup Plan v5 §4.3 + §6.1 + amendments 2 + 6.
 *
 * Composes LineItemsSurface (runtime-line-item) with controlled-data
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LineItemsSurface } from "@athyper/runtime-line-item/surface";
import type {
  DocumentWorkspaceLineSubmit,
  LineFieldChangeResolver,
  LinePricingComponentLaunch,
  LineRecord,
} from "@athyper/runtime-line-item";
import type { DocumentEditRuntimeContract, MetaEntityLineItemsSurface } from "@athyper/runtime-contracts";
import type { AccountingDistribution } from "@athyper/api-contracts/documents";
import { flattenRuntimeRecord, normaliseCurrencyCode, type RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  AccountingDistributionDrawer,
  DiscountDrawer,
  PiLineDrawer,
  TaxDrawer,
  WhtDrawer,
  enrichComponentsWithConditionType,
  projectLine,
  projectPricingComponents,
  projectHeaderScopeProjections,
  deriveDistributableCost,
  projectAccountingDistributions,
  readPiStatus,
  resolveEditAffordance,
  useEditDraftContext,
  type AccountingDistributionDraft,
  type AccountingDistributionSplitDraft,
  type AccountingDistribution as AccountingDistributionProjected,
  type EditAffordance,
  type PcDraft,
  type PricingComponent,
} from "@athyper/content-ui";
import {
  createAccountingDistribution,
  deleteAccountingDistribution,
  replaceAccountingDistributions,
  updateAccountingDistribution,
} from "./accounting-distribution-actions";
import { useDocumentRuntimeContext } from "../document-runtime/document-runtime-context";
import { useOptionalDocumentEditCoordinator } from "../document-runtime/document-edit-coordinator";
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

export function PolymorphicPcLinesSurfaceRenderer({
  surface,
  contract,
  recordId,
  record,
}: RuntimeSurfaceRendererProps) {
  // Phase 2 — accept both legacy and generic kind names during the compatibility window.
  if (surface.kind !== "polymorphic_pc_lines" && surface.kind !== "document_lines") return null;
  const ctx = useDocumentRuntimeContext();
  const editCoordinator = useOptionalDocumentEditCoordinator();
  const lineResolveSeqRef = useRef(0);
  const lineResolveTabIdRef = useRef(createLineResolveTabId());
  // v3.1 Phase 5k — page-level edit gate. Without this, LineItemsSurface
  // sees editMode=true on every render and shows "+ Add Item" + per-row
  // edit/delete actions even when the user is in view mode (Edit button
  // visible on the document header). The session is null on pages that
  // don't mount EditDraftProvider; falls back to read-only.
  const editSession  = useEditDraftContext();
  const isPageEditing = editSession?.isEditing ?? false;

  // ── Synthesize a MetaEntityLineItemsSurface so LineItemsSurface can
  // mount unchanged. The line entity code comes from the descriptor
  // relation referenced by the surface config, with a legacy binding-code
  // fallback for older descriptors.
  // → line_entity_code resolution wires in when descriptor compile lands.
  const lineEntityCode = readLineEntityCode(surface, contract);
  const lineRelation = contract.relations.find((relation) =>
    relation.targetEntity === lineEntityCode
    && relation.mutationOwner === "workspace",
  );
  const workspaceCollection = editCoordinator?.contract.childCollections.find((collection) =>
    collection.entityCode === lineEntityCode
    || collection.relationName === lineRelation?.name,
  );
  const workspaceAvailable = Boolean(editCoordinator && lineRelation && workspaceCollection);
  const lineFieldChangeResolver = useCallback<LineFieldChangeResolver>(async (input) => {
    if (!workspaceAvailable || !editCoordinator || !lineEntityCode) return;
    const clientSeq = lineResolveSeqRef.current + 1;
    lineResolveSeqRef.current = clientSeq;
    const lineId = input.lineId ?? "new";
    const currentDraft = {
      ...input.draft,
      __documentEditScope: "line",
      __collectionKey: "items",
      __lineEntityCode: input.lineEntityCode,
      __lineId: lineId,
      __panelKey: input.panelKey ?? "",
      __mode: input.mode,
    };
    const response = await editCoordinator.resolveFieldChange({
      entityCode: editCoordinator.entityCode,
      recordId: editCoordinator.recordId,
      sourceField: input.fieldName,
      newValue: input.newValue,
      currentDraft,
      draftVersion: `line_${safeIdentifierToken(lineId)}_${clientSeq}`,
      sectionVersions: buildLineSectionVersionMap(editCoordinator.contract),
      tabId: lineResolveTabIdRef.current,
      clientSeq,
      idempotencyKey: createLineResolveIdempotencyKey(
        lineResolveTabIdRef.current,
        clientSeq,
        lineId,
        input.fieldName,
      ),
    });
    if (response.invalidations.length > 0) {
      await editCoordinator.applyInvalidations(response.invalidations, currentDraft);
    }
    return {
      accepted: response.accepted,
      patch: response.patch,
      clearedFields: response.clearedFields,
    };
  }, [editCoordinator, lineEntityCode, workspaceAvailable]);
  const submitWorkspaceChanges = useCallback<DocumentWorkspaceLineSubmit>(async (input) => {
    // This callback is passed to LineItemsSurface only when the coordinator
    // and its declared child collection are both available.
    if (!editCoordinator) return { etag: input.etag };
    const response = await editCoordinator.submitWorkspaceChanges({
      etag: input.etag,
      changes: { lines: input.lines },
    });
    return { etag: response.etag, record: response.record };
  }, [editCoordinator]);
  if (!lineEntityCode) {
    return (
      <div className="text-xs italic text-muted-foreground p-3 border border-dashed border-border rounded-md">
        polymorphic_pc_lines surface: cannot resolve line entity code from relation metadata.
      </div>
    );
  }

  // Surface upstream errors loud — without this banner the
  // `useDocumentChildren` failure (e.g. `RELATION_NOT_FOUND` because the
  // relation metadata seed didn't apply) is invisible:
  // LineItemsSurface renders "No records" and the user can't tell empty
  // data from a broken fetch.
  if (ctx.children.error) {
    return (
      <div
        data-document-runtime-surface="polymorphic_pc_lines_error"
        className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs"
      >
        <div className="font-medium text-destructive">Failed to load lines</div>
        <div className="text-muted-foreground mt-1">{ctx.children.error.message}</div>
        <div className="text-muted-foreground italic mt-2">
          Verify the entity relation seed (server/db/seed/platform/003_control/043_control_entity_relation_contract.sql)
          and filterability overrides (051_*) have applied to this database.
        </div>
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
    mutationOwner: "workspace",
    canCreate: lineRelation?.mutationPermissions.canCreate ?? false,
    canEdit:   lineRelation?.mutationPermissions.canEdit ?? false,
    canDelete: lineRelation?.mutationPermissions.canDelete ?? false,
    affectsTotals:     false,
    requiredForSubmit: false,
  };

  // Lines slice (raw RuntimeRecordRow → LineRecord cast); P2c rename
  // will tighten this contract.
  const lines = (ctx.children.lines as ReadonlyArray<RuntimeRecordRow>)
    .map((row) => withPricingProjectionFallbacks(flattenRuntimeRecord(row) as unknown as LineRecord));
  const distributions = (ctx.children.distributions.all as ReadonlyArray<RuntimeRecordRow>)
    .map((row) => flattenRuntimeRecord(row)) as unknown as AccountingDistribution[];
  const pricingComponents = (ctx.children.pricingComponents.all as ReadonlyArray<RuntimeRecordRow>)
    .map((row) => flattenRuntimeRecord(row));
  const chargeLookupCode = readSurfaceConfigString(
    surface.config,
    "charge_condition_type_lookup_code",
    DEFAULT_CHARGE_CONDITION_LOOKUP_CODE,
  );
  const discountLookupCode = readSurfaceConfigString(
    surface.config,
    "condition_type_lookup_code",
    DEFAULT_DISCOUNT_CONDITION_LOOKUP_CODE,
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
  // WS-D: WHT-specific lookups for line-scope drawer. Identical defaults
  // + override hooks as the header strip surface.
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
  const sourceDocType = readSurfaceConfigString(
    surface.config,
    "source_doc_type",
    DEFAULT_DOCUMENT_PRICING_SOURCE_DOC_TYPE,
  );
  const documentCurrencyCode = normaliseCurrencyCode(record?.["currency_code"])
    ?? normaliseCurrencyCode(ctx.record["currency_code"]);

  return (
    <div data-document-runtime-surface="polymorphic_pc_lines">
      <LineItemsSurface
        surface={synthesizedSurface}
        entityCode={contract.entityCode}
        recordId={recordId}
        record={record}
        currencyCode={documentCurrencyCode}
        editMode={isPageEditing && workspaceAvailable}
        controlledData={{
          lines,
          distributions,
          pricingComponents,
          isLoading: ctx.children.isLoading,
          error:     ctx.children.error,
          onRefresh: ctx.children.onRefresh,
        }}
        renderRowExpansion={(line: LineRecord, componentLaunch) => (
          <PiLineDrawerExpansion
            line={line}
            componentLaunch={componentLaunch}
            ctx={ctx}
            discountLookupCode={discountLookupCode}
            chargeLookupCode={chargeLookupCode}
            taxConditionLookupCode={taxConditionLookupCode}
            taxGroupLookupCode={taxGroupLookupCode}
            whtConditionLookupCode={whtConditionLookupCode}
            whtGroupLookupCode={whtGroupLookupCode}
            parentEntityCode={contract.entityCode}
            sourceDocType={sourceDocType}
          />
        )}
        lineFieldChangeResolver={workspaceAvailable ? lineFieldChangeResolver : undefined}
        submitWorkspaceChanges={workspaceAvailable ? submitWorkspaceChanges : undefined}
        selectionOperations={contract.operations}
      />
    </div>
  );
}

function withPricingProjectionFallbacks(line: LineRecord): LineRecord {
  const row = line as Record<string, unknown>;
  return {
    ...line,
    pricing_base_amount:        row["pricing_base_amount"] ?? row["net_amount"],
    pricing_discount_amount:    row["pricing_discount_amount"] ?? row["discount_amount"] ?? 0,
    pricing_charge_amount:      row["pricing_charge_amount"] ?? row["charge_amount"] ?? 0,
    pricing_net_amount:         row["pricing_net_amount"] ?? row["net_amount"],
    pricing_tax_amount:         row["pricing_tax_amount"] ?? row["tax_amount"] ?? 0,
    pricing_withholding_amount: row["pricing_withholding_amount"] ?? row["withholding_tax_amount"] ?? 0,
    pricing_total_amount:       row["pricing_total_amount"] ?? row["gross_amount"] ?? row["total_amount"] ?? row["net_amount"],
  } as LineRecord;
}

/**
 * Row drawer for a single document line. Reads per-line PC + AD slices from
 * DocumentRuntimeContext (single canonical line collection per
 * amendment 2) and mounts `PiLineDrawer` from `@athyper/content-ui`.
 *
 * Affordances are pinned to `read_only` for PR3. Write paths (add /
 * edit / delete component + distribution, supersede, audit) wire in
 * with the action-registry handlers later.
 */
function PiLineDrawerExpansion({
  line,
  componentLaunch,
  ctx,
  discountLookupCode,
  chargeLookupCode,
  taxConditionLookupCode,
  taxGroupLookupCode,
  whtConditionLookupCode,
  whtGroupLookupCode,
  parentEntityCode,
  sourceDocType,
}: {
  line: LineRecord;
  componentLaunch?: LinePricingComponentLaunch;
  ctx: ReturnType<typeof useDocumentRuntimeContext>;
  discountLookupCode: string;
  chargeLookupCode: string;
  taxConditionLookupCode: string;
  taxGroupLookupCode: string;
  whtConditionLookupCode: string;
  whtGroupLookupCode: string;
  parentEntityCode: string;
  sourceDocType: string;
}): ReactNode {
  const [discountDrawerOpen, setDiscountDrawerOpen] = useState(false);
  const [chargeDrawerOpen, setChargeDrawerOpen] = useState(false);
  const [taxDrawerOpen, setTaxDrawerOpen] = useState(false);
  const [whtDrawerOpen, setWhtDrawerOpen] = useState(false);
  // Component being replaced — set when the user clicks Edit/Replace on a
  // PC row. Drives the drawer's `mode` ("add" vs "replace") and pins the
  // `replacingComponent` so the drawer pre-fills + the supersede path
  // fires on submit. Cleared on drawer close or successful submit.
  const [editingComponent, setEditingComponent] = useState<PricingComponent | null>(null);
  // Accounting distribution drawer state — null editing target means
  // "Add new"; a row reference means "Edit existing". Cleared on close.
  const [adDrawerOpen, setAdDrawerOpen] = useState(false);
  const [editingDistribution, setEditingDistribution] = useState<AccountingDistributionProjected | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const lineFlat = flattenRuntimeRecord(line as unknown as RuntimeRecordRow);
  const lineId = String(lineFlat["id"] ?? "");
  useEffect(() => {
    if (!componentLaunch || !lineId) return;
    setEditingComponent(null);
    if (componentLaunch.kind === "discount") setDiscountDrawerOpen(true);
    else if (componentLaunch.kind === "charge") setChargeDrawerOpen(true);
    else if (componentLaunch.kind === "tax") setTaxDrawerOpen(true);
    else setWhtDrawerOpen(true);
  }, [componentLaunch?.requestId, componentLaunch?.kind, lineId]);
  if (!lineId) return null;

  const projectedLines = (ctx.children.lines as ReadonlyArray<RuntimeRecordRow>).map((row) =>
    projectLine(flattenRuntimeRecord(row)),
  );
  const projectedLine = projectLine(lineFlat);
  const projectedComponents = projectPricingComponents(
    ((ctx.children.pricingComponents.byLineId.get(lineId) ?? []) as ReadonlyArray<RuntimeRecordRow>)
      .map((row) => flattenRuntimeRecord(row)),
  );
  const distributionsForLine = projectAccountingDistributions(
    ((ctx.children.distributions.byLineId.get(lineId) ?? []) as ReadonlyArray<RuntimeRecordRow>)
      .map((row) => flattenRuntimeRecord(row)),
  );
  // Affordance is the AND of two gates (v3.1 Phase 5k):
  //   1. PI status allows mutation (pc-affordance-matrix)
  //   2. The page is in EDIT MODE (the "Editing" pill on the document
  //      header toggles session.isEditing). View mode → no Add/Edit/
  //      Delete affordances regardless of PI status.
  const editSession  = useEditDraftContext();
  const isPageEditing = editSession?.isEditing ?? false;
  const baseAffordance = resolveEditAffordance({
    status: readPiStatus(ctx.record["status"]),
    surface: "pc_line",
  });
  const componentAffordance: EditAffordance = isPageEditing
    ? baseAffordance
    : "read_only";
  const distributionAffordance: EditAffordance = isPageEditing ? baseAffordance : "read_only";
  const discountConditionTypes = toConditionTypeOptions(discountLookup.records);
  const chargeConditionTypes = toConditionTypeOptions(chargeLookup.records);
  const taxConditionTypes = toConditionTypeOptions(taxConditionLookup.records);
  const taxGroups = toTaxGroupOptions(taxGroupLookup.records);
  const whtConditionTypes = toConditionTypeOptions(whtConditionLookup.records);
  const whtGroups = toWhtGroupOptions(whtGroupLookup.records);
  // Records API doesn't hydrate condition_type_label/code on PC rows;
  // hydrate client-side using the same lookup data the add drawers
  // depend on, so the TERM column shows the real condition name
  // ("Commercial Discount") instead of falling back to "unnamed".
  // WS-D: include WHT condition types in the enrichment set so withholding
  // rows render with their proper name ("Withholding Tax") instead of
  // "unnamed".
  const componentsForLine = enrichComponentsWithConditionType(
    projectedComponents,
    [
      ...discountConditionTypes,
      ...chargeConditionTypes,
      ...taxConditionTypes,
      ...whtConditionTypes,
    ],
  );
  const headerScopeComponents = enrichComponentsWithConditionType(
    projectPricingComponents(
      (ctx.children.pricingComponents.headerScope as ReadonlyArray<RuntimeRecordRow>)
        .map((row) => flattenRuntimeRecord(row)),
    ),
    [
      ...discountConditionTypes,
      ...chargeConditionTypes,
      ...taxConditionTypes,
      ...whtConditionTypes,
    ],
  );
  const allLineScopeComponents = enrichComponentsWithConditionType(
    projectPricingComponents(
      Array.from(ctx.children.pricingComponents.byLineId.values())
        .flatMap((slice) => (slice as ReadonlyArray<RuntimeRecordRow>).map((row) => flattenRuntimeRecord(row))),
    ),
    [
      ...discountConditionTypes,
      ...chargeConditionTypes,
      ...taxConditionTypes,
      ...whtConditionTypes,
    ],
  );
  const appliedHeaderComponents = projectHeaderScopeProjections(
    headerScopeComponents,
    projectedLines,
    allLineScopeComponents,
  ).flatMap((projection) => {
    const allocation = projection.allocations.find((candidate) => candidate.line_id === lineId);
    if (!allocation) return [];
    const share = Number.isFinite(allocation.share) ? allocation.share : 0;
    return [{
      ...projection.component,
      id: `applied:${projection.component.id}:${lineId}`,
      entry_level: "line" as const,
      origin: "system_resolved" as const,
      source_line_id: lineId,
      is_apportioned: false,
      is_apportioned_from_id: projection.component.id,
      apportion_basis: null,
      base_for_calculation: projection.component.base_for_calculation != null
        ? projection.component.base_for_calculation * share
        : allocation.basis_value,
      computed_amount: allocation.allocated_amount,
      computed_base_amount: allocation.allocated_amount,
      metadata: {
        ...(projection.component.metadata ?? {}),
        applied_from_header: true,
        header_component_id: projection.component.id,
        allocation_share: allocation.share,
        allocation_basis_value: allocation.basis_value,
        allocation_overridden: allocation.overridden,
      },
    }];
  });
  const pricingContext = readDocumentPricingComponentContext(ctx.record, ctx.recordId, projectedLines);
  const canAddDiscount = componentAffordance === "edit" && discountConditionTypes.length > 0;
  const canAddCharge = componentAffordance === "edit" && chargeConditionTypes.length > 0;
  const canAddTax = componentAffordance === "edit" && taxConditionTypes.length > 0 && taxGroups.length > 0;
  // WS-D: data-driven gating identical to header strip surface.
  const canAddWht = componentAffordance === "edit" && whtConditionTypes.length > 0 && whtGroups.length > 0;

  async function submitComponent(input: { draft: PcDraft; replacingId?: string }) {
    try {
      setSaveError(null);
      const piStatus = readPiStatus(ctx.record["status"]);
      const isDraftEdit = input.replacingId
        && editingComponent
        && (piStatus === "draft" || piStatus === "rejected" || String(piStatus) === "proforma");

      if (isDraftEdit) {
        // Draft / rejected → in-place UPDATE. No v1 / v2 chain because
        // there's no audit obligation yet — the row has never been
        // approved. Avoids the confusing duplicate-row UX the user saw
        // with supersession in draft.
        await patchPricingComponentInPlace({
          parentId:    ctx.recordId,
          componentId: input.replacingId!,
          record:      ctx.record,
          lines:       projectedLines,
          draft:       input.draft,
          sourceDocType,
        });
      } else {
        // Add (no replacingId) OR Edit/Replace in approval-stream
        // statuses → supersession. expectedVersion is pulled from the
        // editingComponent snapshot so a concurrent edit returns 409.
        if (input.replacingId) {
          throw new Error("Pricing components are read-only unless the document is draft. Request revision before changing pricing.");
        }
        await postPricingComponentDraft({
          recordId: ctx.recordId,
          record: ctx.record,
          lines: projectedLines,
          draft: input.draft,
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

  function openEditFor(componentId: string) {
    const component = componentsForLine.find((c) => c.id === componentId);
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

  // ── Accounting distribution handlers ──────────────────────────────
  // The entity here is `purchase_invoice` (today the only document that
  // the AD CRUD route accepts — records.route.ts guards on this).
  function openAddDistribution() {
    setEditingDistribution(null);
    setAdDrawerOpen(true);
  }
  function openEditDistribution(adId: string) {
    const row = distributionsForLine.find((d) => d.id === adId);
    setEditingDistribution(row ?? null);
    setAdDrawerOpen(true);
  }
  async function handleDeleteDistribution(adId: string) {
    try {
      setSaveError(null);
      await deleteAccountingDistribution({
        entityCode: parentEntityCode,
        parentId:   ctx.recordId,
        lineId,
        distributionId: adId,
      });
      await ctx.children.onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
    }
  }
  async function submitDistribution(draft: AccountingDistributionDraft): Promise<void> {
    setSaveError(null);
    if (editingDistribution) {
      await updateAccountingDistribution({
        entityCode: parentEntityCode,
        parentId:   ctx.recordId,
        lineId,
        distributionId: editingDistribution.id,
        draft,
      });
    } else {
      await createAccountingDistribution({
        entityCode: parentEntityCode,
        parentId:   ctx.recordId,
        lineId,
        draft,
      });
    }
    await ctx.children.onRefresh();
  }
  async function replaceDistributions(drafts: AccountingDistributionSplitDraft[]): Promise<void> {
    setSaveError(null);
    await replaceAccountingDistributions({
      entityCode: parentEntityCode,
      parentId:   ctx.recordId,
      lineId,
      drafts,
    });
    await ctx.children.onRefresh();
  }
  function handleAdDrawerOpenChange(open: boolean) {
    setAdDrawerOpen(open);
    if (!open) setEditingDistribution(null);
  }

  return (
    <div className="px-3 py-3" data-document-runtime-surface="polymorphic_pc_lines_row_drawer">
      <PiLineDrawer
        line={projectedLine}
        appliedHeaderComponents={appliedHeaderComponents}
        components={componentsForLine}
        distributions={distributionsForLine}
        componentsAffordance={componentAffordance}
        distributionsAffordance={distributionAffordance}
        onAddComponent={canAddDiscount ? () => { setEditingComponent(null); setDiscountDrawerOpen(true); } : undefined}
        onAddChargeComponent={canAddCharge ? () => { setEditingComponent(null); setChargeDrawerOpen(true); } : undefined}
        onAddTaxComponent={canAddTax ? () => { setEditingComponent(null); setTaxDrawerOpen(true); } : undefined}
        onAddWhtComponent={canAddWht ? () => { setEditingComponent(null); setWhtDrawerOpen(true); } : undefined}
        onEditComponent={componentAffordance === "edit" ? openEditFor : undefined}
        onReplaceComponent={componentAffordance === "replace" ? openEditFor : undefined}
        onDeleteComponent={componentAffordance === "edit" ? (id) => { void handleDelete(id); } : undefined}
        onAddDistribution={distributionAffordance === "edit" ? openAddDistribution : undefined}
        onEditDistribution={(distributionAffordance === "edit" || distributionAffordance === "replace") ? openEditDistribution : undefined}
        onDeleteDistribution={distributionAffordance === "edit" ? (id) => { void handleDeleteDistribution(id); } : undefined}
        // v3.1 Phase 3: required. Thread from runtime context so the
        // ↗ chip on apportioned children scrolls + flashes the parent
        // row in the HeaderScopePcStrip surface. No-op when no strip
        // is registered (page rendered without it).
        onJumpToHeaderRow={ctx.jumpToHeaderRow}
      />
      {componentAffordance === "edit" && discountLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Discount lookup failed: {discountLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {componentAffordance === "edit" && chargeLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Charge lookup failed: {chargeLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {componentAffordance === "edit" && taxConditionLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Tax condition lookup failed: {taxConditionLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {componentAffordance === "edit" && taxGroupLookup.isError && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Tax group lookup failed: {taxGroupLookup.error?.message ?? "Unknown error"}
        </div>
      )}
      {componentAffordance === "edit" && !discountLookup.isLoading && !discountLookup.isError && discountConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active discount types are configured, so discounts cannot be added yet.
        </div>
      )}
      {componentAffordance === "edit" && !chargeLookup.isLoading && !chargeLookup.isError && chargeConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active charge types are configured, so charges cannot be added yet.
        </div>
      )}
      {componentAffordance === "edit" && !taxConditionLookup.isLoading && !taxConditionLookup.isError && taxConditionTypes.length === 0 && (
        <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No active tax condition types are configured, so tax cannot be added yet.
        </div>
      )}
      {componentAffordance === "edit" && !taxGroupLookup.isLoading && !taxGroupLookup.isError && taxGroups.length === 0 && (
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
        mode={editingComponent && editingComponent.term_type === "discount" ? (componentAffordance === "edit" ? "edit" : "replace") : "add"}
        termType="discount"
        open={discountDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setDiscountDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={projectedLines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        conditionTypes={discountConditionTypes}
        replacingComponent={editingComponent && editingComponent.term_type === "discount" ? editingComponent : undefined}
        initialApplyTo="one_item"
        initialLineId={projectedLine.id}
        onSubmit={submitComponent}
      />
      <DiscountDrawer
        mode={editingComponent && editingComponent.term_type === "charge" ? (componentAffordance === "edit" ? "edit" : "replace") : "add"}
        termType="charge"
        open={chargeDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setChargeDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={projectedLines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        conditionTypes={chargeConditionTypes}
        conditionTypeCapabilities={{ kindLabel: "Charge type" }}
        replacingComponent={editingComponent && editingComponent.term_type === "charge" ? editingComponent : undefined}
        initialApplyTo="one_item"
        initialLineId={projectedLine.id}
        onSubmit={submitComponent}
      />
      <TaxDrawer
        mode={editingComponent && editingComponent.term_type === "tax" ? (componentAffordance === "edit" ? "edit" : "replace") : "add"}
        open={taxDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setTaxDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={projectedLines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        taxGroups={taxGroups}
        conditionTypeId={taxConditionTypes[0]?.id}
        conditionTypeSequence={taxConditionTypes[0]?.default_sequence}
        derivedPlaceOfSupply="inter_state"
        replacingComponent={editingComponent && editingComponent.term_type === "tax" ? editingComponent : undefined}
        components={componentsForLine}
        initialApplyTo="one_item"
        initialLineId={projectedLine.id}
        onSubmit={submitComponent}
      />
      {/* WS-D: line-scope WHT drawer. */}
      <WhtDrawer
        mode={editingComponent && editingComponent.term_type === "withholding" ? (componentAffordance === "edit" ? "edit" : "replace") : "add"}
        open={whtDrawerOpen}
        onOpenChange={handleDrawerOpenChange(setWhtDrawerOpen)}
        piCode={pricingContext.piCode}
        piSupplierLabel={pricingContext.supplierLabel}
        piStatus={readPiStatus(ctx.record["status"])}
        lines={projectedLines}
        currencyCode={pricingContext.currencyCode}
        baseCurrencyCode={pricingContext.baseCurrencyCode}
        exchangeRate={pricingContext.exchangeRate}
        invoiceNetAmount={pricingContext.invoiceNetAmount}
        whtGroups={whtGroups}
        conditionTypeId={whtConditionTypes[0]?.id}
        conditionTypeSequence={whtConditionTypes[0]?.default_sequence ?? 400}
        replacingComponent={editingComponent && editingComponent.term_type === "withholding" ? editingComponent : undefined}
        components={componentsForLine}
        initialApplyTo="one_item"
        initialLineId={projectedLine.id}
        onSubmit={submitComponent}
      />
      {/* P1 — Accounting distribution drawer (Single mode only). */}
      <AccountingDistributionDrawer
        open={adDrawerOpen}
        onOpenChange={handleAdDrawerOpenChange}
        editing={editingDistribution}
        distributions={distributionsForLine}
        documentRecord={ctx.record}
        lineRecord={lineFlat}
        lineGrossAmount={projectedLine.gross_amount}
        distributionTargetAmount={deriveDistributableCost(projectedLine.net_amount, componentsForLine)}
        distributionTargetLabel="Distributable cost"
        lineCurrencyCode={pricingContext.currencyCode}
        lineSiteLabel={(lineFlat["site_id_label"] as string | null | undefined) ?? null}
        onSubmit={submitDistribution}
        onReplaceDistributions={replaceDistributions}
      />
    </div>
  );
}

function buildLineSectionVersionMap(contract: DocumentEditRuntimeContract): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const section of contract.sections) {
    if (section.versionRef) versions[section.key] = section.versionRef;
  }
  return versions;
}

function createLineResolveTabId(): string {
  return `line_tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLineResolveIdempotencyKey(
  tabId: string,
  clientSeq: number,
  lineId: string,
  fieldName: string,
): string {
  return `line_chg_${tabId}_${clientSeq}_${safeIdentifierToken(lineId)}_${safeIdentifierToken(fieldName)}`;
}

function safeIdentifierToken(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return safe.length > 0 ? safe.slice(0, 96) : "unknown";
}

function isPurchaseInvoiceSourceDocType(sourceDocType: string): boolean {
  return sourceDocType.trim().toLowerCase() === "purchase_invoice_line";
}

interface ContractLike {
  entityCode: string;
  relations?: ReadonlyArray<{ name: string; runtimeRole?: string; targetEntity: string }>;
  /** Optional display config that may carry line_entity_code. */
  extensions?: Record<string, unknown>;
}

function readLineEntityCode(
  surface: { config?: { relations?: { lines?: unknown }; line_binding_code?: unknown } },
  contract: ContractLike,
): string | null {
  // Future: resolve binding_code → child_entity_code via descriptor compile.
  // For now: read from config.line_binding_code as a string, OR fall back
  // to `<parent>_line` heuristic to match runtime-line-item defaults.
  const relationName = surface.config?.relations?.lines;
  if (typeof relationName === "string" && relationName.length > 0) {
    const relation = contract.relations?.find((candidate) =>
      candidate.name === relationName || candidate.runtimeRole === relationName,
    );
    if (relation?.targetEntity) return relation.targetEntity;
  }

  const fromConfig = surface.config?.line_binding_code;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    // binding_code convention is "<parent>__<child>"; split on "__".
    const childCode = fromConfig.split("__")[1];
    if (childCode) return childCode;
  }
  if (contract.entityCode) return `${contract.entityCode}_line`;
  return null;
}
