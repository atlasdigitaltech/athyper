# Stage 0 comprehensive foundation review

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Review date: 2026-09-22. Verdict: **in progress — useful schema baseline, incomplete application qualification**.

This review supersedes the earlier Stage 0 completion claim. The migration and fixture work are real, but a database fixture read and an unauthenticated HTTP 401 do not establish that the selected authenticated application read/write path works. Stage 1 UI work can proceed alongside the small foundation corrections below. These are engineering tasks, not additional approval gates.

## 1. Evidence and limits

Reviewed the current working-tree DDL, migration, fixture provisioner, Workforce repository/service/routes, request materializer, runtime service composition and shared permission authorizer. Queried the existing local Neon database and reproduced failures using read-only queries or transactions that were rolled back. No persistent employee or schema changes were made by this review.

Confirmed locally:

- `20260922_workforce_as_of_projection.sql` is recorded as applied.
- The three `HRD-*` employees remain present; the compatibility view shows two employed workers and one future starter.
- The database session uses UTC; at inspection its date was `2026-09-21`, while the workspace business date was `2026-09-22` in Asia/Kuala_Lumpur.
- The five inspected employment/assignment consistency and overlap constraints exist and are validated.
- The Employee relay returns HTTP 401 without a session. This verifies route admission and authentication enforcement only.
- There are currently no employment rows with null `employee_id` and no work assignments with null `employment_id` in this local database. This observation does not establish migration compatibility for other populated databases.

Previously reported passing type checks, package tests, migration rehearsal and SQL fixture tests remain useful build evidence. They are not substitutes for the missing application and negative authorization checks. This review did not repeat those broad suites or claim that they cover the defects below.

## 2. What is already strong

| Foundation | Verified source / live evidence | Practical strength and limit |
|---|---|---|
| Separate identities | `person`, `employee`, optional `principal_id`, `employment`, `work_assignment` | Personal identity, employment and login are separate. An employee need not have a login. |
| Tenant references | Composite tenant/id foreign keys | Prevent cross-tenant person, employee, employer and assignment references for the inspected contracts. |
| Employee/person consistency | `employment_employee_person_fk` | Employment cannot reference an employee belonging to another person when the employee link is populated. |
| Employer consistency | `employment_company_legal_entity_fk` | Employment company must belong to the selected legal entity. |
| Assignment consistency | `work_assignment_employment_contract_fk` and contract trigger | Linked employment, employee and company must agree. Nullable legacy links still need explicit handling. |
| Temporal overlap | Employment and assignment GiST exclusion constraints | Prevent overlapping qualifying primary rows. They enforce **at most one**, not existence of a primary row. |
| Date ranges | `[start, end)` exclusions and positive assignment ranges | Exclusive end dates are a sound basis for transitions and calculations. Apply the same meaning in APIs and UI. |
| Unallocated person numbers | Applied normal unique constraint | Multiple NULL numbers are accepted; allocated values remain tenant-unique. |
| Tenant RLS | Enabled/forced tables and live tenant policies | Useful database isolation. Company/self/manager authorization still needs application scope resolution. Superuser fixture checks do not verify runtime RLS. |
| Governed request foundations | Validation, version checks, independent review checks, application transaction and snapshots in source | A usable starting point for a real write journey; full local workflow execution remains unverified. |
| Restricted personal evidence | Dedicated profile, purpose/field selection, elevated assurance, audit and token resolver in source | Keep this separate from ordinary directory responses and test it using real authorization decisions. |

## 3. Findings ordered by impact

P1 means a correctness or access-control issue to resolve before relying on the affected local feature. P2 means an important contract or evidence gap. These priorities do not require the entire HR module to stop.

### S0-R01 — P1: a terminated employee can still display as employed

**Confirmed by rolled-back database reproduction.** Setting HRD-0001's canonical employment to `terminated`/`inactive` with termination date equal to the database current date produced this compatibility-view result:

```text
employee_number | employment_status | is_terminated | termination_date
HRD-0001        | employed          | false         | NULL
```

`master.v_employee` filters ended employment out, then falls back to stale flattened employee columns. The governed offboarding materializer updates canonical employment but does not synchronize all those flattened fields. The current API likewise drops the ended employment entirely.

