import type {
  DraftLine,
  SourceAdapterManifest,
  SourceSideEffect,
} from "@athyper/runtime-contracts";

// ─────────────────────────────────────────────────────────────────────────────
// SourceAdapter — executable interface paired with a SourceAdapterManifest.
//
// The manifest is the declarative metadata (id, picker UI, selection shape,
// dedupeKeys). The adapter is the behaviour (fetch, normalize, validate,
// commit side-effects). The two are paired one-to-one and registered
// together in SourceAdapterRegistry.
//
// All hooks are pure or async-pure: adapters MUST NOT mutate parent state
// directly. Side-effects are *declared* via `onCommitSideEffects` and
// orchestrated by DraftLineCommitter inside a transactional pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceQuery {
  /** Free-text search string. */
  q?: string;
  /** Filter values keyed by SourceFilter.key. */
  filters?: Record<string, unknown>;
  /** Sort field + direction. */
  sort?: { field: string; direction: "asc" | "desc" };
  /** Page cursor (opaque). */
  cursor?: string;
  /** Page size. */
  limit?: number;
}

export interface Page<T> {
  items: T[];
  /** Total count if known. */
  total?: number;
  /** Opaque cursor for the next page. */
  nextCursor?: string | null;
}

export interface ValidationIssue {
  path?: string[];
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues?: ValidationIssue[];
}

/**
 * `Selection` is whatever the picker returns (typed per adapter). `DraftLine`
 * extends the validated DraftLineSchema shape — adapters may carry extra
 * fields atop the required sourceBinding. `ParentCtx` carries the parent
 * document context (currency, company code, contract id, etc.) and is
 * supplied by the caller of AddItemController.
 */
export interface SourceAdapter<
  Selection extends Record<string, unknown> = Record<string, unknown>,
  Draft extends DraftLine = DraftLine,
  ParentCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  manifest: SourceAdapterManifest;

  /** Fetch a page of selectable items. */
  fetch(query: SourceQuery, parentCtx: ParentCtx): Promise<Page<Selection>>;

  /** Pure conversion: selection → draft shape (mechanical). */
  toDraftShape(selection: Selection, parentCtx: ParentCtx): Draft;

  /** Async defaults — calls pricing/tax/dimension services if needed. */
  resolveDefaults(draft: Draft, parentCtx: ParentCtx): Promise<Draft>;

  /** Pure: apply parent currency/company-code/UOM conversion. */
  applyParentContext(draft: Draft, parentCtx: ParentCtx): Draft;

  /** Validate a single selection (e.g. min/max qty, mandatory fields). */
  validateSelection(selection: Selection, parentCtx: ParentCtx): ValidationResult;

  /**
   * Async re-check at commit time — has the upstream source changed under
   * the user? Adapters typically refetch the line and compare a watermark
   * (status, remainingQty). Strategy is configured on the manifest
   * (`refresh` | `warn` | `fail`).
   */
  isStillValid(stagedLine: Draft, parentCtx: ParentCtx): Promise<ValidationResult>;

  /**
   * Optional override of the manifest's `dedupeKeys` — useful when dedupe
   * needs a custom hash (e.g. composite of source line id + tax code).
   * Returns a stable string used to identify duplicates within the staged
   * set and against parent's existing lines.
   */
  dedupeKey?(line: Draft, parentCtx: ParentCtx): string;

  /**
   * Declarative side-effects the commit pipeline must perform. Adapters
   * describe intent; DraftLineCommitter orchestrates execution + rollback.
   */
  onCommitSideEffects(line: Draft, parentCtx: ParentCtx): SourceSideEffect[];
}
