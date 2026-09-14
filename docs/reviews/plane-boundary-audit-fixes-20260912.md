# Plane boundary audit remediation

Scope: the pasted Neon/Mesh/Studio audit, implemented on the existing dirty working
tree based on `8cf6737d`. This is local verification, not qualification of that commit
or permission to activate authorization changes.

## Boundary and inventory changes

- Server and frontend import checks use TypeScript syntax extraction. Comments,
  strings and repository `.require(plane)` methods are not package imports. Server
  scanning includes host scripts and `.mts`/`.cts` source. Declared test utilities
  are allowed only from test source; production adapter imports still fail.
- Experience repository ports and the shared access error are owned by
  `@athyper/server-contract-experience`. Platform and PostgreSQL adapters depend
  downward on that contract; existing platform re-exports preserve caller identity.
- Service-level verification/publication scripts now live under
  `server/apps/platform-host/scripts/db-verification`. Existing DB package command
  names point to the new locations. Public exports replace cross-package source
  imports; fixture/resource paths retain their filesystem semantics. Database
  provisioning and SQL fixtures remain in the DB package. These are source-workspace
  verification programs; no live database qualification was run.
- Contract owners are registered. Distinct audit/attachment/finance shapes have
  distinct canonical names with compatibility aliases; `JsonValue` is shared from
  the policy contract.
- The authorization registry classifies the Studio successor payload/link and
  prepare/compilation functions, plus the discovered authorization callbacks.
  Payload and link records are publication inputs/provenance, not a runtime allow
  authority. Existing maker-checker, tenant, hash and activation checks are unchanged.
  Event codes and advisory-lock namespaces no longer appear as unknown tables;
  actual SQL and Kysely table references remain scanned.
- The current route manifest excludes DB/provisioning/verification fixtures.
  Extraction retains named factories and mounted routes. Historical provenance is
  unchanged. `server-route-dispositions.json` enumerates unresolved legacy routes;
  replacement/retirement decisions require an owner, rationale, existing evidence,
  and a current replacement route where applicable.

## Application changes

- Neon review handlers and their transitive decision logic are in the Node-only
  `@athyper/platform-iam-governance-review` package. Tooling entrypoints re-export
  that implementation. Development enablement/origin, authentication, CSRF,
  elevated assurance, revision and idempotency safeguards are retained.
- All apps use the same lazy BFF configuration parser for auth, relay, bootstrap
  and readiness. Production requires `APP_ORIGIN`; a localhost default is available
  only with explicit `NODE_ENV=development`. URL credentials/protocols, origin paths,
  Redis URLs and canonical 32-byte base64 encryption keys are validated. Errors
  report variable names, not values. Build-time imports do not require secrets.
- A shared bootstrap factory and same-origin internal GET helper replace repeated
  request composition. Cookie forwarding and cancellation are preserved.
- Relay factories expose each app's actual composition for behavior tests, including
  positive plane operations, wrong-plane/unknown operations, and disabled pilots.
- Neon catalog overlays reject orphaned module entries and validate defaults/slugs
  while retaining generated workspace/module identity.
- Studio's large editors are split into hooks, models/defaults and views. The graph
  editor validates response fields, preserves unsaved edits after a conflict, and
  adopts a successful save's revision even when a subsequent read fails. Reloading
  after a conflict is an explicit discard action.
- Studio's two qualification JSON imports are a declared data package with explicit
  exports. The app Dockerfile copies its manifest before dependency installation.
  Dependency budgets increase only for the newly declared existing capabilities;
  rationale is recorded in `docs/runbooks/wave1-repository-drift.md`.

## Verification and limits

Local results:

- The six audited policy/inventory/manifest checks pass, along with frontend-spine
  ownership and dependency-budget verification.
- 199 focused tests pass across policy/inventory, BFF composition/configuration,
  governance review, Studio editors, moved entrypoints and experience service suites.
- Neon, Mesh and Studio production builds pass. App/shared BFF typechecks and the
  extracted experience contract/adapter typechecks pass.
- A disposable local Neon standalone server returns the expected disabled `404`
  responses from both packaged governance review routes. No upstream or database
  calls are needed for that smoke test.

Focused checks cover server/plane/frontend boundaries, route extraction/dispositions,
authorization inventory classification, app composition and configuration, Neon review
logic, Studio editing/conflicts, moved verification entrypoints and experience service
behavior. Production builds and typechecks are run locally; no deployment or live
cross-tenant database qualification is implied.

The historical comparison still has **802 unresolved legacy-only identities**.
`pnpm routes:server-manifest:check` verifies structural inventory/disposition freshness;
`pnpm routes:server-parity:check` deliberately fails until those identities have
reviewed replacement or retirement evidence. Matching paths alone do not establish
response-contract or authorization equivalence. The absent `server-backup` tree also
prevents regenerating the separate historical server-rebuild inventory.

The broader contract run reported 276 passed, 7 failed and 12 skipped. Its remaining
failures concern two Vitest files executed through the Node runner, a stale native-case
operation expectation, a URL test VM missing `URLSearchParams`, and three shell source
assertions. The audit's focused suites pass. Test-reachability regeneration is separately
blocked by eight existing `tooling/scripts/local-dev/*.test.mjs` files outside its known
runner directories. These failures are not waived and this change does not claim that
the aggregate repository gate is green.
