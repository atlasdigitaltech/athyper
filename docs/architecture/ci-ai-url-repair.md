# Shared AI and URL classification repair

Validated on 2026-09-11, based on `60422106eedb145075bfb68d22cbe286f78e8914`.

Browser-safe intent, feedback, answer, insight and business-context protocols now live in
`@athyper/contract-platform-ai`. The frontend agent runtime depends on that package.
Existing server subpaths re-export the same implementations; authorization, persistence
and execution contracts remain in `@athyper/server-contract-ai`. The shared package's
build bundles for browsers, and compatibility tests exercise the original server imports.

The URL extractor recognizes explicit callback-only `use` registrations as middleware
and does not scan their request-handler bodies. Named or mixed handlers, router mounts,
spread arguments and dynamic route declarations remain unresolved rather than being
silently omitted. Static boolean route conditions are evaluated only when both operands
are known booleans, allowing finite bank-directory route declarations to resolve.
The development URL catalogue is regenerated from the committed Swagger snapshot and
current source; the snapshot itself has not been refreshed from a running deployment.

## Verification

- Frozen offline lockfile installation: passed; no external dependency upgrades.
- Shared AI tests: 20 passed; server AI tests: 21 passed.
- Shared AI, server AI and frontend agent-runtime typechecks: passed.
- Canonical package rules and shared purity: passed.
- URL catalogue tests: 24 passed; `urls:check`: passed.
- OpenAPI policy regression tests: 6 passed.
- Test reachability report regenerated and verified.
- Full `pnpm build`: 107/107 tasks passed (95 cached).

## Remaining qualification failures

These repairs do not establish an aggregate green CI result:

- `policy:release-boundaries` now passes canonical package rules but fails frontend
  dependency budgets in Studio and the Studio business-partner package.
- `policy:server-boundaries` reports ten existing DB-to-service imports.
- `openapi:check` reports 140 undocumented routes, one unresolved finance registration
  in `server/packages/planes/neon/src/finance-http.ts`, and a stale audit-status exception.
  No baseline expansion, exception renewal or assertion bypass was introduced.
- Fresh GitHub reads report the repository as private and the branch-protection API
  returns HTTP 403 with the upgrade-or-public requirement. Earlier protection observations
  must not be treated as current enforcement evidence. Repository visibility was not changed.

The next OpenAPI work must register real request/response contracts for the reported
routes, resolve finance descriptors with proven coverage, and remove the migrated audit
exception. Dependency-budget and DB-boundary findings require separate architecture
reconciliation. Merge qualification must use the resulting commit's CI runs and a fresh
successful protection-settings read.