**Correction:** distinguish current employment selection from lifecycle classification. Determine future/ended/no-employment states from canonical records; use legacy fallback only for an explicitly identified legacy record with no canonical employment. A null manager on a canonical assignment must also remain null rather than resurrecting an old flattened manager through COALESCE.

**Required evidence:** current, end-date-equals-as-of, already-ended, future hire, rehire gap, and manager removal. Verify API and compatibility projection against the same expected outcomes.

### S0-R02 — P1: scheduled changes close the current relationship immediately

**Confirmed in source:** `kysely-workforce-request-repository.ts`, application branches for `change_employment` and `offboard_employment`, mark previous employment/assignments inactive immediately even when the change/end date is future. The new current-effective reader excludes those rows before their scheduled end. This can leave a worker without a current canonical employment until the future replacement starts.

**Correction:** separate transaction/application status from business-effective status. Preserve the current interval through its exclusive end, or introduce an explicit scheduled state with a reader that understands it. Avoid rebuilding this logic independently for Employee 360, IAM and payroll.

**Required evidence:** apply a future transfer and future separation, then read on the day before, effective date and day after; check IAM intent timing as part of the lifecycle increment.

### S0-R03 — P1: employee authorization lacks stored company/employer coordinates

**Confirmed in source; exploitability under actual local grants has not been demonstrated.** Employee detail authorizes `{employeeId}` before resolving the stored company/legal entity. The shared authorizer's scope matching expects `companyCodeId` or `legalEntityId`; it does not resolve `employeeId`. RLS here filters tenants, not companies.

Consequences include a valid company-scoped reader being denied. With a tenant allow plus a company-specific deny, the company deny cannot match a resource containing only employeeId. An unfiltered directory similarly cannot enforce row-specific company denials just by checking `{companyCodeId: undefined}`. The service also discards the scope returned by the authorizer.

**Correction:** resolve a minimal trusted record scope before returning personal data; authorize the selected employment's stored coordinates. Restrict directory queries using the effective allowed/denied scope set, or initially require an explicit authorized company. Do not solve this by granting broad tenant HR access.

**Required evidence:** tenant A/B, company A/B, tenant allow plus company deny, authorized list followed by detail, missing record, and no-grant user. Use actual permission snapshots and a non-superuser database role. Self/manager behavior may remain deferred until those views are selected.

### S0-R04 — P1 for exit execution: offboarding SQL cannot execute

**Confirmed by local PostgreSQL reproduction:** the query in `KyselyWorkforceRepository.offboard` uses a LEFT JOIN and `FOR UPDATE OF employee,employment,assignment`. PostgreSQL rejects locking the nullable side:

```text
ERROR: FOR UPDATE cannot be applied to the nullable side of an outer join
```

**Correction:** lock employee/employment, then separately lock the selected assignment if present, with a consistent lock order and revalidation. Test with and without an assignment. Replay currently looks up tenant/idempotency key without comparing the requested employee or command content; bind replay to both target and payload fingerprint.

This endpoint can stay in the exit backlog if Stage 0 selects onboarding as its write proof. Do not describe the complete lifecycle as locally working meanwhile.

### S0-R05 — P2: SQL view and API have different contracts

**Confirmed using the API's SQL selection against live fixtures:** HRD-0003 has `future` in the view but null employment status and company in the API query. A company-filtered directory consequently excludes that future starter. Current workers are `employed` in the view and `active` in the API. The view supports legacy person-linked employment without employee_id; the repository does not.

**Correction:** define one public lifecycle vocabulary, explicit selected employment, and separate current/future/history collections. Decide and document whether a company filter includes future/ended relationships. Implement one shared selection rule or contract-tested projections. Do not infer API behavior from `v_employee` alone.

### S0-R06 — P2: primary-assignment readiness can pass on a secondary assignment

The detail query orders primary first but accepts any effective assignment. Readiness only checks that `assignment_id` exists before clearing `PRIMARY_ASSIGNMENT_NOT_EFFECTIVE`. A secondary-only worker therefore passes that particular readiness condition.

**Correction:** carry assignment type into the result and require the intended primary assignment for that readiness condition; show secondary/acting assignments independently. Existing overlap constraints do not guarantee a primary assignment exists.

### S0-R07 — P2: the current regression test misses its intended failure

