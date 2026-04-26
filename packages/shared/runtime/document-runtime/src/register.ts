/**
 * registerDocumentRenderers — boot-time lines renderer registration.
 *
 * Call this ONCE at app startup (e.g. in apps/web/app/layout.tsx or the
 * equivalent root layout) before any ApprovableDetailPage mounts.
 *
 * Why here: document-runtime (Layer 4) owns the concrete renderer components.
 * Entity-runtime (Layer 3) owns the registry API but cannot import Layer-4
 * components directly. This function is the bridge called from app-layer code
 * that depends on both packages.
 *
 * Registry lives in runtime-shared (Layer 2) so there is no circular dep.
 */

import { registerLinesRenderer } from "@athyper/runtime-shared/renderer-registry";
import { LinesGrid } from "./items/LinesGrid";
import { JournalLinesGrid } from "./items/JournalLinesGrid";
import { PaymentAllocationLinesGrid } from "./items/PaymentAllocationLinesGrid";

export function registerDocumentRenderers(): void {
  registerLinesRenderer("generic",  LinesGrid);
  registerLinesRenderer("journal",  JournalLinesGrid);
  registerLinesRenderer("payment",  PaymentAllocationLinesGrid);
}
