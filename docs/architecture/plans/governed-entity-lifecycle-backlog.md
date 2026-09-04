# Governed entity lifecycle backlog

**Status:** Active plan

**Authority:** Implements `../decisions/governed-entity-lifecycle.md`.

This backlog preserves the unresolved work from the 2026-09-03 NEON Business Partner and MESH DDL reviews. Completed findings are deliberately omitted; their proof belongs in completion reports and executable tests.

## Build order

Do not introduce another supplier-, customer-, questionnaire-, invitation-, or workforce-specific revision store. Each wave must preserve the authority boundaries and atomic snapshot/materialization contract in the canonical decision.

### G0 — Contract and compatibility freeze

- Inventory consumers of the existing Business Partner request tables, the `business_partner.aliases` cache and flattened decision-scope columns.
- Give the migration-only `document.workforce_iam_projection` an explicit disposition: consolidate it into canonical DDL for supported upgrade parity, replace it through the governed-case/IAM projection design, or retire it after consumer migration. Do not leave it as an unexplained migration-only authority.
- Assign every compatibility surface an owner, usage measure, compatibility window and removal gate.
- Pin entity-contract releases, hashes and form-template releases used by existing requests.
- Keep S4/S5 certification green throughout the migration.

**Exit gate:** every retained, replaced or retired surface—including `document.workforce_iam_projection`—has measured usage and an executable disposition; no unexplained migration-only object remains and no migration depends on an unversioned form definition.

### G1 — Generic governed case and snapshot pipeline

- Before adding DDL, run a minimal-schema review of all nine proposed relations: `document.entity_case`, `document.entity_case_command_evidence`, `document.entity_case_validation`, `document.entity_case_materialization`, `snapshot.entity_case_snapshot_lineage`, `governance.cycle_subject`, `metadata.entity_surface_component_binding`, `governance.authority_register` and `mesh.network_relationship_capability`. For each relation, prove that an existing authority cannot safely carry the required identity, lifecycle, cardinality and retention contract. Record accepted, merged and rejected dispositions.
- Add only the accepted minimal `document.entity_case` family and bind its header to `governance.cycle_run` and `governance.cycle_task` through the accepted subject model.
- Add entity-surface component bindings and explicit snapshot lineage only when the minimal-schema review demonstrates that existing metadata and snapshot relations cannot enforce the contract.
- Implement canonicalization, schema validation, optimistic versioning, exact idempotent replay and three-way merge/conflict handling.
- Commit case state, immutable snapshot identity/content, workflow decision, normalized authority mutation, audit evidence and outbox atomically.

**Exit gate:** the nine-relation disposition is recorded and tested; internal registration, profile change and qualification use one contract-bound pipeline without unnecessary relations or section-specific request tables.

### G2 — NEON authority hardening

**Status (2026-09-04): complete.** Canonical and supported-upgrade DDL now enforce exact commercial-role pairs, typed owner bindings, aggregate percentages, the approved stable-role history model, five-action Customer lifecycle ownership, metadata allowlists and hardened HTTPS URLs. Clean and supported-upgrade S4/S5 plus focused negative/replay/concurrency evidence are recorded under `docs/architecture/reports/g2-*`. Historical person/group compatibility is explicitly retained—not removal-eligible—under `config/governance/business-partner-organization-only-compatibility.v1.json` until the G0 consumer and usage-window gates pass.

- Certify the existing composite Business Partner/role FK coverage for qualification, supplier preference, customer designation and credit review. Add a role coordinate only when that aggregate owns the role; do not add nullable role columns merely for structural symmetry.
- Replace remaining polymorphic address/contact ownership gaps with typed, tenant-composite referential integrity or typed binding children.
- Enforce aggregate ownership-percentage rules for Business Partner governance relations.
- Decide whether supplier/customer role history is required; if so, replace uniqueness that permits only one lifetime row with effective-dated non-overlap authority.
- Treat customer command ownership as landed and S5-certified. Decide and implement the remaining lifecycle semantics explicitly: the current command covers `activate`, `suspend` and `reactivate`, but not `deactivate` or `archive`; every supported action must return distinguishable not-found, wrong-tenant, stale-version and invalid-transition outcomes.
- Replace metadata blocklists with contract allowlists and strengthen URL validation.
- Validate historical rows against the prospectively enforced organization-only Business Partner constraint, then retire the `person`/`group` domain values and compatibility branches after preflight and consumer evidence permit it.

