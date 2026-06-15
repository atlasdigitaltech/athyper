"use client";

/**
 * @athyper/content-ui/purchase-invoice — Purchase Invoice composer.
 *
 * Cleanup Plan v5 §4.4 + §5.4 + §5.11.
 *
 * Registers as `purchase_invoice` in the runtime-canvas composer
 * registry. The `document_header` surface renderer resolves the
 * registered code and calls this composer with descriptor-config-
 * derived inputs.
 *
 * The output shape is `{ identitySlot, statusSlot, amountSummarySlot,
 * toolbarSlot, sideCarSlot }`. The composer maps the surface inputs
 * into the existing `PurchaseInvoiceHeader` component for now —
 * future iterations may decompose the header into discrete pieces,
 * but the current shape ships PI through the new surface kind without
 * losing fidelity.
 */

import { createElement, type ReactNode } from "react";
import { PiHeader, type PiHeaderAction } from "../document-components/header/PiHeader";
import { projectHeader } from "./projections";

interface ComposerInput {
  record:              Record<string, unknown>;
  amountSummaryFields: ReadonlyArray<unknown>; // structural — we render via PiHeader
  toolbarActions:      ReadonlyArray<{ code: string; label: string; placement?: string }>;
  sideCarSlots:        ReadonlyArray<string>;
  renderSideCar:       (slotKey: string) => ReactNode;
  onAction:            (actionCode: string) => void;
}

interface ComposerOutput {
  identitySlot:       ReactNode;
  statusSlot?:        ReactNode;
  amountSummarySlot?: ReactNode;
  toolbarSlot?:       ReactNode;
  sideCarSlot?:       ReactNode;
}

/**
 * Composer entry point. Registered with code "purchase_invoice" at
 * app boot (see `apps/neon/lib/bootstrap-document-runtime.ts`).
 */
export function buildPurchaseInvoiceHeaderProps(input: ComposerInput): ComposerOutput {
  const recordId = String(input.record["id"] ?? "");
  const header = projectHeader(input.record, recordId);

  // Map surface-config-derived toolbar actions into PiHeader's action shape.
  const actions: PiHeaderAction[] = input.toolbarActions.map((a) => ({
    action:  a.code,
    label:   a.label,
    variant: "default",
  }));

  // Resolve side-car slots → rendered nodes. PI's first sidecar is
  // payment_terms (registered separately).
  const sideCarSlot: ReactNode | undefined = input.sideCarSlots.length > 0
    ? createElement(
        "div",
        { className: "flex flex-col gap-2" },
        ...input.sideCarSlots.map((key) => input.renderSideCar(key)),
      )
    : undefined;

  // Build the PiHeader element. PiHeader internally lays out identity,
  // status, amount summary, match badges, and toolbar — so we route
  // everything through its `identitySlot` slot for now and leave the
  // other composer slots null. Future decomposition can split PiHeader
  // into discrete components keyed per slot.
  const identitySlot = createElement(PiHeader, {
    header,
    snapshotsFrozen:        header.status !== "draft" && header.status !== "rejected",
    snapshotsFrozenAt:      typeof input.record["status_changed_at"] === "string"
      ? input.record["status_changed_at"] as string
      : null,
    actions,
    onAction:               input.onAction,
    // Canonical action code: matches the seed in
    // apps/neon/lib/server/pi-document-runtime-surfaces.ts and the
    // subscription wired in postings-preview-surface.tsx. PR4/F5 normalize.
    onOpenPostingsPreview:  () => input.onAction("preview_postings"),
    paymentTermsSlot:       sideCarSlot,
  });

  return {
    identitySlot,
  };
}