`workforce-as-of-read.sql` creates a future manager but never assigns that manager to the future assignment. Both assignments therefore have null managers, so the manager assertion passes whichever assignment was selected. The future employment is also non-primary, allowing primary-first ordering alone to satisfy the employment assertion without proving date filtering. The test does not assert that exactly one result was found; SQL NULL comparisons can let a missing result escape the existing IF condition.

**Correction:** make current and future rows observably different, assert result existence, test a future-only relationship, and exercise the actual repository as well as the compatibility view. Verify exclusive end boundaries, expired records, duplicate allocated person-number rejection and rollback cleanup. Assert that removing the effective-date predicate makes the relevant regression test fail.

### S0-R08 — P2: fixtures are not yet a representative scoped HR pack

The provisioner selects the alphabetically first active company. Live HRD-0001 is under company `acfb`, country CA, timezone America/Toronto, while the person fixture is stamped MY. Those facts are not inherently invalid for an employee, but this is accidental selection rather than a deliberate localization scenario. Department/title are populated only in legacy employee text; assignments have no canonical organization, position or manager. No onboarding case or request evidence is provisioned.

Other limitations: future hire is hardcoded to 2027-01-01; deterministic UUIDs omit tenant identity despite accepting a tenant override; replay verifies only employee number/type, not fixture ownership, relationship IDs or full expected state; private-network address admission is not proof that a target is disposable/local.

**Correction:** require an explicit tenant/company/actor and verify their relationships; seed canonical organization/position/manager records; namespace fixture IDs by tenant; use a recorded fixture as-of date; validate pack ownership before accepting existing rows. Preserve changed fixture data and report drift instead of silently overwriting or deleting it. Clearly separate direct setup fixtures from evidence of a governed write.

### S0-R09 — P2: country business date and date-only handling are unsettled

The live database uses UTC and its date differed from the workspace date during inspection. `CURRENT_DATE` therefore cannot silently mean Saudi, Malaysian or Singaporean employer business date. The repository also converts JS Date values using UTC ISO slicing; whether that shifts PostgreSQL DATE values depends on driver parsing/runtime timezone and needs a focused test.

**Correction:** use an explicit ISO business `asOfDate` with a documented employer timezone default; preserve SQL DATE values as date-only values. Test MY/SG/SA midnight boundaries and daylight-saving behavior for any supported employer timezone. Full country payroll rules are not required to settle this contract.

### S0-R10 — P2: input bounds and calendar validation are incomplete

Workforce list has no service-level maximum limit; route parsing accepts any positive safe integer. Offboarding's date validator checks shape only, so impossible dates reach lower layers. Request-list limits already have a 1–200 bound and provide a reusable pattern.

**Correction:** bound Employee list size, validate status values, and reject impossible calendar dates at the command boundary. Add deterministic ordering and defer full search/saved-view/cursor UX to Stage 1.

### S0-R11 — P1 for claiming completion: no authenticated database-backed write proof

The current evidence is direct fixture insertion plus read queries, mocked service tests and HTTP 401 probes. It does not show an authorized session reading data or executing create → validate → submit → independent decision → apply → readback. Direct offboarding/checklist mutation routes also exist in the backend, so the earlier statement that all writes use requests is too broad; the browser relay currently admits only the selected subset.

**Correction:** select one real write path, preferably onboarding; execute it using synthetic protected profile evidence and existing legitimate local actors. Check the approved materialization, audit/outbox and retry behavior. Define the public workflow boundary and the separate operational-command boundary explicitly. If suitable actors or workflow configuration are missing, record the exact missing setup rather than marking completion.

## 4. Canonical contract to settle before expanding the UI

These are required design decisions, not claims of implementation:

