import type {
  DraftLine,
  SourceAdapterManifest,
  SourceBinding,
  SourceSideEffect,
} from "@athyper/runtime-contracts";
import type {
  Page,
  SourceAdapter,
  ValidationResult,
} from "@athyper/runtime-add-item";

// ─────────────────────────────────────────────────────────────────────────────
// manual_invoice_line — first real SourceAdapter (Phase 5+).
//
// Manual entry has no remote source: the "selection" is the user typing into
// the existing line composer sheet. The adapter still implements the full
// SourceAdapter contract so the controller pipeline (validate → stage →
// commit) and the audit invariant (every committed line carries a
// sourceBinding) apply uniformly.
//
// Entry mode: `direct_fill`. The framework (Phase 7+ schema field) treats
// this as "no picker; the consumer skips openPicker and stages the line
// directly once the composer commits". The manifest's `picker` field is
// omitted entirely.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selection shape for manual entry — the composer hands a draft payload
 * keyed by line-entity field names. The minimal selection is just an id
 * (generated client-side) plus whatever fields the user typed.
 */
export interface ManualInvoiceLineSelection extends Record<string, unknown> {
  /** Synthetic id, usually `draft-${Date.now()}`. */
  draftId: string;
  /** The raw composer payload. Stored under a single field so it survives
   *  through toDraftShape without enumeration. */
  payload: Record<string, unknown>;
}

/**
 * Draft shape — flattens payload into top-level fields plus sourceBinding.
 * Consumers can read draft fields directly without unpacking `payload`.
 */
export interface ManualInvoiceLineDraft extends DraftLine {
  draftId: string;
  // sourceBinding inherited from DraftLine
  // [field]: unknown — composer fields spread to top-level
}

export interface ManualInvoiceLineParentCtx extends Record<string, unknown> {
  /** Parent entityCode (e.g. "purchase_invoice"). */
  parentEntityCode: string;
  /** Parent record id (the document being edited). */
  parentRecordId: string;
  /** Line entityCode (e.g. "purchase_invoice_line"). */
  lineEntityCode: string;
  /** Optional document currency. */
  currencyCode?: string;
}

const MANUAL_INVOICE_LINE_MANIFEST: SourceAdapterManifest = {
  id: "manual_invoice_line",
  version: 1,
  minFrameworkVersion: 1,
  label: "Add line manually",
  // No specific permission code — manual entry is always allowed if the
  // user can edit the parent document. Op-level permission (ADD_LINE) gates
  // access higher up the stack.
  permissionCode: undefined,
  // direct_fill: no picker; consumer routes the composer payload through
  // toDraftShape and stageLine directly. Schema enforces that `picker` is
  // omitted for direct_fill adapters.
  entry: "direct_fill",
  // No remote source → no caching to worry about.
  cacheStrategy: "none",
  // Manual lines never go stale (no upstream source can change under them).
  stalenessStrategy: "fail",
  selectionShape: { kind: "id_only", idField: "draftId" },
  // Dedupe by the draft id — each composer submit produces a new id, so
  // duplicates within one staging session are not expected. The committer's
  // duplicate-source-line guard does not apply (manual lines emit no
  // link_source_line effects).
  dedupeKeys: ["draftId"],
  fill: { fieldNames: [], prefilledFieldNames: [], requiredFieldNames: [] },
};

/**
 * Factory for the manual invoice line adapter. Returns a fresh adapter
 * instance so tests can register/unregister without sharing state across
 * test cases.
 */
export function createManualInvoiceLineAdapter(): SourceAdapter<
  ManualInvoiceLineSelection,
  ManualInvoiceLineDraft,
  ManualInvoiceLineParentCtx
> {
  return {
    manifest: MANUAL_INVOICE_LINE_MANIFEST,

    async fetch(): Promise<Page<ManualInvoiceLineSelection>> {
      // Manual adapter has no remote source — picker would render an empty
      // list. Consumers skip the picker entirely.
      return { items: [] };
    },

    toDraftShape(selection, ctx): ManualInvoiceLineDraft {
      const binding: SourceBinding = {
        sourceType: MANUAL_INVOICE_LINE_MANIFEST.id,
        sourceDocType: ctx.parentEntityCode,
        sourceDocId: ctx.parentRecordId,
        // sourceLineId intentionally omitted — manual entry has no upstream
        // line to link back to.
        sourceRef: {
          lineEntityCode: ctx.lineEntityCode,
        },
      };
      return {
        ...selection.payload,
        draftId: selection.draftId,
        sourceBinding: binding,
      };
    },

    async resolveDefaults(draft) {
      // No async resolution needed for manual entry — the composer already
      // applied entity-level defaults during initialDraft().
      return draft;
    },

    applyParentContext(draft) {
      // Currency / company-code propagation is the composer's job during
      // editing. The adapter does not re-apply parent context at commit
      // time because that would clobber user-entered values.
      return draft;
    },

    validateSelection(selection): ValidationResult {
      if (!selection.draftId || typeof selection.draftId !== "string") {
        return {
          ok: false,
          issues: [{ message: "draftId is required on manual selections" }],
        };
      }
      if (!selection.payload || typeof selection.payload !== "object") {
        return {
          ok: false,
          issues: [{ message: "payload is required on manual selections" }],
        };
      }
      return { ok: true };
    },

    async isStillValid(): Promise<ValidationResult> {
      // Manual lines have no upstream source — they cannot go stale.
      return { ok: true };
    },

    dedupeKey(line): string {
      return String(line.draftId);
    },

    onCommitSideEffects(): SourceSideEffect[] {
      // No reverse links, no event emissions — the parent document's own
      // commit pipeline (line-create POST or draft batch persist) records
      // whatever audit/event semantics the entity needs.
      return [];
    },
  };
}
