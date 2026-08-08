// server/packages/services/shared/realm-default.ts
//
// Phase D — Isolation module for the shared route-helper default realm key.
//
// The previous design exposed `setDefaultRealmKey` from the public
// `@athyper/svc-shared` barrel; any route handler that imported the package
// could in principle call it mid-traffic and silently retarget tenant
// lookups to a different realm universe. This module:
//
//   1. Holds the module-level state behind a closure (not just a `let`).
//   2. Enforces set-once semantics: a second call with the SAME value is a
//      no-op (HMR / hot-reload friendly); a second call with a DIFFERENT
//      value throws so a buggy code path can't change the realm at runtime.
//   3. Is consumed by `route-helpers.ts` only via `getDefaultRealmKey()` —
//      no `setDefaultRealmKey` import path crosses package boundaries from
//      anything except the runtime bootstrap.
//
// The setter is re-exported only via the `@athyper/svc-shared/bootstrap`
// subpath, which `server/src/composition/bootstrap.ts` imports. Route packages
// resolve `@athyper/svc-shared` (the main barrel) and never see it.

const FALLBACK_REALM_KEY = "athyper";

let _value: string = FALLBACK_REALM_KEY;
let _locked = false;

export class RealmDefaultKeyConflictError extends Error {
  constructor(attempted: string, current: string) {
    super(
      `realm default key already set to "${current}"; refusing to overwrite with "${attempted}". `
      + "This indicates a runtime code path is trying to mutate the realm default after bootstrap.",
    );
    this.name = "RealmDefaultKeyConflictError";
  }
}

/**
 * Set the default realm key for shared route helpers.
 *
 * Invariants:
 *   - First call: stores the value, locks the slot.
 *   - Repeat call with the SAME value: no-op (HMR-safe).
 *   - Repeat call with a DIFFERENT value: throws RealmDefaultKeyConflictError.
 *   - Empty / non-string arguments: silently ignored to match the prior
 *     forgiving behaviour during early bootstrap when env hasn't loaded.
 *
 * Intended caller: server/src/composition/bootstrap.ts (once, per process).
 */
export function setDefaultRealmKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) return;
  if (_locked) {
    if (_value === key) return;
    throw new RealmDefaultKeyConflictError(key, _value);
  }
  _value = key;
  _locked = true;
}

/**
 * Read the current default realm key. Returns the bootstrap-set value, or
 * the fallback "athyper" when no setter has run yet (test paths, CLI tools).
 */
export function getDefaultRealmKey(): string {
  return _value;
}

/**
 * Test-only escape hatch. Restores the unlocked initial state so tests can
 * exercise the set-once semantics without leaking state between cases.
 * Not exported via package barrel; consumers must import from this file.
 */
export function __resetDefaultRealmKeyForTests(): void {
  _value = FALLBACK_REALM_KEY;
  _locked = false;
}
