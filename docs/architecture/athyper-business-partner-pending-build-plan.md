# Athyper Business Partner pending build plan

**Status:** Active forward backlog  
**As of:** 2026-08-29  
**Architecture:** [Athyper Business Partner architecture design](./athyper-business-partner-architecture-design.md)  
**Baseline:** `d9bf923d` (`stack-v2-foundation`)

This plan contains only the work still required to reach the target architecture. Completed WP1–16 implementation details and verification evidence remain in the [historical production build plan](./neon-mesh-studio-business-partner-production-build-plan.md).

## 1. Completed foundation

Do not rebuild these capabilities unless a pending package exposes a defect:

| Foundation | Current evidence |
|---|---|
| Domain hardening | Category/ownership split, sealed BP/role statuses, legal classification, and fail-closed migration inventory |
| Person cardinality | Legacy Person-to-BP backfill/cutover, tenant-safe one-to-one link, deferred exact-one enforcement |
| Workforce ranges | Non-overlapping effective employment/work-assignment ranges and primary-row guards |
| Governed request kernel | Draft/read/patch/validate/submit/decide/apply, workflow, evidence, optimistic concurrency, idempotency, snapshots, audit, outbox |
| Commercial materialization | Supplier/customer roles, operating-organization assignments, company profiles and aggregate/readiness foundations |
| Workforce initial materialization | `new_partner`/`add_workforce` creates BP, person, employee, employment, and work assignment atomically |
| Supplier intake | Portal registration mode, hashed single-use invitation lifecycle, restricted applicant path, on-behalf evidence coordinates |
| MESH foundation | Publication, inbox, match/diff/selective acceptance, account/bank linkage, delivery and reconciliation controls |
| STUDIO foundation | Signed definition revision and projection framework |
| Runtime baseline | 2026-08-29 migrations applied and NEON/API/worker/scheduler local stack rebuilt on the baseline commit |

The migration ledger must remain authoritative. Never replay an applied migration by editing it; use a new additive migration.

## 2. Delivery order

```text
P1 request/materializer closure
   +--> P2 workforce completion --------+
   +--> P3 customer parity --------------+--> P6 STUDIO content --> P9 release
   +--> P4 supplier completion ----------+
   `--> P5 invitation generalization ----+

