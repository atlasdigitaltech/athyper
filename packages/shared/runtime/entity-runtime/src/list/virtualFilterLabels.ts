/**
 * Virtual filter label registry.
 *
 * Every __ -prefixed filter key MUST have an entry here so the state sentence
 * and active-filter chips can render a human-readable label instead of the raw
 * URL sigil. A CI test in entity-runtime.test.ts enforces this invariant.
 *
 * Shell contract rule: this file is additive — never remove an existing key.
 * Adding a new virtual filter requires a matching entry here.
 */

export interface VirtualFilterContext {
  /** The current principal's ID — used to personalise "Assigned to me" vs "Assigned". */
  principalId?: string;
}

export type VirtualFilterLabelFn = (value: string, ctx: VirtualFilterContext) => string;

export const VIRTUAL_FILTER_LABELS: Record<string, VirtualFilterLabelFn> = {
  /** S1.A — Favourites */
  __bookmarked: () => "Favourites",

  /** S2.B — Ownership */
  __assignee:   (value, ctx) =>
    value === "me" || (ctx.principalId && value === ctx.principalId)
      ? "Assigned to me"
      : "Assigned",

  __created_by: (value, ctx) =>
    value === "me" || (ctx.principalId && value === ctx.principalId)
      ? "My documents"
      : "Created by someone",

  /** S4 — Tags (deferred; registered now for enforcement) */
  __tags: (value) => {
    const count = value.split(",").filter(Boolean).length;
    return count === 1 ? "Tagged" : `Tagged ${count} ways`;
  },
};

/** Returns true when the filter key is a known virtual filter. */
export function isVirtualFilter(key: string): boolean {
  return key.startsWith("__");
}

/** Resolve a human-readable label for a virtual filter entry. */
export function describeVirtualFilter(
  key: string,
  value: string,
  ctx: VirtualFilterContext = {},
): string {
  const fn = VIRTUAL_FILTER_LABELS[key];
  if (!fn) return key;
  return fn(value, ctx);
}
