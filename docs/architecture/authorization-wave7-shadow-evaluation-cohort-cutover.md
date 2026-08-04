# Authorization cleanup Wave 7 — shadow evaluation and cohort cutover

Status: implementation foundation complete; production shadow traffic, load
evidence, approvals, and observation-window evidence remain operational gates.

## Runtime comparison

`AuthorizationShadowComparisonService` invokes the exact legacy evaluator, the
canonical evaluator, and the approved golden-corpus truth from one deeply
frozen identity/request input. During shadow it returns only the legacy
decision. It never unions permissions, scopes, evidence, or allows.

The comparison normalizes the plane, allow/deny result, exact permission codes,
typed scopes, reason, and evidence kinds. Every mutation, Admin action,
financial posting, workflow decision, delegation use, and ACL-protected read
is compared. Only `routine_read` can be deterministically sampled.

Mismatch classification is closed to capability, scope, precedence, plane,
entitlement, operation mapping, delegation, ACL, and data defect. Missing
approved truth or an unavailable v2 decision is a data defect. An unresolved
owner is explicitly recorded as `unowned` and blocks read enforcement.

The exact consumer path is part of evidence: single, batch, session, Admin,
Mesh, workflow, company scope, or ACL.

The runtime does not silently convert comparison/evidence failures into a new
allow. A legacy evaluator failure still fails the legacy production path; a
shadow sink failure is reported but cannot change its answer.

## Plane-local database controls

Neon/Admin controls live only in `control` and `event`. Mesh controls are
physically mirrored in `mesh_control` and `mesh_log` and are installed through
the explicit Mesh-only provision manifest. Mesh DDL has no Neon relation,
configuration, or runtime dependency.

Each plane starts with resolver `legacy` and writer `legacy`. The database
stores plane resolver/writer state and a monotonic writer epoch, exact
permission/path cohorts, approved active-user corpus hashes, append-only
comparison/load evidence, mismatch disposition, immutable switch receipts,
and target-guard installation and validation evidence.

The readiness view combines the existing transaction replay checkpoint,
transaction-envelope completeness, conservation ledger, comparison evidence,
cohort parity, load evidence, writer state, and observation window. A partial
or rejected source transaction and lag above the approved plane threshold
block comparison/cutover.

## Single-writer protocol

Legacy capture-source tables receive `ENABLE ALWAYS` freeze guards while the
plane is still unfrozen. The guard is inert until the function-managed freeze.
Canonical authority tables must separately receive both row and truncate
target guards. Installation leaves a guard in `installed`; an independent
validation function proves both triggers are `ALWAYS` and moves it to
`validated`.

Before the writer switch, target guards accept only an approved writer-registry
entry whose path is `legacy_projector`. Direct target API mutation is rejected.
After the atomic epoch switch, they accept only `canonical_api`. Shared
Neon/Admin authority cannot be written while its planes have mixed writer
epochs.

The final writer switch requires canonical reads already enforced, a recorded
legacy-write freeze, exact source/applied watermark equality, complete
transaction/conservation reconciliation, validated target guards, and signed
gate evidence and ownership.

If instant post-switch resolver rollback is promised, the switch also requires
a tested or active target-to-legacy projector with its evidence hash. Without
that evidence, the switch can proceed only with the instant rollback promise
explicitly false. There is no dual unconstrained writer mode.

## Cohort procedure

1. Install additive DDL and verify replay health from the pre-snapshot
   watermark.
2. Keep resolver/writer on legacy; validate comparison coverage and target
   guards.
3. Enter shadow through the function-managed state transition.
4. Register approved exact plane/permission/path cohorts with corpus, parity,
   watermark, owner, rollback owner, and observation evidence.
5. Enforce canonical reads by cohort while legacy remains the sole writer.
6. After all-read stability, freeze authorization writes and catch projection
   to exact zero lag.
7. Switch the writer atomically under the rollback contract.
8. Complete the approved observation window before recording
   `observation_complete`.

Resolver rollback during the read-only cutover is reliable because legacy is
still the authority writer. After the writer switch, resolver rollback is
instant only when reverse projection was tested and remains active.

## Verification and reporting

Repository verification:

```text
pnpm --dir server/db run db:verify:authorization-v2-wave7
```

Read-only plane report:

```text
pnpm --dir server/db run db:report:authorization-v2-wave7-readiness -- \
  --plane=<neon|admin|mesh> \
  --expected-database=<exact-db>
```

Use `DATABASE_URL` for Neon/Admin and `MESH_DATABASE_URL` for Mesh. The report
runs under repeatable-read/read-only, rejects an unexpected database name or
opposite-plane schema, emits a canonical evidence hash, and performs no
mutation. The machine-readable contract is
`config/governance/authorization-wave7-shadow-cutover-contract.v1.json`.

## Gate status

The repository can prove default-legacy selection, immutable same-input
comparison, mandatory risk coverage, exact scope/permission normalization,
closed mismatch classification, plane isolation, monotonic cutover state,
single-writer guards, zero-lag writer switching, and rollback-contract
enforcement.

It does not claim production readiness without live evidence for 100% required
path comparison, approved active-user parity, zero unexplained/unowned
high-risk mismatch, caught-up replay and conservation, cache/evidence behavior
under load, deployed target-guard coverage, zero-lag switch rehearsal, reverse
projection when promised, and the approved observation window.

No production resolver or writer was switched while building Wave 7.
