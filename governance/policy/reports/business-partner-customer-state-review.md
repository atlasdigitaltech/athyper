# BP-Q002 Customer state review

Status: pending NEON Master Data product approval. Prepared 2026-09-05.
No approval has been inferred from the implementation or from passing tests.

## Decision for review

Approve the following implemented state semantics, including the corrected
reactivation readiness behavior, or identify the required changes.

| Action | Allowed source | Result | Readiness | Permission |
| --- | --- | --- | --- | --- |
| Activate | `prospect` | `active` | Current scoped `activation` readiness must pass | `neon.customer.lifecycle.activate` |
| Suspend | `active` | `suspended` | Does not require eligible readiness | `neon.customer.lifecycle.suspend` |
| Reactivate | `suspended` | `active` | Current scoped `activation` readiness must pass | `neon.customer.lifecycle.reactivate` |
| Deactivate | `active`, `suspended` | `inactive` | Does not require eligible readiness | `neon.customer.lifecycle.deactivate` |
| Archive | `inactive` | `archived` | Does not require eligible readiness | `neon.customer.lifecycle.archive` |

`inactive` is the persisted state; `deactivated` names the event. There is no
reactivation from `inactive`, no unarchive command, and no deletion of identity
or independent credit/designation evidence. Archival does not itself certify
that a retention period has elapsed. Product must confirm whether an additional
retention prerequisite is required before archive.

All commands require a tenant-bound Customer/BP pair, an active sales-organization
and company assignment at the business date, the expected Customer version,
a reason code, an idempotency key and the action-specific authorization. The
SQL command increments the version and retains an immutable lifecycle event.
The service records audit and lifecycle outbox evidence transactionally. Same
key/different command conflicts; target replay evidence remains required.

Both activation and reactivation use the activation readiness operation, matching
the Customer controls UI. Suspended Customers may pass this check when the other
gates pass. Normal `order` readiness still rejects suspended Customers. An
order-specific block remains an order restriction; product must explicitly
confirm that activation-operation blocks, rather than every order-specific
block, govern reactivation. Credit, risk, company profile, payment terms and
scope prerequisites remain effective. Readiness never changes lifecycle state.
Designation decisions remain independent and do not implicitly activate a Customer.

Lifecycle commands request the Customer portal/IAM projection with desired state
`active` for activate/reactivate and `inactive` for suspend/deactivate/archive.
An outbox request is not proof that access changed. Target worker consumption,
notification delivery and reconciliation still need retained evidence. Recovery
must use authorized commands and replay/reconciliation; direct master-status
updates cannot serve as rollback.

## Evidence and remaining release gates

- Production resolver regression: `customer-readiness-repository.test.ts` proves
  suspended activation versus blocked orders, terminal-state rejection, and
  preservation of credit and operational-block prerequisites.
- `customer-onboarding-service.test.ts` exercises all five successive versions
  and now checks the reactivation operation instead of masking the suspended
  state behind a permissive mock.
- `pnpm test:e2e:bp-r5` contains two mandatory tests: Customer create/submit/approve/materialize with lineage and
  the credit/designation/readiness/five-button lifecycle/reconciliation journey.
  The latter retains allowlisted IDs, states, versions and event/fingerprint
  coordinates, including partial progress when a command fails. It consumes a
  disposable prospect and ends at archive; retries are disabled.
- BP-CUS-001 now has a real onboarding mutation test. Its target execution and
  R2's BP-CUS-002/003 role-extension target receipts remain release prerequisites.
- Lifecycle replay and stale/conflicting/invalid-transition checks are authored;
  their target execution plus wrong-tenant/permission-denied target results and downstream portal/IAM/notification delivery remain required in
  addition to the mandatory control journey.

## Target preparation

Run `pnpm preflight:e2e:bp-r5` to inspect missing names without printing secrets.
Configure its three distinct actor credentials, sales-organization UUID and three
R5 control UUIDs through the target's secret/environment mechanism. Select the same AR
company in the checker actor's work context. The checker requires credit and
designation decision permissions and all five lifecycle permissions; the maker
requires scoped create/read access.

Use a disposable Customer in `prospect` with an empty credit scope,
active BP and sales/company assignments, active AR profile and payment terms,
current approved risk assessment, and no activation block. The onboarding test creates a separate new Customer case; the control fixture
is synthetic and is not onboarding evidence. Run the suite only against that resettable target.
After a mutation failure or successful archival, provision a fresh fixture;
do not delete immutable evidence to make the test rerunnable.

Retain sanitized command proof and the target result with deployment revision,
run date and fixture coordinates. Browser discovery and local tests are not a
passing target receipt. Existing development users were previously reported to
lack the required scoped create authority; credentials alone do not resolve that.

## Approval record to complete

The accountable owner is **NEON Master Data**, as assigned in the decision
register. A named authorized reviewer must record the decision, timestamp,
approved document revision/hash, any conditions (especially archive retention
and reactivation block semantics), and durable approval evidence reference.
Until that record exists, BP-Q002 and R5 product approval remain pending.

The [R5 qualification runbook](../../runbooks/business-partner-r5-qualification.md)
describes fixture provisioning and the six receipt gates. The current build also
fixes the shared Customer AR-profile trigger and retains a rollback-only
PostgreSQL regression probe. The Customer portal/IAM consumer now exists locally, reusing approved contact
projections and preserving their application grants. It stages active, suspended
or deprovisioned identity state and retains consumption only after exact saga
success. Operator in-app delivery is also wired. Deployment, approved bindings
and actual downstream receipt capture remain pending.
