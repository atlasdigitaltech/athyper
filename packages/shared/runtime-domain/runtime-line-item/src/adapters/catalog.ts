import type {
  DraftLine,
  SourceAdapterManifest,
  SourceBinding,
  SourceSideEffect,
} from "@athyper/runtime-contracts";
import type {
  Page,
  SourceAdapter,
  SourceQuery,
  ValidationResult,
} from "@athyper/runtime-add-item";

// ─────────────────────────────────────────────────────────────────────────────
// catalog — second source adapter (Phase 6).
//
// Picks items from a supplier-published catalog (mesh.catalog / catalog_item).
// Unlike manual entry, the catalog adapter HAS a remote source: the picker
// renders an overlay-bound catalog browser, the user picks rows + chooses
// quantity, then commits.
//
// Surface model:
//   • Picker kind: `overlay` — bound to the parent document so the draft
//     stays mounted underneath. The (standalone) `page` kind is used when
//     the catalog is browsed outside a document; that variant is a separate
//     consumer concern, not a separate adapter.
//   • Selection shape: `id_qty_uom` — quantity + UOM are picker-supplied so
//     the controller carries them through to commit without a separate fill
//     stage.
//
// I/O policy:
//   The adapter takes a pluggable `fetchItems` so the backend wiring is an
//   app-level concern. `fetchItems` MUST honor the SourceQuery contract (q,
//   filters, sort, cursor, limit) and return a Page<CatalogItemSelection>.
//   Tests inject a stub; apps inject the real /api/catalog/items relay.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Catalog item selection — shape aligns with mesh.catalog_item +
 * mesh.catalog_price. `chosenQty` / `chosenUomCode` are picker-only fields
 * filled by the consumer before the controller calls `toDraftShape`.
 */
export interface CatalogItemSelection extends Record<string, unknown> {
  /** Catalog item primary key (mesh.catalog_item.id). */
  itemId: string;
  /** Parent catalog code so the binding records the source catalog. */
  catalogCode: string;
  /** Stable supplier-facing item code (mesh.catalog_item.item_code). */
  itemCode: string;
  /** Human-readable item name. */
  itemName: string;
  /** Optional long description. */
  description?: string;
  /** Default UOM the catalog publishes the item under. */
  baseUomCode: string;
  /** Optional manufacturer name. */
  manufacturerName?: string;
  /** Live unit price in `currencyCode`. */
  unitPrice: number;
  /** ISO currency code (mesh.catalog_price.currency_code). */
  currencyCode: string;
  /** Whether the item is currently active. Inactive items are still
   *  returnable by fetch (for stale-revalidation), but the picker filters
   *  by default. */
  isActive?: boolean;

  // Picker-supplied selection inputs ─────────────────────────────────────
  /** Quantity the user typed in the picker. */
  chosenQty?: number;
  /** UOM the user chose (may differ from baseUomCode). */
  chosenUomCode?: string;
}

/**
 * Catalog draft line — flattens selection into top-level line fields plus
 * sourceBinding. Field names match the conventional invoice line shape so
 * the existing composer / persistence code reads it without translation.
 */
export interface CatalogDraft extends DraftLine {
  itemId: string;
  itemCode: string;
  description: string;
  quantity: number;
  uomCode: string;
  unitPrice: number;
  lineAmount: number;
  currencyCode: string;
}

export interface CatalogParentCtx extends Record<string, unknown> {
  parentEntityCode: string;
  parentRecordId: string;
  lineEntityCode: string;
  /** Parent document currency. Used to flag cross-currency picks. */
  currencyCode?: string;
}

/** Fetcher contract — apps inject the real backend wiring here. */
export type CatalogFetchItems = (
  query: SourceQuery,
  parentCtx: CatalogParentCtx,
) => Promise<Page<CatalogItemSelection>>;

/**
 * Optional staleness check — apps inject a fresh-fetch by item id so the
 * adapter can compare live state to the staged selection. Defaults to
 * `ok: true` (no remote check) when omitted; consumers that omit it
 * effectively disable staleness for catalog lines.
 */
export type CatalogCheckLive = (
  itemId: string,
  parentCtx: CatalogParentCtx,
) => Promise<CatalogItemSelection | null>;

export interface CreateCatalogAdapterOptions {
  fetchItems: CatalogFetchItems;
  /**
   * Optional staleness re-check. When omitted, `isStillValid` always
   * returns ok (catalog items rarely change but apps that care about
   * mid-session price drift can opt in here).
   */
  checkLive?: CatalogCheckLive;
  /**
   * Permission code gating picker visibility. Defaults to
   * "INVOICE.LINE.ADD_FROM_CATALOG"; apps may pass undefined to surface the
   * picker unconditionally.
   */
  permissionCode?: string | undefined;
  /**
   * Maximum allowed unit-price drift before isStillValid flags the line as
   * stale. Expressed as fraction (0.05 = 5%). Defaults to 0.10 (10%).
   */
  staleUnitPriceTolerance?: number;
}

const DEFAULT_STALE_TOLERANCE = 0.1;