**Exit gate:** composite FK coverage is certified, historical organization-only validation is complete, compatibility branches have an explicit disposition, and every writable authority has one command owner, typed scope, deterministic temporal semantics and live negative/concurrency evidence.

### G3 — MESH registration and relationship capability

**Status (2026-09-04): complete.** The bounded, contract-pinned registration exchange now supports buyer request, supplier self-registration and discovery nomination without creating NEON authority. Relationship capabilities are independently effective-dated and command-owned; requested discovery is limited to non-authorizing profile exchange. Clean and supported-upgrade evidence covers bilateral acceptance, exact replay, suspension, termination, re-onboarding, stale-version concurrency, rollback, wrong-participant denial, RLS and atomic audit/outbox evidence.

- Treat `mesh.network_relationship_capability` as genuine new construction, subject to the G1 minimal-schema decision; it must not be simulated with more nullable fields or unbounded JSON on the relationship head.
- Add a bounded registration-intent/invitation exchange supporting buyer request and supplier self-registration without making MESH the NEON master authority.
- Catalog `relationship_kind` and introduce effective-dated relationship capabilities instead of encoding all collaboration in one flat status.
- Add non-overlap enforcement to account commodity capabilities and support governed relationship episodes/re-onboarding.
- Introduce a potential-relationship/discovery primitive that cannot grant access before counterparty acceptance.
- Bind lifecycle evidence and outbox records exclusively to command execution.

**Exit gate:** invitation, discovery, acceptance, suspension, termination and re-onboarding are capability-scoped, counterparty-safe and replayable.

### G4 — MESH data protection and stewardship

**Status (2026-09-04): complete.** Canonical MESH authority and the populated supported-upgrade path now remove clear bank identifiers through fail-closed encrypted conversion. Purpose-bound retrieval is restricted to a dedicated broker role and requires an active catalog purpose, recipient, disclosure version and payments capability; rotation, revocation, leakage, bounded contract JSON, structured addresses, hardened URLs and stewarded correlation disputes have clean and supported-upgrade evidence under `docs/architecture/reports/g4-*`.

**P0 security correction:** stop storing bank-account identifiers in clear text before expanding MESH onboarding or relationship capabilities. Use encrypted/tokenized storage with masked projections, purpose-bound retrieval, key rotation, audit evidence and a migration strategy that does not copy protected values into ordinary snapshots, envelopes or logs.

- Bound and schema-pin account capability and metadata JSON.
- Add structured profile address support and hardened URL semantics.
- Replace hard-coded bank disclosure purposes with a governed catalog.
- Create a dispute/reconciliation path for canonical-party correlation instead of permanent first-writer-wins behavior.

**Exit gate:** protected values never appear in ordinary tables, logs, snapshots, envelopes or browser responses; live probes cover disclosure, revocation and cross-tenant denial.

### G5 — Scenario rollout

**Status (2026-09-04): complete.** All four Business Partner/customer rows now use release-pinned G1 cases and a domain-owned G2 materializer, with hash-bound G3 registration evidence and purpose-bound G4 disclosure evidence where applicable. The rollback-contained clean and pinned-baseline upgrade matrices cover maker-checker, exact replay, stale/wrong-tenant denial, normalized role/scope mutation, snapshot lineage, audit/outbox atomicity and zero legacy request writes. Workforce clean/upgrade evidence remains green. The empty production evidence-checkpoint ledger is an independent G0/G1 compatibility gate and no retained surface is removal-eligible from G5 completion.

- Buyer-requested supplier: request approval, MESH invitation, disclosure, registration approval, materialization, scoped qualification and preference nomination.
- Supplier self-registration: intent, trust/rate/duplicate preflight, sponsor policy, registration, qualification and optional preference.
- Internal-only Business Partner: the same contract, case, snapshot and approval pipeline without a MESH account.
- Customer onboarding and internal/external workforce variants using their own normalized authorities.
- Add live external-worker IAM tests covering provisioning from an approved worker engagement, exact replay, suspension/termination deprovisioning, authorization-epoch invalidation, retry recovery, wrong-tenant rejection and rollback without recreating Person, worker or engagement authority.

**Exit gate:** all scenarios—including external-worker IAM provisioning and deprovisioning—pass clean and supported-upgrade provisioning, exact replay, concurrency, rollback, tenant isolation, maker-checker and audit/outbox tests.

