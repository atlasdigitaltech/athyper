# Meta-entity governance reconciliation

## Status: **complete** (Phases A–E). One deferred item — see Phase B.

## Background

The three-plane reorg replaced the **v2 meta-entity architecture** — a single
generic runtime kernel at `/api/runtime/v1/entities/…`, an execution-descriptor
provider, a handler registry — with the **governed-entity-lifecycle model**
(`docs/architecture/decisions/governed-entity-lifecycle.md`), implemented as a
conventional service layer in `server/packages/platform/metadata` and
`server/packages/services/records/src/*`.

The v2 principles **survived** — `VerifiedRequestContext` is consumed everywhere,
routes never parse identity, descriptors validate entity coordinates — but the
single-kernel _shape_, the `execution-descriptor` layer, and the phase-8 rollout
apparatus are gone.

## Phase B — Decisions

| Artifact                                                                                                      | Decision             | Rationale                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-meta-entity-governance.mjs`                                                                           | **retire**           | v2 single-kernel anti-pattern rules produce false positives on the multi-service layer (legit coordinate/idempotency guards match `entityCode` regexes); the identity-parsing concern is covered — better — by the records identity-boundary ratchet |
| `verify-meta-entity-dependencies.mjs` + `meta-entity-dependencies.json`                                       | **retire**           | phase-8 rollout-gate artifact; no surviving consumer; 3 of 4 dependency groups point at dismantled code                                                                                                                                              |
| `verify-meta-entity-test-matrix.mjs` + `meta-entity-test-matrix.json`                                         | **retire**           | v2-specific coverage axes (`execution-descriptor` levels); every coverage artifact dead; no surviving consumer                                                                                                                                       |
| `config/governance/meta-entity-{routes,performance-budgets,performance-exceptions,retirement-evidence}.json`  | **keep**             | consumed by the passing `verify-meta-entity-retirement`; the route ledger + retirement metrics are still governance data                                                                                                                             |
| `verify-records-identity-boundary.mjs` + `records-identity-boundary.json`                                     | **rebuild**          | the concern is real and the new architecture is _better_ — 0 identity-parsing sites vs the old baseline of 173. Repointed at `records/src`, re-baselined at 0 (locks in the win).                                                                    |
| `verify:meta-entity-certification`, `test:meta-entity-rollout`, `test:meta-entity-retirement` + their configs | **keep**             | pass, current                                                                                                                                                                                                                                        |
| `.github/workflows/meta-entity-contract.yml` (7 jobs)                                                         | **retire**           | 6 of 7 jobs target dismantled code (`packages/services/metadata/src/**`, `db:verify:meta-contract-*`, `@athyper/admin`); the 7th (`contract-static`) is already covered by `ci.yml` + `test:policy`                                                  |
| `.github/workflows/meta-entity-performance-qualification.yml` (the `qualify-meta-entity` step only)           | **defer, suspended** | qualifies routes that do not exist yet in the new runtime; a real re-baseline is a dedicated perf ticket for the runtime owner. The step is `continue-on-error`; the rest of that workflow (RLS / outbox / Redis / SSE qualification) is unaffected. |

## Phases C–E — Executed

- **Removed:** `scripts/policy/verify-meta-entity-{governance,dependencies,test-matrix}.mjs`,
  `verify-meta-entity-dependencies.test.mjs`, `scripts/policy/meta-entity-v2-present.mjs`,
  `config/governance/meta-entity-{dependencies,test-matrix}.json`,
  `.github/workflows/meta-entity-contract.yml`.
- **`package.json`:** deleted the `policy:meta-entity` script (all three checks gone).
- **`ci.yml`:** dropped the suspended `policy:meta-entity` step; `verify:meta-entity-certification`
  is a blocking step; a comment records the retirement.
- **`verify-records-identity-boundary.mjs`:** `routesRoot` → `server/packages/services/records/src`,
  `collect()` guarded with `existsSync`, `scope` string updated; baseline regenerated
  (`--write-baseline`) — now `{verifyBearer:0, resolveTenantId:0, directOrgHeader:0, principalResolution:0}`
  across 37 files.

## Deferred (not blocking any PR)

- `qualify-meta-entity` in `meta-entity-performance-qualification.yml` stays
  `continue-on-error` until the runtime owner re-baselines against the
  governed-entity-lifecycle routes. `scripts/performance/qualify-meta-entity.{mjs,test.mjs}`
  and `meta-entity-{routes,performance-budgets,performance-exceptions}.json` are kept
  (the retirement check needs them, and the perf re-baseline will reuse them).
- `config/governance/meta-entity-contract-v2-coverage.json` is inert but still
  listed in `config/governance/authorization-inventory.v1.json`; removing it
  needs an inventory regeneration and is out of scope here.
