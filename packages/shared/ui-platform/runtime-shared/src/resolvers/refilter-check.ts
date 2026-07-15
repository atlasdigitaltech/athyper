/**
 * Default client-side `refilterCheck` implementation.
 *
 * Compatibility helper for older callers that still need to validate that a
 * target field's value passes its `dependent_filter` after a source change. Calls the BFF
 * options endpoint with the current value and post-merge context, then
 * inspects whether the option comes back as non-disabled.
 *
 * The BFF marks stale options as `disabled: true` with
 * `_dependency: { reason: "stale_source" }` (apps/neon options/route.ts
 * Phase 5 fix), so a disabled match means the dependency is broken.
 *
 * Spec: docs/specs/entity_field_defaults.md §5 (client_on_change → refilter)
 */

import { runtimePath } from "@athyper/api-contracts/runtime-paths";

export interface CreateRefilterCheckArgs {
  entityCode: string;
}

export type RefilterCheckFn = (
  target:    string,
  value:     unknown,
  postMerge: Record<string, unknown>,
  /**
   * Optional AbortSignal threaded per-call. Cancelled checks resolve to
   * `true` (no-op) so a stale-but-cancelled in-flight request can't clear
   * a freshly-set value.
   */
  signal?:   AbortSignal,
) => Promise<boolean>;

export function createRefilterCheck(args: CreateRefilterCheckArgs): RefilterCheckFn {
  return async (target, value, postMerge, signal) => {
    if (value === null || value === undefined || value === "") return true;
    const strValue = String(value);

    const url = new URL(runtimePath.fieldOptions(args.entityCode, target), getOriginSafe());
    url.searchParams.set("value", strValue);
    for (const [k, v] of Object.entries(postMerge)) {
      if (v === null || v === undefined || v === "") continue;
      url.searchParams.set(`context.${k}`, String(v));
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal });
    } catch {
      // Network failure or AbortError → best-effort: assume valid, don't clear.
      return true;
    }

    if (!response.ok) return true;
    const body = (await response.json().catch(() => null)) as
      | { options?: Array<{ value?: unknown; disabled?: boolean }> }
      | null;

    const options = Array.isArray(body?.options) ? body.options : [];
    const match = options.find((o) => String(o?.value) === strValue);
    if (!match) return false;          // value not in current options → stale
    return match.disabled !== true;     // disabled = stale per BFF hydration
  };
}

function getOriginSafe(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost";
}
