"use client";

/**
 * @athyper/runtime-canvas — Document side-car slot registry.
 *
 * Cleanup Plan v5 §4.4 + amendment 8.
 *
 * Maps slot keys (declared in `document_header.config.side_car_slots`)
 * to component renderers. PI registers `"payment_terms"` →
 * `<PaymentTermsCard …>` at app boot. Per amendment 4, payment_terms is
 * a SIDECAR, NOT a global surface kind.
 *
 * Same idempotency contract as the composer registry: same-reference
 * re-registration is a no-op; dev-mode warns on replacement; hard-
 * errors when descriptor seeds reference unregistered slots.
 */

import type { ReactNode } from "react";

declare const process: { env: { NODE_ENV: string } };

export type SidecarRenderer = (record: Record<string, unknown>) => ReactNode;

const sidecars = new Map<string, SidecarRenderer>();

export function registerSidecar(slotKey: string, renderer: SidecarRenderer): void {
  const existing = sidecars.get(slotKey);
  if (existing === renderer) return;
  if (existing && process.env.NODE_ENV === "development") {
    console.warn(`[sidecar-registry] replacing existing sidecar '${slotKey}'`);
  }
  sidecars.set(slotKey, renderer);
}

export function unregisterSidecar(slotKey: string): void {
  sidecars.delete(slotKey);
}

export function resolveSidecar(
  slotKey: string,
  opts: { isDescriptorSeeded: boolean } = { isDescriptorSeeded: true },
): SidecarRenderer | null {
  const found = sidecars.get(slotKey);
  if (found) return found;
  if (opts.isDescriptorSeeded) {
    throw new Error(
      `[sidecar-registry] descriptor references unregistered sidecar '${slotKey}'. `
      + `App boot must register it via registerSidecar('${slotKey}', …).`,
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(`[sidecar-registry] unknown sidecar '${slotKey}'; rendering nothing.`);
  }
  return null;
}

export function listMissingSidecars(seededKeys: ReadonlyArray<string>): string[] {
  return seededKeys.filter((key) => !sidecars.has(key));
}