P7 IAM sagas ----------------------------+
P8 MESH closure -------------------------+
```

P1 is the schema/service prerequisite. P2–P5 may proceed in parallel after their shared contracts land. P6 packages the stabilized journeys. P7 and P8 can proceed against pinned contracts. P9 begins only after all functional exit gates pass.

## 3. Pending work packages

### P1 — Complete request kinds and application invariants

**Priority:** P0  
**Depends on:** completed request kernel

Deliver:

- request-kind-aware application-result constraints, not only role-aware constraints;
- idempotent materializers for `amend_partner`, `assign_organization`, `configure_company`, `change_employment`, `deactivate`, `reactivate`, and `archive` where not already authoritative;
- explicit orchestration from `change_bank` to `business_partner_bank_verification`, followed by deprecation of any competing apply path;
- immutable category handling plus a stewarded duplicate merge/re-key/supersession procedure;
- impact/dependency evidence for deactivate, reactivate, and archive;
- typed lifecycle snapshots, outbox events, safe reason codes, and retry fingerprints.

Verify:

- database constraint matrices for every role × request-kind × result combination;
- rollback leaves no partial master rows, audit residue, or failed ledger entry;
- replay returns the original result and a conflicting fingerprint is rejected;
- stale base versions and scope changes fail before writes;
- lifecycle commands preserve transactional/history dependencies.

**Exit:** every accepted request kind has exactly one application authority and deterministic result contract.

### P2 — Finish workforce onboarding and change lifecycle

**Priority:** P0  
**Depends on:** P1

Deliver:

- create one `document.onboarding_case` from each successfully applied workforce-creation request and bind resulting BP/person/employee IDs;
- workforce aggregate, list, detail, review, edit, returned-request, readiness, and onboarding-checklist read models/routes;
- effective-dated `change_employment` materializer that closes/inserts ranges without rewriting history;
- offboarding flow that separates employment termination, resource checklist, and application-access deprovisioning;
- optional principal creation/link plus employer IAM-organization membership through the P7 saga;
- restricted person evidence/PII APIs with field-level redaction, purpose binding, retention, and access audit;
- HR import and approved API adapters using the same request boundary.

Verify:

- concurrent primary employment/assignment attempts cannot overlap;
- employer/company/manager/position compatibility and tenant boundaries fail closed;
- employment succeeds when IAM is unavailable, and IAM retry does not duplicate the person or employee;
- MESH publication and generic BP payloads reject workforce/PII fields;
- browser E2E covers new hire, return/resubmit, rejection, onboarding tasks, job change, and offboarding.

**Exit:** workforce creation, change, onboarding execution, and offboarding are end-to-end without a parallel person materializer.

### P3 — Deliver customer onboarding parity

**Priority:** P0  
**Depends on:** P1

Deliver:

- first-class customer new/add-role wizard, review, aggregate, readiness, lifecycle, and company configuration UI/API;
- customer invitation/self-service facade where product policy allows external registration;
- sales-organization scope validation, credit/commercial review aggregate, AR company-profile gates, and activation command;
- policy-controlled person-category customer materialization that creates BP + person + customer but not workforce records;
- customer MESH buyer selective-acceptance mapping and portal IAM projection;
- customer-specific validation, evidence, permissions, SoD, SLA, and reason codes.

Verify:

- supplier/customer dual-role uses two approvals against one identity;
- customer credit decisions are independent from registration approval;
- person customer and organization customer cardinality constraints both pass;
- unauthorized procurement/sales/company cross-scope access is denied;
- browser E2E covers internal, external, MESH, return/resubmit, activate, suspend, and reactivate paths.

**Exit:** customer onboarding has functional, control, and UX parity with supplier onboarding.

Implementation evidence (2026-08-29): NEON now provides internal organization/person customer onboarding, independent add-role approval, customer-scoped invitations and applicant self-service, company-scoped credit review with maker/checker, AR readiness, immutable activation/suspension/reactivation evidence, buyer-role MESH selective acceptance, and a portal-IAM projection intent. The customer control UI and production browser matrix cover the governed internal, external, MESH, returned, and lifecycle paths; runtime execution still requires the production-session fixture variables documented by the E2E suite.

### P4 — Close supplier readiness and lifecycle

**Priority:** P0  
**Depends on:** P1

Deliver:

- authoritative supplier activation command driven by readiness evidence;
- amendment, organization assignment, company setup, deactivate/reactivate/archive flows;
- restricted external facade for evidence upload, returned-request correction, status, rate limiting, abuse protection, and support recovery;
- explicit readiness reason codes for qualification, effective scope, company profile, blocks, risk, and bank verification;
- bank-change orchestration consolidation and removal of competing authority;
- requalification/expiry and activation reevaluation jobs.

Verify:

- registration approval never implies qualification, bank approval, or activation;
- preference cannot substitute for qualification;
- expired qualification or bank evidence removes only the affected readiness capability;
- external applicants cannot reach workflow decisions, activation, finance, master mutation, or other tenants;
- lifecycle and emergency block preserve all historic documents.

**Exit:** an approved supplier progresses through qualification and finance controls to activation, suspension, reactivation, and archive with auditable readiness.

Implementation evidence (2026-08-29): the NEON service now separates registration, qualification, preference, bank verification, and supplier activation authorities; persists immutable activation/readiness and support-recovery evidence; exposes only applicant-owned external status/correction/evidence operations behind abuse controls; and registers qualification-expiry plus activation-reevaluation jobs. Coverage is in `server/db/scripts/__tests__/business-partner-supplier-readiness-lifecycle.test.ts` and the master-data service suite.

### P5 — Generalize invitations across journeys

**Priority:** P1  
**Depends on:** P1; coordinates with P2–P4

Deliver:

- additive `document.business_partner_invitation` schema with journey kind, registration mode, role, typed commercial/workforce scope, token/email hashes, applicant/request links, version, and idempotency;
- compatibility view/adapter for `supplier_registration_invitation` until all consumers migrate;
- supplier, customer, and candidate templates plus resend/cancel/expire/accept flows;
- restricted applicant principal/session policy and recovery controls;
- migration, dual-read/controlled-write rollout, consumer cutover, and later compatibility retirement.

Verify:

- raw secrets never persist or enter logs; tokens are tenant-bound, expiring, and single use;
- resend/cancel/accept races produce one deterministic outcome;
- acceptance and request creation are recoverable without duplicate principals or requests;
- each journey exposes only its approved fields and actions.

**Exit:** one invitation aggregate supports all onboarding journeys with no supplier-only authority leak.

Implementation evidence (2026-08-29): NEON now has a generalized supplier/customer/candidate invitation contract, typed commercial/workforce scopes, hashed one-time secrets, OCC resend/cancel/expire/accept transitions, atomic request and restricted-applicant binding, idempotent recovery intent, journey field/action allowlists, a read-only supplier compatibility projection, and controlled-write compatibility routes. Composition uses only the generalized repository. Rollout and later compatibility retirement are documented in `business-partner-invitation-rollout.md`; live database and authenticated production journeys remain environment-gated.

### P6 — Complete and activate STUDIO definition bundles

**Priority:** P1  
**Depends on:** stable P2–P5 contracts

Deliver:

- signed bundles for supplier new/add/qualify/company/bank, customer new/add/credit/company, and workforce new/add/change/offboard;
- organization/person field visibility, validation and duplicate rules;
- internal, portal, MESH, import, and API mappings;
- workflow stages, SoD, SLA/escalation, evidence policy, readiness gates, and reason-code catalog;
- NEON form/list/detail/review descriptors and MESH-safe schemas;
- compatibility declarations, compile reports, staged activation, canary, rollback, and last-known-good offline use.

Verify:

- signature/hash/schema compatibility rejection and downgrade protection;
- deterministic compile output and consumer contract tests;
- NEON/MESH continue transactions while STUDIO is unavailable;
- canary and rollback retain the exact prior active revision.

**Exit:** all journeys are definition-driven from verified local projections, with no hard-coded policy fork.

Implementation evidence (2026-08-29): the `business_partner.onboarding` v2 source bundle now covers the full supplier/customer/workforce journey matrix, party visibility/validation/duplicate rules, five ingress mappings, workflow/SoD/SLA/evidence/readiness/reasons, NEON descriptors, and MESH-safe schemas. Publication deterministically compiles and Ed25519-signs plane projections with source/compiled hashes and compile reports; the loader rejects signature, hash, schema, plane, compatibility, source-contract, and downgrade failures. NEON request schemas/workflows/descriptors and MESH profile allowlists resolve only from verified local last-known-good heads. Activation-head guards and the canary restore the exact prior revision tuple. The staged activation and outage/rollback procedure is documented in `business-partner-definition-bundle-rollout.md`; live three-plane migration, signing, canary, and authenticated production journeys remain environment-gated.

### P7 — Complete TrustIAM/Keycloak organization and identity sagas

**Priority:** P1  
**Depends on:** stable identity and invitation contracts; can start after P1

Deliver:

- desired-state organization projection for supplier/customer portal organizations and tenant employers;
- identity invite/create/reconcile, organization membership, application projection, suspension, and deprovisioning sagas;
- provider idempotency keys, fencing/version checks, retry/backoff, dead-letter, operator replay, and reconciliation;
- local principal/identity binding and scoped role assignment separate from provider membership;
- employer membership for workforce users and contact membership for supplier/customer users;
- provider-unavailable and partial-success recovery runbooks.

Verify:

- duplicate/out-of-order callbacks cannot regress state or duplicate users/organizations;
- provider attributes never grant business permission or scope;
- access deprovision does not erase person/employment or BP history;
- stale retries are fenced and privileged replay is MFA/SoD protected;
- periodic reconciliation detects missing, extra, or mismatched projections.

**Exit:** IAM desired and observed state converge safely while plane-local authorization remains authoritative.

### P8 — Close MESH publication, matching, and relationship wiring

**Priority:** P1  
**Depends on:** P1 and stable customer/supplier contracts

Deliver:

- supplier and customer/buyer publication/mapping parity with pinned definition/source hashes;
- person/workforce denial at service, schema, database, publication, and replay boundaries;
- complete selective-acceptance diff and duplicate-resolution UX;
- account-purpose/cardinality checks and governed link approve/reject/revoke lifecycle;
- withdrawal, suspension recommendation, delivery retry/quarantine/replay, and reconciliation dashboards;
- separately verified, masked bank disclosure with no direct NEON bank mutation;
- staged delivery/reconciliation feature flags and production canary procedure.

Verify:

- duplicate, late, reordered, corrupt, unsigned, and incompatible events;
- participant/tenant isolation and unauthorized relationship access;
- MESH suspension cannot silently change NEON BP status;
- replay is idempotent and reconciliation reports—not auto-overwrites—authority conflicts;
- no restricted field appears in payload, outbox, quarantine, log, or metric.

**Exit:** supplier and buyer organization data crosses MESH end-to-end without authority leakage or person-data exposure.

### P9 — Production qualification and release certification

**Priority:** P0 release gate  
**Depends on:** P1–P8

Deliver:

- migration preflight, forward-only deployment, rollback/roll-forward, backup/restore and disaster-recovery evidence;
- concurrency, idempotency, load, queue backpressure, poison-message, replay and reconciliation tests;
- authorization/RLS negative suite, privacy review, threat model, secret/log scan, retention/export/delete controls;
- accessibility and supported-browser evidence for all internal/external journeys;
- dashboards and alerts for request age/failure, workflow SLA, materialization, invitation abuse, outbox lag, quarantine, IAM drift, MESH drift, and readiness failures;
- staged environment rollout, canary cohort, rollback criteria, support runbooks, training, and named sign-offs.

Verify release gates:

| Gate | Required evidence |
|---|---|
| Database | Clean migration rehearsal on production-shaped data; constraints/RLS validated; restore proven |
| Domain/service | Full request-kind matrix, concurrency, idempotency and atomic rollback |
| Cross-plane | Definition signature, MESH replay/quarantine/reconciliation, IAM convergence/fencing |
| Security/privacy | Threat model, negative authorization, PII/bank non-leakage, retention and access audit |
| UX | Supplier, customer, workforce and external invitation E2E plus accessibility |
| Operations | SLOs, alerts, dashboards, runbooks, rollback and DR drill |
| Ownership | NEON, MESH, STUDIO/IAM, security/privacy, operations and product acceptance |

**Exit:** staged production canary meets SLO/error thresholds, reconciles cleanly, and every named owner certifies release.

## 4. End-to-end wiring ledger

This table is the live progress index. Update evidence links and status in the same commit as each completed slice.

| Capability | NEON DB/service | NEON UI | MESH | STUDIO | IAM | Status / closing package |
|---|---:|---:|---:|---:|---:|---|
| Supplier registration/request apply | Done | Done | Done for intake | Foundation | Partial | Partial — P4, P6, P7 |
| Supplier qualification/readiness/activation | Done | Partial | N/A | Foundation | N/A | P4 backend closed; definition-driven UX remains P6 |
| Customer onboarding and credit/readiness | Done | Done | Done for buyer intake | Foundation | Projection intent | P3 core closed; definition, saga monitoring, and evidence console remain P6–P8 |
| Workforce person creation | Done | Initial route | Denied by design | Foundation | Partial | Partial — P2, P6, P7 |
| Workforce change/onboarding/offboarding | Partial | Pending | Denied by design | Foundation | Partial | Pending — P2, P6, P7 |
| Lifecycle request kinds | Partial | Partial | Recommendations only | Foundation | Partial | Pending — P1–P4, P6, P7 |
| Cross-journey invitation | Supplier only | Supplier only | N/A | Foundation | Partial | Pending — P5–P7 |
| MESH buyer/supplier publication and link | Partial | Partial | Foundation complete | Foundation | N/A | Pending closure — P8 |
| Definition-driven all-journey UX/policy | Consumer foundation | Partial | Consumer foundation | Foundation | N/A | Pending content/activation — P6 |
| IAM organization/user convergence | Local bindings foundation | Partial | Account coordinate | Desired-state foundation | Partial | Pending — P7 |
| Production certification | Dev baseline | Dev baseline | Partial evidence | Partial evidence | Partial evidence | Pending — P9 |

`Done` means implemented and covered by current baseline evidence, not automatically production-certified. `Partial` means one or more required planes, journeys, controls, or release proofs remain.

## 5. Slice discipline

Every implementation slice must include, in the same change set:

1. domain/contract decision and compatibility impact;
2. additive canonical DDL plus forward migration and generated projections;
3. repository/service/API/UI or worker wiring needed for an executable vertical path;
4. permissions, scope checks, forced RLS, audit, snapshot/outbox, and idempotency;
5. unit, database, contract, integration, negative authorization, and relevant browser tests;
6. deployment/reconciliation/rollback notes and evidence links;
7. an update to the wiring ledger above.

Avoid schema-only slices that leave an accepted but unused authority, and avoid UI/API paths that bypass the governed request materializer.

## 6. Immediate next slice

Begin with **P1 request/materializer closure**, narrowly scoped to lifecycle commands:

1. inventory existing `amend_partner`, `deactivate`, `reactivate`, and `archive` paths and consumers;
2. add request-kind-aware result constraints and lifecycle impact evidence;
3. implement one command at a time through validate → approve → apply → snapshot/outbox;
4. start with `amend_partner`, then `deactivate/reactivate`, then `archive`;
5. run atomic rollback, idempotency, stale-version, RLS, SoD, and preservation-of-history tests;
6. only then start the P2 onboarding-case materialization slice.

This ordering closes the common governance kernel before customer, supplier, and workforce teams add journey-specific behavior.
