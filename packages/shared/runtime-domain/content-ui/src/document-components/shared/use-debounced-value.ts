/**
 * @athyper/content-ui — useDebouncedValue
 *
 * Returns a debounced copy of `value` that updates `delayMs` after the
 * latest change. Re-rendering with the same value is idempotent (no
 * extra timer scheduled). Cancels the pending timer on unmount.
 *
 * Used by the apportionment breakup drawer's search input (v3.1 Phase
 * 5e) so a typing burst fires only one server hit. Extracted to its own
 * module so the timing semantics can be exercised in isolation with
 * fake timers — the alternative (testing through the full drawer with
 * fetch mocks) was 5× the code for the same coverage.
 *
 * NOTE: the value's *identity* — not its content — drives the
 * scheduling. Pass primitive strings / numbers, or stabilize objects
 * before they reach the hook.
 */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
