"use client";

/**
 * @athyper/runtime-canvas — Document header composer registry.
 *
 * Cleanup Plan v5 §4.2 + amendment 8 (idempotent, SSR/HMR-safe).
 *
 * Resolves `header_composer_code` (from the descriptor's `document_header`
 * surface config) to a registered composer function that produces the
 * `DocumentHeaderShell` slot props (identitySlot, statusSlot,
 * amountSummarySlot, toolbarSlot, sideCarSlot).
 *
 * Hard-errors when a descriptor-seeded code isn't registered. Soft-warns
 * for experimental/unknown codes (fallback to generic shell).
 */

import type { ReactNode } from "react";
import type { AmountSummaryField, SurfaceToolbarAction } from "@athyper/runtime-contracts";

declare const process: { env: { NODE_ENV: string } };

// ─── Public types ────────────────────────────────────────────────────

/**
 * Generic slot props the renderer passes to a composer. The composer
 * returns slot ReactNodes that the DocumentHeaderShell mounts.
 */
export interface DocumentHeaderComposerInput {
  /** Flattened parent record. */
  record:                Record<string, unknown>;
  /** Effective amount-summary fields from the surface config. */
  amountSummaryFields:   ReadonlyArray<AmountSummaryField>;
  /** Aggregated toolbar actions across all surfaces. */
  toolbarActions:        ReadonlyArray<SurfaceToolbarAction>;
  /** Side-car slot keys requested by the surface config. */
  sideCarSlots:          ReadonlyArray<string>;
  /** Renderer for a side-car slot (provider injects via sidecar-registry). */
  renderSideCar:         (slotKey: string) => ReactNode;
  /** Callback when the user activates a toolbar action. */
  onAction:              (actionCode: string) => void;
}

export interface DocumentHeaderComposerOutput {
  identitySlot:        ReactNode;
  statusSlot?:         ReactNode;
  amountSummarySlot?:  ReactNode;
  toolbarSlot?:        ReactNode;
  sideCarSlot?:        ReactNode;
}

export type DocumentHeaderComposer = (input: DocumentHeaderComposerInput) => DocumentHeaderComposerOutput;

// ─── Registry (module-level Map; idempotent + HMR-safe) ──────────────

const composers = new Map<string, DocumentHeaderComposer>();

/**
 * Register a composer for a code. Same-module re-registration is a
 * no-op (HMR safety). Replacement with a different reference logs in
 * development so authors notice unintended overrides.
 */
export function registerHeaderComposer(code: string, composer: DocumentHeaderComposer): void {
  const existing = composers.get(code);
  if (existing === composer) return;
  if (existing && process.env.NODE_ENV === "development") {
    console.warn(
      `[composer-registry] replacing existing composer '${code}' `
      + `(HMR or duplicate registration?)`,
    );
  }
  composers.set(code, composer);
}

export function unregisterHeaderComposer(code: string): void {
  composers.delete(code);
}

/**
 * Returns the registered composer for `code`, or `null` if missing.
 *
 * When `isDescriptorSeeded=true` (the typical production path — code
 * came from `control.entity_surface.config.header_composer_code`),
 * we THROW because that's a misconfiguration the user can't recover
 * from at runtime: the descriptor declared a composer that the app
 * boot never registered. Better fail loud than silently render a
 * generic shell that hides the bug.
 *
 * When `isDescriptorSeeded=false` (uncommon — should generally not
 * be set unless we know the code is experimental), we warn in dev
 * and return null so the caller can fall back to a generic shell.
 */
export function resolveHeaderComposer(
  code: string,
  opts: { isDescriptorSeeded: boolean } = { isDescriptorSeeded: true },
): DocumentHeaderComposer | null {
  const found = composers.get(code);
  if (found) return found;
  if (opts.isDescriptorSeeded) {
    throw new Error(
      `[composer-registry] descriptor references unregistered composer '${code}'. `
      + `Did app boot run? Sprint 5 P5b expects a registerHeaderComposer('${code}', …) `
      + `call before the first document page renders.`,
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[composer-registry] unknown composer '${code}'; falling back to generic shell.`,
    );
  }
  return null;
}

/**
 * Boot-time validator. Pass the set of header_composer_code values
 * collected from descriptor surfaces; this returns the codes that
 * are missing from the registry so the app can fail-fast.
 */
export function listMissingHeaderComposers(seededCodes: ReadonlyArray<string>): string[] {
  return seededCodes.filter((code) => !composers.has(code));
}
