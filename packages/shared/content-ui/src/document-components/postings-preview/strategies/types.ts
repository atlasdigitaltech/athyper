/**
 * @athyper/content-ui/document-components/postings-preview/strategies
 *
 * Cleanup Plan v5 §3.9 / §4.9 / amendment 11.
 *
 * Strategies are PREVIEW ONLY — not authoritative accounting logic.
 * The server-side posting engine is the authority for the actual JE
 * that posts. These strategies exist to give users a UI preview before
 * submission. Drift between preview and posted JE is a BUG to be
 * caught by fixture tests.
 */

/**
 * Minimal handle for a posting strategy. The full strategy contract
 * (deriveHeaderRows, adAggregationSide, accountLabels) extends this
 * when `buildPostingsPreview` accepts strategies as input (planned
 * for the strategy refactor follow-up).
 *
 * The `kind: "preview"` + `preview_only: true` markers are amendment 11
 * compile-time guarantees: anything registered as a strategy MUST
 * surface its non-authoritative status, so callers can't confuse a
 * preview with a real JE.
 */
export interface PostingStrategy {
  /** Stable code referenced from `postings_preview` surface config. */
  code: string;
  /** Discriminator — only "preview" exists today. */
  kind: "preview";
  /** Amendment 11 compile-time guarantee. */
  preview_only: true;
  /** Human-readable description for dev tools / docs. */
  description?: string;
}
