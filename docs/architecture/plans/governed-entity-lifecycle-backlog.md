# Governed entity lifecycle backlog

**Status:** Active plan

**Authority:** Implements `../decisions/governed-entity-lifecycle.md`.

This backlog preserves the unresolved work from the 2026-09-03 NEON Business Partner and MESH DDL reviews. Completed findings are deliberately omitted; their proof belongs in completion reports and executable tests.

## Build order

Do not introduce another supplier-, customer-, questionnaire-, invitation-, or workforce-specific revision store. Each wave must preserve the authority boundaries and atomic snapshot/materialization contract in the canonical decision.

### G0 — Contract and compatibility freeze

- Inventory consumers of the existing Business Partner request tables, the `business_partner.aliases` cache and flattened decision-scope columns.
- Assign every compatibility surface an owner, usage measure, compatibility window and removal gate.
- Pin entity-contract releases, hashes and form-template releases used by existing requests.
- Keep S4/S5 certification green throughout the migration.

**Exit gate:** every retained or retired surface has measured usage and an executable disposition; no migration depends on an unversioned form definition.

### G1 — Generic governed case and snapshot pipeline

- Add the minimal `document.entity_change_case` header and bind it to `governance.cycle_run` and `governance.cycle_task` through the proposed cycle subject.
- Add entity-surface component bindings and explicit snapshot lineage.
- Implement canonicalization, schema validation, optimistic versioning, exact idempotent replay and three-way merge/conflict handling.
- Commit case state, immutable snapshot identity/content, workflow decision, normalized authority mutation, audit evidence and outbox atomically.

**Exit gate:** internal registration, profile change and qualification use one contract-bound pipeline without adding section-specific request tables.

### G2 — NEON authority hardening

- Replace remaining polymorphic address/contact ownership gaps with typed, tenant-composite referential integrity or typed binding children.
- Enforce aggregate ownership-percentage rules for Business Partner governance relations.
- Decide whether supplier/customer role history is required; if so, replace uniqueness that permits only one lifetime row with effective-dated non-overlap authority.
- Complete customer lifecycle command coverage and return distinguishable not-found, stale-version and invalid-transition outcomes.
- Replace metadata blocklists with contract allowlists and strengthen URL validation.
- Remove dead person/group category branches from the organization-only Business Partner model after compatibility evidence permits it.

**Exit gate:** every writable authority has one command owner, typed scope, deterministic temporal semantics and live negative/concurrency evidence.

### G3 — MESH registration and relationship capability

- Add a bounded registration-intent/invitation exchange supporting buyer request and supplier self-registration without making MESH the NEON master authority.
- Catalog `relationship_kind` and introduce effective-dated relationship capabilities instead of encoding all collaboration in one flat status.
- Add non-overlap enforcement to account commodity capabilities and support governed relationship episodes/re-onboarding.
- Introduce a potential-relationship/discovery primitive that cannot grant access before counterparty acceptance.
- Bind lifecycle evidence and outbox records exclusively to command execution.

**Exit gate:** invitation, discovery, acceptance, suspension, termination and re-onboarding are capability-scoped, counterparty-safe and replayable.

### G4 — MESH data protection and stewardship

- Stop storing bank-account identifiers in clear text; use encrypted/tokenized storage with masked projections and purpose-bound retrieval.
- Bound and schema-pin account capability and metadata JSON.
- Add structured profile address support and hardened URL semantics.
- Replace hard-coded bank disclosure purposes with a governed catalog.
- Create a dispute/reconciliation path for canonical-party correlation instead of permanent first-writer-wins behavior.

**Exit gate:** protected values never appear in ordinary tables, logs, snapshots, envelopes or browser responses; live probes cover disclosure, revocation and cross-tenant denial.

### G5 — Scenario rollout

- Buyer-requested supplier: request approval, MESH invitation, disclosure, registration approval, materialization, scoped qualification and preference nomination.
- Supplier self-registration: intent, trust/rate/duplicate preflight, sponsor policy, registration, qualification and optional preference.
- Internal-only Business Partner: the same contract, case, snapshot and approval pipeline without a MESH account.
- Customer onboarding and internal/external workforce variants using their own normalized authorities.

**Exit gate:** all scenarios pass clean and supported-upgrade provisioning, exact replay, concurrency, rollback, tenant isolation, maker-checker and audit/outbox tests.

### G6 — Compatibility retirement

- Retire section-specific Business Partner request storage only after migration, consumer cutover, measured zero use and rollback rehearsal.
- Retire flattened decision-scope coordinates and the aliases cache only after their independent observation windows close.
- Remove the temporary implementation inventory when every item has an implementation, ADR rejection or backlog disposition.

**Exit gate:** no active application or integration reads retired surfaces, and clean/upgrade catalogs remain identical.

## Deferred innovation track

These items build on the governed foundation and must not create competing authorities:

- Reusable signed/verifiable supplier evidence with revocation.
- Field-level freshness policies and delta questionnaires.
- Explainable duplicate and merge proposals; AI cannot execute mutations.
- Continuous qualification triggered by certificate, risk, bank or policy changes.
- Privacy-preserving network bank-change fraud signals.
- Historical snapshot simulation before publishing forms or policy releases.

## External governance dependency

Authorization publication remains fail-closed pending the reviewed NEON/MESH physical-table dispositions, MESH operation qualifications and application permission-demand decisions recorded under `policy/reports/`. These are approval dependencies, not reasons to create alternative mutation paths.

