import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createManualInvoiceLineAdapter,
  createCatalogAdapter,
  createOpenPoLineAdapter,
  createOpenReceiptLineAdapter,
  createOpenServiceSheetLineAdapter,
  type CatalogItemSelection,
  type OpenPoLineSelection,
  type OpenReceiptLineSelection,
  type OpenServiceSheetLineSelection,
} from "@athyper/runtime-line-item";
import {
  fetchCatalogItems,
  fetchOpenPoLines,
  fetchOpenReceiptLines,
  fetchOpenServiceSheetLines,
} from "@/lib/p2p-line-source-fetchers";

// ─────────────────────────────────────────────────────────────────────────────
// Source-adapter registry bootstrap for the neon app.
//
// Mounts five adapters at app boot. Adapter shape:
//   • manual_invoice_line     — direct_fill; always available
//   • catalog                  — overlay picker; live BFF call (empty until
//                                master.catalog_item lands; tenant-guarded server-side)
//   • open_po_line             — modal-select; live BFF call against
//                                /api/p2p/open-po-lines (tenant + lifecycle gated)
//   • open_receipt_line        — modal-select; live BFF call against
//                                /api/p2p/open-receipt-lines (posted GRNs only)
//   • open_service_sheet_line  — modal-select; live BFF call against
//                                /api/p2p/open-service-sheet-lines (posted SES only)
//
// Telemetry is wired to a console listener by default. Replace with the
// GlitchTip / Sentry bridge once the app's observability layer is ready.
//
// Backend wiring lives in
//   server/packages/services/records/routes/line-source.route.ts
// Test overrides can still inject custom fetchers via opts.fetchers.
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { env: { NODE_ENV: string } };

/** Default telemetry listener — logs in dev, no-op in prod. Apps replace this
 *  with a GlitchTip / Sentry bridge when the observability layer ships. */
function defaultTelemetryListener(event: AddItemTelemetryEvent): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[source-adapters]", event.type, event);
  }
}

export interface CreateNeonSourceAdaptersOptions {
  /** Override the telemetry listener (e.g. wire to GlitchTip in production). */
  telemetryListener?: (event: AddItemTelemetryEvent) => void;
  /** Override individual adapter fetchers for testing. */
  fetchers?: {
    catalog?: () => Promise<{ items: CatalogItemSelection[] }>;
    openPoLine?: () => Promise<{ items: OpenPoLineSelection[] }>;
    openReceiptLine?: () => Promise<{ items: OpenReceiptLineSelection[] }>;
    openServiceSheetLine?: () => Promise<{ items: OpenServiceSheetLineSelection[] }>;
  };
}

/**
 * Build a fresh registry + telemetry dispatcher. Call once per browser
 * session (or per server-side render) and pass the registry into
 * `<SourceAdapterRegistryProvider>` at the React tree root.
 */
export function createNeonSourceAdapters(
  opts: CreateNeonSourceAdaptersOptions = {},
): { registry: SourceAdapterRegistry; telemetry: TelemetryDispatcher } {
  const telemetry = new TelemetryDispatcher();
  telemetry.subscribe(opts.telemetryListener ?? defaultTelemetryListener);

  const registry = new SourceAdapterRegistry({ telemetry });

  // 1. Manual invoice line — direct_fill, always available.
  registry.register(createManualInvoiceLineAdapter());

  // 2. Catalog — overlay picker. Live BFF fetcher; server returns an empty
  //    page until master.catalog_item lands, so the picker still mounts.
  registry.register(
    createCatalogAdapter({
      fetchItems:
        opts.fetchers?.catalog ?? fetchCatalogItems,
    }),
  );

  // 3. Open PO line — modal-select picker. Calls /api/relay/p2p/open-po-lines.
  registry.register(
    createOpenPoLineAdapter({
      fetchLines:
        opts.fetchers?.openPoLine ?? fetchOpenPoLines,
    }),
  );

  // 4. Open receipt line — modal-select picker. Three-way matching against GRN.
  //    Posted receipts only; accepted_quantity > 0.
  registry.register(
    createOpenReceiptLineAdapter({
      fetchLines:
        opts.fetchers?.openReceiptLine ?? fetchOpenReceiptLines,
    }),
  );

  // 5. Open service sheet line — modal-select picker. Two-way matching for
  //    services (SES + Invoice). Posted SES only.
  registry.register(
    createOpenServiceSheetLineAdapter({
      fetchLines:
        opts.fetchers?.openServiceSheetLine ?? fetchOpenServiceSheetLines,
    }),
  );

  return { registry, telemetry };
}
