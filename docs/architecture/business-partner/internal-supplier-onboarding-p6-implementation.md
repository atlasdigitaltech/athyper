# P6 — Materialization and activation

Status: **accepted for the local DEV Increment A purchasing pilot** (2026-09-14).

Basic, Standard and Enhanced have completed independent qualification, company setup, activation, document generation and final closure through authenticated owning APIs. Shared completion and linked-work gates are qualified against PostgreSQL. P7–P9 and follow-ups B/C remain separate scopes. The bank fixture boundaries below are part of this acceptance record.

## Implemented contracts

- Generic cycle completion and the Business Partner coordinator use `governance.evaluate_cycle_completion`. It evaluates mandatory tasks on the current process attempt, active child runs and open critical deviations. Historical cancelled attempt tasks do not block a completed current review.
- The supplier evaluator adds exact selection, approved decision, successful materialization, current organization/company eligibility, qualification, commercial/payment applicability, bank verification, risk/blocks, activation evidence, matching activation confirmation and linked case work. Approval cannot certify supplier qualification.
- The existing eligibility repository supplies current facts. Its operational evidence includes identity/role versions, assignment and company-profile update coordinates, payment/bank identifiers, current company-bank acceptance and safe verification coordinates; account values are not projected.
- A scoped immutable activation-policy publication owns purchasing/payment applicability. The canonical NEON pilot publication specifies purchasing activation; payment readiness still requires commercial setup and a verified bank. Missing or overlapping current policies block progression.
- Activation-case validation requires current business date, supplier version, policy revision and readiness fingerprint. Materialization locks the supplier, re-evaluates the existing readiness owner, checks those coordinates and reuses the lifecycle owner. A dedicated database command records materialization, snapshot lineage, command evidence and outbox evidence under the case mutation guard.
- Company setup, bank-change and activation cases targeting the same materialized supplier and exact scope are linked to the original active run through a governed command. Outstanding linked cases block closure.
- Completion requires expected run version and idempotency key. It persists its evaluated evidence, returns the stored row and replays that receipt. Database guards reject altered process pins, missing materialization/activation evidence and terminal mutations. One committed `business_partner.supplier.onboarding.completed` event is emitted.

## Owning APIs

`GET /api/governance/supplier-onboarding/runs/:runId/readiness` uses scoped case-read authorization. It returns named gates, owners, next actions, current evidence, run version and activation-proposal coordinates.

`POST /api/governance/supplier-onboarding/runs/:runId/completion` uses scoped case-materialization authorization and accepts `{ expectedVersion, idempotencyKey }`. It rechecks completion inside the locked run transaction. NEON relays both routes. Generic process-run cancellation requires the owning case command.

## Qualification recorded

See [P6 evidence](internal-supplier-onboarding-p6-evidence.json).

| Evidence | Result and boundary |
| --- | --- |
| Unit and integration tests | 127 passed: cycle service/repository 26; case service/view and eligibility 87; backend operation mapping 14 |
| Completion database checks | 13 passed, including immutable pins, overlapping policy rejection, guarded closure, exact replay and one completion event |
| Fresh authenticated journeys | All three profiles independently reviewed, materialized, qualified, company-configured and activated through owning APIs |
| Documents and closure | Real activation confirmations generated automatically; authenticated PDF downloads/hash checks, render replay, stale closure rejection, final closure and exact closure/activation replay passed for all three profiles |
| Browser | Chromium loaded each existing request screen and verified current readiness against the owning API; screenshots retained in the evidence report |
| Company admission | Five canonical PostgreSQL guard scenarios passed, including unlinked/missing-policy rejection and required currency; three real company materializations passed |
| Payment and stale evidence | Three profile fixtures passed missing terms/bank, verified payment readiness, revoked company acceptance, expired/unverified bank, safe evidence and stale activation version/fingerprint checks |
| Linked bank work | Real app-role draft/link/validation/submission/rejection commands prove that open bank work blocks closure, repeated linking is idempotent and independent rejection releases the gate |
| Durable receipts | Each fresh run has exactly one completion event, activation receipt, company link and activation link; missing-source bank commands create no cases |
| Access cleanup | User-approved temporary DEV grants applied through canonical authorization management commands and revoked after qualification |

The fresh supplier, company, qualification, activation, document and closure journeys use authenticated APIs and real committed outcomes. Risk assessments remain explicitly declared upstream fixtures.

Payment tests use transaction-local commercial and bank inputs with the existing PostgreSQL readiness owners. Bank linkage tests use transaction-local draft/validation inputs and real governed commands, including an independent rejection actor. These tests roll back all fixture writes. The bank-change API separately rejects missing current Mesh source disclosure without creating a case. An external Mesh disclosure and bank-verification API journey is **not** claimed by this P6 gate qualification.

## Corrections found during qualification

Qualification uses the existing action mapping instead of an incomplete entity-operation coordinate. Creation and child decisions remain distinct, missing grants still deny, and an unbound child decision is not remapped to creation under target enforcement. Activation checks the supplier's organization/company scope separately from case materialization authority. The canonical audit contract now covers `business_partner.supplier.activated`.

Payment readiness now calls `master.bank_account_company_ready`, so revoked company acceptance blocks payment even when the account remains verified. The evidence includes current company usage/acceptance coordinates. A failing PostgreSQL regression demonstrated the previous gap before the fix.

Purchasing company setup reuses the existing materializer with a scoped exception for linked active P6 runs under exactly one current purchasing policy. Currency remains required; payment policies and other company cases retain commercial and bank requirements.

## Reproduction

Canonical definitions install with `node tooling/scripts/verification/install-supplier-onboarding-completion-storage.mjs`. This is the direct local-build path; no migration package is introduced.

The `qualify-supplier-onboarding-*` scripts retain mutation receipts for resumed live runs. The company, payment, bank-link and completion database scripts run against retained fixtures and roll back their test writes. `record-supplier-onboarding-completion-evidence.mjs` refuses acceptance if required reports or temporary-grant revocation are missing.

Temporary access is documented in [the reviewed DEV proposal](internal-supplier-onboarding-p6-dev-access-proposal.md). The existing permission catalog required organization/subtree grants for qualification management and activation; the user approved that revised scope. Grants had a 24-hour expiry and were revoked immediately after qualification. Future live activation mutations require appropriately authorized sessions; the verification scripts do not regrant access automatically.