### G6 — Compatibility retirement

**Local-development closeout (2026-09-04): complete.** The repository owner explicitly accepted local data loss and broken legacy request/invitation runtime paths. The temporary implementation inventory was removed and all five database retirement candidates were applied atomically to `athyper-dev-db-1/athyper_neon`, without using or weakening production authorization. The alias application-index view and normalized customer current views were repaired during execution. Exact hashes, removed-row counts, database identity, backup location, postconditions and residual runtime consequences are recorded in `docs/architecture/reports/g6/local-development-retirement-2026-09-04.json`. This local closeout supersedes the earlier local blocked-at-zero statement below; production remains independently fail-closed at order zero.

**Status (2026-09-04): open and fail-closed.** The fixed 30-day production-observation minimum remains removed. Production retirement requires 14 consecutive zero-use days; a separate `local_development` evaluation profile now waives only that observation checkpoint, requires a fresh zero-consumer inventory instead, and can never authorize production retirement. Canonical and supported-upgrade commands now write normalized decision scopes without flattened writer inputs; internal workforce producers emit the governed employment identity intent without using `document.workforce_iam_projection`; and active person/group compatibility branches are removed. The refreshed classified inventory records zero runtime references for aliases, flattened scope, workforce IAM projection, person/group compatibility and the temporary inventory. Business Partner 360 summaries, activity/explainability, bank-linkage readiness and platform health now read the governed case family. The request-family cutover foundation adds an exclusive governed-case invitation coordinate and an explicit release-bounded command that backfills historical requests into same-identity entity cases with pinned contract/form coordinates, immutable snapshots, command evidence and one completion outbox; it deliberately does not dual-write or copy protected extension values. Its rollback-contained exact-replay and dual-binding negative probes pass on clean and pinned supported-upgrade builds. Production observation instrumentation and a two-checkpoint recorder remain executable for production: absent metric series cannot become zero, database activity is derived from uninterrupted start/end `pg_stat_statements` deltas, and release/source/database/query/result/inventory identities are hash-bound. No authentic production checkpoint has yet been recorded. Clean and supported-upgrade builds have exact pre-retirement parity across 1,268 captured catalog entries and 1,468 privilege entries; the shared hashes are recorded under `docs/architecture/reports/g6/`. The six-surface recovery rehearsal is executable against an attested, recent, isolated production-backup clone. It applies each surface-specific hashed retirement migration only in a forced-rollback transaction and emits count/hash, RTO/RPO, operator and result evidence; a live backup-clone execution has not yet been supplied, so no rollback gate is marked passed. Approval packets are executable per surface: preparation requires all qualifying evidence, each role signs the complete immutable hash set with a distinct Ed25519 key and substantive role-specific statements, and the retirement evaluator re-verifies signatures, independence and referenced files. Names, checkboxes and legacy approval arrays cannot pass. The six retirement actions are staged in the required order outside the active migration manifest. The apply command permits only the next surface and binds one approval-packet hash, migration hash and database identity under transaction/advisory locking; production, clean and supported-upgrade executions emit separate immutable receipts. Certification requires all five behavioral probe classes and exact post-retirement clean/upgrade catalog and privilege equality, otherwise it aborts for rehearsed recovery or a separately reviewed forward fix. No signed packet has been supplied and the sequence remains at order zero. Two coupled runtime consumers remain: the section-specific request repository and invitation facade. The temporary inventory has a durable backlog disposition but remains retained until approval. In local development all observation gates now pass, but removal still requires the final request-family consumer cutover, successful per-surface rehearsal reports, signed approvals and pre/post-retirement parity. The local cleanup evaluator therefore remains correctly blocked at zero retirements, and no retirement DDL is active.

- For every compatibility surface, capture clean-versus-supported-upgrade canonical catalog and privilege parity immediately before retirement and again after the retirement migration. Any unexplained difference blocks removal.
- Retire section-specific Business Partner request storage only after migration, consumer cutover, measured zero use, rollback rehearsal and the before/after parity gates pass.
- Retire flattened decision-scope coordinates and the aliases cache only after their independent observation windows close and the before/after parity gates pass.
- Remove the temporary implementation inventory when every item has an implementation, ADR rejection or backlog disposition.

**Exit gate:** no active application or integration reads retired surfaces; each retirement has durable pre/post parity evidence; clean and supported-upgrade catalogs and privilege surfaces remain identical.

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
