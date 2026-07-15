"use client";

/**
 * @athyper/runtime-canvas — useDocumentComponentsController
 *
 * Phase 2b convenience wrapper around the parameterized pricing-component
 * helpers in `surfaces/pricing-component-actions.ts`. Both the header
 * Components strip and the per-line drawer consume the same write paths;
 * this hook bundles their lookup loading and pre-binds `sourceDocType`
 * so the call sites read as one operation instead of six.
 *
 * Scope: this is an *additive* convenience layer. The existing
 * polymorphic-pc-lines / header-scope-pc-strip surfaces keep their own
 * state machinery during the compatibility window; future docs
 * (PO, Supplier Payment) adopt this hook from day one.
 */

import { useCallback } from "react";
import type { PcDraft, PurchaseInvoiceLine } from "@athyper/content-ui";
import { useDocumentLookup, type DocumentLookupResult } from "./use-document-lookup";
import {
  deletePricingComponent,
  patchPricingComponentInPlace,
  postPricingComponentDraft,
  DEFAULT_PI_SOURCE_DOC_TYPE,
} from "../surfaces/pricing-component-actions";

// ─── Public types ────────────────────────────────────────────────────

export interface DocumentComponentLookupCodes {
  discount:  string;
  charge:    string;
  tax:       string;
  tax_group: string;
  wht:       string;
  wht_group: string;
}

export interface UseDocumentComponentsControllerOptions {
  /** Identifier of the parent line entity (e.g. "PURCHASE_INVOICE_LINE"). */
  sourceDocType?: string;
  /** Per-document lookup codes for the four drawer pickers. */
  lookups: DocumentComponentLookupCodes;
  /** Defer the lookup fetches until the caller is ready (e.g. record loaded). */
  enabled?: boolean;
}

export interface DocumentComponentsControllerResult {
  lookups: {
    discount:     DocumentLookupResult;
    charge:       DocumentLookupResult;
    tax:          DocumentLookupResult;
    tax_group:    DocumentLookupResult;
    wht:          DocumentLookupResult;
    wht_group:    DocumentLookupResult;
  };
  /** Save a pricing_component row while the parent document is editable. */
  submit: (input: {
    parentId: string;
    record: Record<string, unknown>;
    lines: ReadonlyArray<PurchaseInvoiceLine>;
    draft: PcDraft;
    replace?: { id: string; expectedVersion?: string | number } | null;
    /** Compatibility alias. Prefer replace. */
    supersede?: { id: string; expectedVersion?: string | number } | null;
  }) => Promise<void>;
  /** In-place PATCH of an existing pricing_component row (draft-only). */
  patchInPlace: (input: {
    parentId: string;
    componentId: string;
    record: Record<string, unknown>;
    lines: ReadonlyArray<PurchaseInvoiceLine>;
    draft: PcDraft;
  }) => Promise<void>;
  /** Delete an existing pricing_component row (draft-only). */
  remove: (input: { parentId: string; componentId: string }) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDocumentComponentsController(
  opts: UseDocumentComponentsControllerOptions,
): DocumentComponentsControllerResult {
  const sourceDocType = opts.sourceDocType ?? DEFAULT_PI_SOURCE_DOC_TYPE;
  const enabled = opts.enabled ?? true;

  const discount  = useDocumentLookup({ lookupCode: opts.lookups.discount,  enabled });
  const charge    = useDocumentLookup({ lookupCode: opts.lookups.charge,    enabled });
  const tax       = useDocumentLookup({ lookupCode: opts.lookups.tax,       enabled });
  const tax_group = useDocumentLookup({ lookupCode: opts.lookups.tax_group, enabled });
  const wht       = useDocumentLookup({ lookupCode: opts.lookups.wht,       enabled });
  const wht_group = useDocumentLookup({ lookupCode: opts.lookups.wht_group, enabled });

  const submit = useCallback(async (input: {
    parentId: string;
    record: Record<string, unknown>;
    lines: ReadonlyArray<PurchaseInvoiceLine>;
    draft: PcDraft;
    replace?: { id: string; expectedVersion?: string | number } | null;
    supersede?: { id: string; expectedVersion?: string | number } | null;
  }) => {
    await postPricingComponentDraft({
      recordId: input.parentId,
      record:   input.record,
      lines:    input.lines,
      draft:    input.draft,
      replace:  input.replace ?? input.supersede ?? null,
      sourceDocType,
    });
  }, [sourceDocType]);

  const patchInPlace = useCallback(async (input: {
    parentId: string;
    componentId: string;
    record: Record<string, unknown>;
    lines: ReadonlyArray<PurchaseInvoiceLine>;
    draft: PcDraft;
  }) => {
    await patchPricingComponentInPlace({
      parentId:    input.parentId,
      componentId: input.componentId,
      record:      input.record,
      lines:       input.lines,
      draft:       input.draft,
      sourceDocType,
    });
  }, [sourceDocType]);

  const remove = useCallback(async (input: { parentId: string; componentId: string }) => {
    await deletePricingComponent({
      parentId:    input.parentId,
      componentId: input.componentId,
      sourceDocType,
    });
  }, [sourceDocType]);

  return {
    lookups: { discount, charge, tax, tax_group, wht, wht_group },
    submit,
    patchInPlace,
    remove,
  };
}
