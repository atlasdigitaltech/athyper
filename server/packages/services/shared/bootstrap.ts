// server/packages/services/shared/bootstrap.ts
//
// Phase D — Bootstrap-only entry for @athyper/svc-shared.
//
// Imported exclusively by server/src/composition/bootstrap.ts:
//
//   import { setDefaultRealmKey } from "@athyper/svc-shared/bootstrap";
//
// Routes resolving `@athyper/svc-shared` see only the read-side helpers; any
// attempt to mutate the realm default from inside a route handler is a
// compile-time error because the setter is not exported from the main barrel.
//
// Production callers MUST resolve this subpath. Tests that need the reset
// helper import `realm-default.js` directly (it's not part of the public API).

export {
  setDefaultRealmKey,
  RealmDefaultKeyConflictError,
} from "./realm-default.js";
