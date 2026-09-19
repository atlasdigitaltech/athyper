# Control-admin second review — 2026-09-07

Six actionable findings remain. This is a review of the current workspace, including
the newly deployed repository integrations. No application fixes, database writes or
deployment changes were made in this review.

## Findings, ordered by priority

### 1. P1 — Rounding simulation and finance can produce different amounts

Location: `server/packages/platform/control-admin/src/rounding-control.ts:238`;
counterpart: `server/packages/services/finance/src/shared/rounding-resolver.ts:12`.

The API accepts a rule with an increment but no explicit precision. Its simulator
derives precision from the increment; finance derives missing precision from currency
minor units. A JPY rule with increment `0.05` and no precision returns `1.05` for input
`1.05` in the API, while finance returns `1`. Finance formats the rounded value at
zero decimal places. Without a currency, finance instead rejects missing precision,
although the simulator can still succeed.

Confirmed by an executable reproduction using both real evaluators and controlled
repository/currency inputs. This was not a live financial transaction.

Fix: use one resolution/calculation contract for simulation and finance. Resolve
currency defaults consistently and reject an increment that cannot be represented at
the resolved precision. Cover explicit precision, increment-only rules, JPY, fractional
currencies and missing currency context.

### 2. P1 — Domain publication bypasses reference protection for tenant extensions

Location: `server/packages/platform/control-admin/src/kysely-lookup-repository.ts:99`
and the domain update at line 131.

Publication loads and checks only values where `tenant_id IS NULL`. It then permits
retiring the whole domain or setting `is_extensible=false`, without checking tenant
extensions. A referenced tenant value can therefore become unusable through domain
publication even though its individual retirement would return 409.

`control.lookup_value_is_active` joins the domain and requires both an active domain
and tenant extensibility. Consequently preserving the tenant value row does not preserve
its effective availability.

Reproduction scenario from code inspection: publish an extensible domain, create a
tenant extension and a reference to it, then publish a higher source revision with
`status=retired` or `extensible=false`. Only global value references are examined.

Fix: atomically check all affected tenant extensions before domain-wide changes,
including references belonging to other tenants, through a narrow privileged boolean
check. Coordinate reference insertion with domain state changes. Return 409 while an
affected value is in use.

### 3. P2 — Latest lookup reads can label new values with an old revision

Location: `server/packages/platform/control-admin/src/kysely-lookup-repository.ts:30`;
transaction isolation: `control-repository-db.ts:23`.

`getDomain` reads the domain row and subsequently reads values in a separate statement.
The transaction uses READ COMMITTED without a shared lock. If publication or tenant
retirement commits between these statements, the response combines the earlier domain
version with later values. A subsequent explicit historical read of that version then
returns a different value set. `listDomains` has the same issue.

Confirmed by transaction/statement inspection; no concurrent live mutation was run.

Fix: assemble each response in one SQL statement/snapshot, or use a repeatable-read
transaction specifically for reads. Do not blindly change write isolation: writers
currently rely on fresh reads after advisory-lock acquisition. Add a deterministic
two-connection regression that pauses between the domain and value reads.

### 4. P2 — Bank fixtures validate a different direction from the stored update

Location: `server/packages/platform/control-admin/src/kysely-bank-validation-repository.ts:41`
and line 70.

Fixtures are checked before loading the existing rule. An omitted direction is evaluated
as unrestricted, but persistence later restores `old.direction`. Updating an existing
outbound rule with omitted direction and a fixture without direction can therefore pass
publication validation and store a rule that fails its own fixture selection.

The evaluator mismatch was reproduced: supplied rule/fixture returns valid; the same
rule with the persisted outbound direction returns BANK_RULE_NOT_FOUND.

Fix: load and lock the existing rule, build the complete persisted candidate, then
validate that candidate and its fixtures inside the transaction. Either require direction
explicitly on update or define and consistently enforce its omission semantics.

### 5. P2 — One unsupported bank row disables unrelated verification

Location: `server/packages/platform/control-admin/src/kysely-bank-validation-repository.ts:16`
and its mapper at line 121; caller: `bank-validation.ts:26`.

Verification fetches and maps every catalog row before selecting the applicable rule.
The mapper throws 503 for native validation-schema/national-bank-code/nonstandard-prefix
fields. One such row, even retired or for another country and rail, prevents all bank
verification on that plane.

Failing closed for an applicable unsupported rule is appropriate; failing every unrelated
request is excessive. Existing local seed reads passed, so this is a conditional defect,
not a claim that the current local catalog is already failing.

Fix: select active candidates using the complete native applicability coordinates before
mapping/evaluating unsupported checks. Do not silently skip an applicable unsupported
rule in favor of a weaker one. For catalog listing, expose unsupported-rule diagnostics
without turning unrelated verification into a catalog-wide outage.

### 6. P2 — Signed cycle revisions lack an authoritative source-version check