1. **Identity:** person owns personal identity; employee owns employee number and optional principal link; employment owns employer, dates and employment type; assignment owns organization/position/manager. Compatibility columns are never the authority for a canonical relationship that exists.
2. **Scope:** tenant comes from the verified session; company/employer scope comes from stored selected employment. Query parameters select within authorized scope, never manufacture authority.
3. **Time:** use `[start, end)` throughout; distinguish record state, employment lifecycle state and date effectiveness. Define the business as-of date and include it in the response.
4. **Reads:** return explicit selected employment/assignment IDs, derived lifecycle state and clearly absent/not-authorized/not-effective states. No primary assignment must not masquerade as a valid primary assignment. Future and ended records remain navigable without appearing currently employed.
5. **Writes:** approved workforce requests materialize lifecycle changes transactionally; checklist and other operational commands have their own named permission/version contracts. Replays match tenant, target and payload. Concurrency must not produce duplicate people or overlapping primary relationships.
6. **PII:** directory/detail projections contain only permitted fields; protected evidence uses the existing purpose-bound reveal contract. Do not include hidden sensitive data in response metadata or logs.
7. **Localization:** store employer/work country, nationality, residency and payroll jurisdiction separately as the model expands. Fixtures must not imply that person.country_code supplies all of them.

## 5. Completion criteria reassessment

| Stage 0 requirement | Current verdict | Closure evidence |
|---|---|---|
| Local DB available | Verified | Existing Neon database queried successfully. |
| App connects to DB through selected path | Partial | Authenticated Employee GET returning expected synthetic data. HTTP 401 is insufficient. |
| Representative fixtures load | Partial | Three rows exist; add explicit company, canonical org/manager, permission and boundary cases. |
| Identity/date/scope defects addressed | In progress | R01–R03 and R05–R10 resolved for selected reads/write. |
| Canonical read/write contract established | Partial | Reconcile view/API lifecycle, temporal selection, scope and operational commands. |
| Migration applied without reset | Verified for local application | Ledger confirms application; preserve immutable applied checksum. No data-value backfill was performed by this migration. |
| Changed behavior exercised meaningfully | Partial | Existing test has blind spots; add discriminating repository/database cases. |
| Required backfill verified | Not established beyond current empty legacy-link counts | Inventory populated legacy cases; define conversion only if needed. No blanket claim that all upgrades need no backfill. |
| Other findings recorded | Complete for this review | Findings and deferred work below are now documented. |

## 6. Small work packages to close the baseline

| Work package | Deliverable | Owner | Dependency / local check |
|---|---|---|---|
| A — Read semantics | Reconcile lifecycle, future/ended selection, primary assignment and business date | HR API + data engineering | Run API/view contract cases and negative temporal cases against PostgreSQL. |
| B — Scope resolution | Stored employee/employment scope and restricted list query | IAM + HR API | Authorized company reader succeeds; wrong company/tenant and scoped deny fail without PII. Can proceed alongside A. |
| C — Fixtures and regression evidence | Explicit company setup, ownership/drift checks, canonical org/manager, discriminating tests | Data/platform | Existing workspace data survives first run, rerun and a deliberate fixture-conflict test. |
| D — One governed write | Synthetic onboarding through real local authorization/workflow and readback | HR lifecycle + IAM | Approval, application, retry, stale version and rollback evidence recorded. Requires A–C contracts used by this flow. |
| E — Build record | Exact routes, actors by non-secret identifier, fixture coordinates, migration checksums and observed outcomes | Workstream owner | Only mark selected increment locally working when its read/write proof exists. |

Defer full exit settlement, broad historical UI, full personal-information expansion, country statutory payroll, performance benchmarks and production qualification. R04 can be fixed with the selected exit increment; it must remain a named defect until then. Attendance/leave/benefits/payroll can use explicitly scoped, valid seeded records while these focused packages proceed.

## 7. Evidence sources

Repository-relative paths:

- `server/db/ddl/planes/neon/master/{03_tables,05_constraints,07_functions,09_views,10_rls}.sql`
- `server/db/migrations/20260922_workforce_as_of_projection.sql`
- `server/db/scripts/provisioning/provision-hr-stage0-fixtures.ts`
- `server/db/scripts/tests/integration/workforce-as-of-read.sql`
- `server/packages/services/master-data/src/{workforce-service,workforce-routes,kysely-workforce-repository,kysely-workforce-request-repository}.ts`
- `server/packages/platform/iam/src/permission-authorizer.ts`
- `server/apps/platform-host/src/composition/register-services.ts`
- `apps/neon/lib/relay.ts` and `packages/platform/gateway/bff-relay/src/index.ts`

The live ended-employment reproduction was rolled back; all three original fixture employees were retained. The invalid locking query failed before a write. This review changes documentation only and leaves the previously applied migration immutable.
