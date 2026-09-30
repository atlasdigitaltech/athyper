# Stage 1 Employee directory and Employee 360 v1 — build note

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

**Status:** Employee 360 v1 is locally working on 2026-09-22. The Stage 1 contract and local completion checks are complete; the limitations below remain backlog hardening rather than demo blockers.

This is the v1 baseline snapshot. See the [post-v1 hardening build note](stage-1-employee-360-hardening-build-note.md) for subsequent implementation and the current open work.

## Delivered

- `/people/workforce` provides an authorized company-scoped directory. Search, lifecycle filtering and name/number/status sorting execute in PostgreSQL. The API returns an opaque continuation cursor and the browser keeps previous/next cursor history.
- The People catalog now maps Core Human Resources to `/people/workforce`; `/people/external-workforce` remains reserved for the separate external-workforce stage.
- Personal and shared saved views use the existing `master.saved_view` preference authority. A personal view persists directory search, status and sort without storing result rows or protected values.
- `/people/workforce/[employeeId]` provides the identity header, selected employment, database as-of date, lifecycle/access summary and multi-employment selector.
- Overview, Joining, Employment & assignment, Team, Personal & contact, User & access, Requests & tasks, and Related tabs distinguish current, future and ended records.
- Manager navigation and a separately loaded, company-filtered direct-team view use stable Employee 360 links.
- Requests, team, documents, comments and audit use separate lazy section endpoints with independent opaque cursors. Documents, comments, requests and audit require their own section permission in addition to `neon.workforce.read`.
- Joining presents employment number/type, hire/service/probation dates and onboarding progress when those canonical fields exist.
- Emergency-contact, passport and statutory identity values are absent from normal Employee 360 payloads. Users with `neon.workforce.pii.read` receive an explicit reveal control; reveal requires elevated assurance, a declared purpose and field allow-list, resolves tokenized values through the protected-value adapter, expires after 15 minutes, and writes sensitive-access audit evidence.
- A caller without PII permission receives no reveal control and issues no protected-data request. Documents, comments and audit are also permission-gated before their components mount, so an unauthorized browser does not request restricted section data. Empty sections distinguish no records, no permission and service failure.
- Detail and section reads resolve every non-archived employment legal-entity/company scope before fetching content. Cross-company history remains fail-closed if any represented scope is denied.
- The relay admits directory, detail, section, saved-view and protected-reveal operations through authenticated tenant propagation.

## DDL and authorization corrections

- `neon.workforce.read` now declares `company_code/exact`, matching the company coordinate actually authorized by the directory and Employee 360 contracts. The former `operating_organization/subtree` declaration could never authorize a company-code resource reliably.
- The canonical authorization seed now contains the permissions already used by the Workforce service: review, onboarding execution, offboarding execution, PII read, IAM retry and integration import.
- The local verification authority grants `athyper.admin` only `neon.workforce.read` for the Stage 0 company fixture. `athyper.owner` remains the denied control actor. This fixture is local verification data and is not a production role model.
- A reusable read-only repository probe covers directory, detail, team, requests, documents, comments and audit queries against the installed DDL.

## Verification evidence

- Contract, service, Workforce UI, gateway relay and Neon application TypeScript checks pass.
- Workforce UI tests pass: 2 files and 7 tests.
- Master-data service tests pass: 54 files, 444 tests; 1 file and 25 tests remain intentionally skipped by the existing suite.
- The Neon URL/relay contract passes all 8 tests. The two previously unrelated failures were corrected by teaching the CSS-bundled alias test its runtime context and by passing the required supplier-controls search parameters.
- The live read-only `athyper_runtime` repository probe returns three fixture employees and loads all five section query shapes without SQL or RLS errors.
- Admin-assisted ordinary Neon browser sessions prove `athyper.admin` can select the fixture company, load three employees, open Employee 360 and load the permitted Team and Requests sections. `athyper.owner` receives the explicit directory denial and makes no workforce data request. A direct authenticated relay check independently returns `403` for the denied actor.
- `tooling/scripts/verification/verify-local-workforce-stage1-browser.mjs` repeats that allowed/denied proof from local Keycloak without storing a reusable browser session or credentials.
- Authorization seed verification and migration-layout verification pass. The repository-wide seed-contract lint still reports pre-existing findings in changed audit, banking and Neon control seed files; it reports no finding for the new Workforce seed.

## Known limits after v1

- Team is a direct-report view. Recursive hierarchy, vacant-position trees and matrix-manager relationships belong in organization-management increments.
- Documents and comments are read views in Employee 360. Upload, download and comment mutation continue through the governed collaboration capabilities when those actions are added to this surface.
- Address remains a truthful unavailable value because the current canonical Employee detail projection does not yet select an employee-owned structured address.
- Emergency contact is a protected JSON object and passport/national identifiers are tokenized fields in `master.person_sensitive_profile`. A later personal-information normalization increment can introduce separately effective-dated dependent, emergency-contact, identity-document and address records without changing the reveal boundary.
- Education, prior employment, health and biography remain nonblocking backlog items as agreed for the pay-cycle demo.
- The existing onboarding/offboarding mutation paths still reference lifecycle/version fields absent from the current case tables. They remain outside this read experience and must be reconciled before those transactional sections are enabled.

The API `asOfDate` is PostgreSQL `current_date`, so it can differ from the browser calendar near midnight.