Location: `server/packages/platform/control-admin/src/cycle/cycle-config-service.ts:111`;
persistence: `cycle/kysely-cycle-template-repository.ts:96`.

The apply service verifies signature/target/hash, then encodes sourceRevision in an
idempotency key. It does not persist sourceBlueprintId/sourceRevision as authoritative
coordinates. The repository only compares an optional local expectedLatestVersion.
An older valid signed revision that has never been applied can arrive after a newer one
and become the newest local template. Deduplicating an already-seen message does not
prevent this out-of-order rollback.

Confirmed by service/repository inspection. This route group is currently disabled in
local development.

Fix: persist source identity, accepted source revision and payload hash. Reject older
revisions atomically under the existing tenant publication lock; replay an identical
current revision; reject conflicting equal revisions. Model intentional rollback as a
separate authorized, audited action.

## Functionality and current local availability

| Group | Source operations | Functionality | Local |
| --- | ---: | --- | --- |
| Authorization | 5 | Status, access management, break-glass requests, approval and revocation | Disabled |
| Bank validation | 3 | List/publish rules with fixtures; validate bank details | Enabled |
| Connectors | 6 | Draft validation, lifecycle transitions, queued health checks | Enabled |
| Cycle configuration | 6 | Template preview/validation, immutable publication, signed apply, revision reads | Disabled |
| Entitlements | 4 | Plan/module catalogs and tenant module/usage-limit exceptions | Enabled |
| Features | 4 | Definitions, strategy-aware rollout evaluation and tenant overrides | Enabled |
| Lookups | 4 | Reference domains, historical reads, desired-state publication and tenant-value retirement | Enabled |
| Parameters | 4 | Typed definitions, effective values, versioned override writes and expiration | Enabled |
| Rounding | 4 | Rule listing/writing/retirement and simulation | Enabled |
| Runtime commands | 4 | Preview, submission, separate approval decisions and immutable history | Disabled |
| Total | 44 | | 29 enabled |

The separate mutation routes do not automatically use runtime-command approvals.
Bank verification is rule-based and does not establish account ownership.
Cycle endpoints configure templates; they do not execute live business cycles.

## Evidence and limits

- Current unit suite: **754 passed**, 166 opt-in tests skipped.
- Two additional focused reproductions confirmed rounding and bank-direction behavior.
  The temporary test was removed from the executable test suite; its source is retained
  in [the reproduction artifact](control-admin-review-evidence/round-two-reproductions.test.ts.txt).
- Read-only local smoke check passed: exactly 29 operations, seven catalog endpoints
  returning 401 without credentials, healthy API/worker/scheduler/web, and successful
  connector-health polling on Studio, Neon and Mesh.
- No fresh PostgreSQL mutation suite or authenticated browser/mutation acceptance was
  run in this review. Prior PostgreSQL results are not recounted as new evidence.
- The remaining findings are supported by inspected code paths and concrete interleavings
  or inputs, not by destructive tests against the live environment.
- Authorization writer qualification, cycle signature-verifier wiring and governed
  runtime-executor registration remain deployment prerequisites. No new defect was
  confirmed in entitlement/feature/parameter handling or runtime approval separation
  during this pass; that is not a completeness certification.

Prioritize the two P1 issues, then snapshot consistency and fixture validation, before
expanding rollout. Require authenticated per-plane acceptance after fixes, including
competing writes, reference races and finance/API equivalence.

## Finding 1 follow-up

The rounding P1 is fixed in source by the
[shared resolution/calculation change](rounding-shared-resolution.md).
Twelve additional regressions now cover the divergence and rejection cases.
This source fix is not yet deployed; the other five findings remain open.

## Finding 2 follow-up

The lookup-publication P1 is fixed in source and a new migration:
[lookup domain reference protection](lookup-domain-reference-guard.md).
Cross-tenant checks, direct-write protection and concurrent insertion/publication
regressions passed against PostgreSQL. This fix is not deployed; findings 3–6 remain open.

## Finding 3 follow-up

The lookup-read P2 is fixed in source with
[read-only repeatable-read snapshots](lookup-read-snapshot-consistency.md).
Four deterministic PostgreSQL concurrency regressions reproduce the old failure and
pass with the fix. This change is not deployed; findings 4–6 remain open.

## Finding 5 follow-up

The unsupported-bank-rule P2 is fixed in source. Verification now queries active
candidates by country, rail, optional currency and direction before mapping native
rules. Every applicable candidate still undergoes strict mapping: unsupported
checks return 503 rather than falling back to another rule. Full catalog listing
remains strict. No migration is required.

Six PostgreSQL regressions passed on a disposable Neon database, covering inactive
rules, unrelated coordinates, omitted coordinates and applicable unsupported rules
with a supported fallback present. The complete repository suite passed 27 tests
(one Studio-only test skipped); the control-admin suite passed 768 tests, with
opt-in integration suites skipped. Source and test typechecks passed.
This change is not deployed; findings 4 and 6 remain open.
