"use client";

/**
 * @athyper/runtime-canvas — document_header surface renderer.
 *
 * Cleanup Plan v5 §4.2 + §6.1.
 *
 * Reads `header_composer_code` from the surface config and resolves to
 * a registered composer (amendment 4 — no shape-matching heuristics).
 * Composer returns slot ReactNodes; this renderer mounts them in the
 * generic DocumentHeaderShell layout.
 *
 * Toolbar actions come from the aggregated `toolbarActions` map on the
 * DocumentRuntimeContext, NOT from this surface's config alone
 * (amendment 3 — declarative aggregation across all surfaces).
 *
 * Side-car slots resolve via the sidecar registry.
 */

import { resolveHeaderComposer } from "../document-runtime/composer-registry";
import { resolveSidecar } from "../document-runtime/sidecar-registry";
import { useOptionalDocumentRuntimeContext } from "../document-runtime/DocumentRuntimeContext";
import type { RuntimeSurfaceRendererProps } from "./types";

export function DocumentHeaderSurfaceRenderer({ surface, record }: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "document_header") return null;
  const ctx = useOptionalDocumentRuntimeContext();

  // Surface config carries the composer code + slot keys + amount fields.
  const composerCode  = surface.config.header_composer_code;
  const amountFields  = surface.config.amount_summary_fields ?? [];
  const sideCarSlots  = surface.config.side_car_slots ?? [];

  // Hard-error path: descriptor seeded → composer MUST be registered.
  const composer = resolveHeaderComposer(composerCode, { isDescriptorSeeded: true });
  if (!composer) return null; // unreachable; resolveHeaderComposer throws

  const slots = composer({
    record: (record ?? {}) as Record<string, unknown>,
    amountSummaryFields: amountFields,
    toolbarActions: ctx ? [...ctx.toolbarActions.values()] : [],
    sideCarSlots,
    renderSideCar: (slotKey) => {
      const sidecar = resolveSidecar(slotKey, { isDescriptorSeeded: true });
      return sidecar ? sidecar((record ?? {}) as Record<string, unknown>) : null;
    },
    onAction: (actionCode) => { ctx?.dispatchAction(actionCode); },
  });

  return (
    <div data-document-runtime-surface="document_header" className="flex flex-col gap-2 p-4 border border-border rounded-md bg-card">
      {slots.identitySlot}
      {slots.statusSlot}
      {slots.amountSummarySlot}
      {slots.toolbarSlot}
      {slots.sideCarSlot}
    </div>
  );
}
