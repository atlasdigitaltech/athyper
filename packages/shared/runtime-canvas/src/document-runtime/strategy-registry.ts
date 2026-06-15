"use client";

/**
 * @athyper/runtime-canvas — Postings strategy registry.
 *
 * Cleanup Plan v5 §3.9 + §4.9 + amendment 11.
 *
 * Maps `posting_strategy_code` (from the descriptor's `postings_preview`
 * surface config) to a registered strategy module. Strategies are
 * code-resident TS values (v5 §9 O6 resolved to "code, not DB table"
 * in v5 §10). Adding a new doc type's strategy is a code change +
 * descriptor seed update — no DB migration.
 *
 * Strategies are PREVIEW ONLY per amendment 11. The server-side posting
 * engine is the authority; strategies just compute what the UI shows
 * before submission.
 */

declare const process: { env: { NODE_ENV: string } };

// ─── Public types ────────────────────────────────────────────────────

/**
 * The shape lives in content-ui/document-components/postings-preview/
 * strategies. We declare a minimum-surface type here so the registry
 * doesn't introduce a circular dep. Actual strategy implementations
 * widen the contract.
 */
export interface PostingStrategyHandle {
  code: string;
  kind: "preview";
  /** Marker present for amendment 11 type-level guarantee. */
  preview_only: true;
}

const strategies = new Map<string, PostingStrategyHandle>();

export function registerPostingStrategy(strategy: PostingStrategyHandle): void {
  const existing = strategies.get(strategy.code);
  if (existing === strategy) return;
  if (existing && process.env.NODE_ENV === "development") {
    console.warn(`[strategy-registry] replacing existing strategy '${strategy.code}'`);
  }
  strategies.set(strategy.code, strategy);
}

export function unregisterPostingStrategy(code: string): void {
  strategies.delete(code);
}

export function resolvePostingStrategy(
  code: string,
  opts: { isDescriptorSeeded: boolean } = { isDescriptorSeeded: true },
): PostingStrategyHandle | null {
  const found = strategies.get(code);
  if (found) return found;
  if (opts.isDescriptorSeeded) {
    throw new Error(
      `[strategy-registry] descriptor references unregistered strategy '${code}'. `
      + `App boot must register it.`,
    );
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(`[strategy-registry] unknown strategy '${code}'; postings preview will be empty.`);
  }
  return null;
}

export function listMissingPostingStrategies(seededCodes: ReadonlyArray<string>): string[] {
  return seededCodes.filter((code) => !strategies.has(code));
}