function buildManifest(opts: CreateCatalogAdapterOptions): SourceAdapterManifest {
  return {
    id: "catalog",
    version: 1,
    minFrameworkVersion: 1,
    label: "Add from catalog",
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_CATALOG",
    entry: "picker",
    picker: {
      kind: "overlay",
      columns: [
        { key: "itemCode",   label: "Code",         kind: "text",     sortable: true,  filterable: true },
        { key: "itemName",   label: "Item",         kind: "text",     sortable: true,  filterable: true },
        { key: "baseUomCode", label: "UOM",         kind: "text",     sortable: false, filterable: false },
        { key: "unitPrice",  label: "Price",        kind: "money",    sortable: true,  filterable: false },
        { key: "manufacturerName", label: "Maker",  kind: "text",     sortable: false, filterable: true },
      ],
      filters: [
        { key: "catalogCode", label: "Catalog",     control: "select", required: false },
        { key: "isActive",    label: "Active only", control: "select", required: false, defaultValue: true },
      ],
      search: { enabled: true, placeholder: "Search by code, name, or maker" },
      defaultSort: { field: "itemCode", direction: "asc" },
    },
    cacheStrategy: "stale-while-revalidate",
    stalenessStrategy: "warn",
    selectionShape: {
      kind: "id_qty_uom",
      idField: "itemId",
      qtyField: "chosenQty",
      uomField: "chosenUomCode",
    },
    dedupeKeys: ["itemId", "uomCode"],
    fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
  };
}

/**
 * Factory for the catalog source adapter. Apps wire the catalog API at
 * boot:
 *
 *   registry.register(createCatalogAdapter({
 *     fetchItems: (query) => relayFetch("/api/catalog/items", { query }),
 *     checkLive: (id)    => relayFetch(`/api/catalog/items/${id}`),
 *   }));
 */
export function createCatalogAdapter(
  opts: CreateCatalogAdapterOptions,
): SourceAdapter<CatalogItemSelection, CatalogDraft, CatalogParentCtx> {
  const manifest = buildManifest(opts);
  const tolerance = opts.staleUnitPriceTolerance ?? DEFAULT_STALE_TOLERANCE;
  return {
    manifest,

    async fetch(query, ctx) {
      return opts.fetchItems(query, ctx);
    },

    toDraftShape(selection, ctx): CatalogDraft {
      const qty = selection.chosenQty ?? 1;
      const uomCode = selection.chosenUomCode ?? selection.baseUomCode;
      const binding: SourceBinding = {
        sourceType: manifest.id,
        sourceDocType: "catalog",
        sourceDocId: selection.catalogCode,
        sourceLineId: selection.itemId,
        sourceRef: {
          itemCode: selection.itemCode,
          baseUomCode: selection.baseUomCode,
          chosenUomCode: uomCode,
          unitPriceAtSelection: selection.unitPrice,
          currencyAtSelection: selection.currencyCode,
        },
      };
      return {
        itemId: selection.itemId,
        itemCode: selection.itemCode,
        description: selection.description ?? selection.itemName,
        quantity: qty,
        uomCode,
        unitPrice: selection.unitPrice,
        lineAmount: qty * selection.unitPrice,
        currencyCode: selection.currencyCode,
        sourceBinding: binding,
      };
    },

    async resolveDefaults(draft) {
      // No async tax/account resolution yet (no backend endpoints).
      // Apps that need these can wrap the adapter and call their own
      // resolver here.
      return draft;
    },

    applyParentContext(draft, ctx) {
      // Currency mismatch: leave the line as-is but record the mismatch in
      // sourceBinding.sourceRef so downstream consumers can surface a
      // warning / trigger conversion. No FX conversion at this layer.
      if (ctx.currencyCode && draft.currencyCode !== ctx.currencyCode) {
        return {
          ...draft,
          sourceBinding: {
            ...draft.sourceBinding,
            sourceRef: {
              ...(draft.sourceBinding.sourceRef ?? {}),
              parentCurrency: ctx.currencyCode,
              currencyMismatch: true,
            },
          },
        };
      }
      return draft;
    },

    validateSelection(selection): ValidationResult {
      const issues: { message: string }[] = [];
      const qty = selection.chosenQty ?? 0;
      if (qty <= 0) issues.push({ message: "Quantity must be greater than zero" });
      if (selection.unitPrice < 0) issues.push({ message: "Unit price must be non-negative" });
      if (selection.isActive === false) issues.push({ message: "Item is inactive in the catalog" });
      return issues.length > 0 ? { ok: false, issues } : { ok: true };
    },

    async isStillValid(stagedLine, ctx): Promise<ValidationResult> {
      if (!opts.checkLive) return { ok: true };
      const live = await opts.checkLive(stagedLine.itemId, ctx);
      if (!live) {
        return { ok: false, issues: [{ message: "Catalog item no longer exists" }] };
      }
      if (live.isActive === false) {
        return { ok: false, issues: [{ message: "Catalog item was deactivated" }] };
      }
      if (live.unitPrice <= 0) {
        return { ok: false, issues: [{ message: "Catalog item has no current price" }] };
      }
      const stagedPrice = stagedLine.unitPrice;
      const drift = Math.abs(live.unitPrice - stagedPrice) / Math.max(stagedPrice, 1);
      if (drift > tolerance) {
        return {
          ok: false,
          issues: [
            {
              message:
                `Unit price changed since selection: ${stagedPrice} -> ${live.unitPrice} ` +
                `(drift ${(drift * 100).toFixed(1)}% > ${(tolerance * 100).toFixed(0)}%)`,
            },
          ],
        };
      }
      return { ok: true };
    },

    dedupeKey(line): string {
      return `${line.itemId}:${line.uomCode}`;
    },

    onCommitSideEffects(line): SourceSideEffect[] {
      return [
        {
          kind: "emit_event",
          eventType: "invoice.catalog_line_added",
          payload: {
            itemId: line.itemId,
            itemCode: line.itemCode,
            catalogCode: line.sourceBinding.sourceDocId,
            quantity: line.quantity,
            uomCode: line.uomCode,
            unitPrice: line.unitPrice,
          },
        },
      ];
    },
  };
}
