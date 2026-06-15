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
} from "@athyper/line-item-runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Source-adapter registry bootstrap for the neon app.
//
// Mounts five adapters at app boot. Adapter shape:
//   • manual_invoice_line — direct_fill; always available
//   • catalog              — overlay picker; stub fetcher until backend route lands
//   • open_po_line         — modal-select; stub fetcher until backend route lands
//   • open_receipt_line    — modal-select; stub fetcher until backend route lands
//   • open_service_sheet_line — modal-select; stub fetcher until backend route lands
//
// Telemetry is wired to a console listener by default. Replace with the
// GlitchTip / Sentry bridge once the app's observability layer is ready.
//
// Backend wiring: each picker adapter takes a `fetchItems` / `fetchLines`
// callback. Today these return empty pages — the dropdown surfaces the
// adapter, but the picker UI shows "no results". When the corresponding
// /api/* routes ship, swap the stubs for real relay calls.
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

  // 2. Catalog — overlay picker. Stub fetcher until /api/catalog/items lands.
  registry.register(
    createCatalogAdapter({
      fetchItems:
        opts.fetchers?.catalog ?? (async () => ({ items: [] })),
    }),
  );

  // 3. Open PO line — modal-select picker.
  registry.register(
    createOpenPoLineAdapter({
      fetchLines:
        opts.fetchers?.openPoLine ?? (async () => ({ items: [] })),
    }),
  );

  // 4. Open receipt line — modal-select picker. Three-way matching against GRN.
  registry.register(
    createOpenReceiptLineAdapter({
      fetchLines:
        opts.fetchers?.openReceiptLine ?? (async () => ({ items: [] })),
    }),
  );

  // 5. Open service sheet line — modal-select picker. Three-way matching against SES.
  registry.register(
    createOpenServiceSheetLineAdapter({
      fetchLines:
        opts.fetchers?.openServiceSheetLine ?? (async () => ({ items: [] })),
    }),
  );

  return { registry, telemetry };
}
