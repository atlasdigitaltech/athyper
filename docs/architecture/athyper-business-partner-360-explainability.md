# Business Partner 360 explainability (BS360-06)

Status: In progress

## Boundaries

The Requests section reads the governed Business Partner request aggregate and returns workflow coordinates, status timestamps, a metadata-only evidence manifest, and immutable materialization coordinates. It never selects `proposed_payload`, validation evidence payloads, evidence hashes, or attachment content. All links lead to the owning request surface, where authorization is evaluated again.

Governance Activity is distinct from Business Activity. Governance Activity maps allowlisted mutation codes into a public item containing who, what, when, source service, request coordinate, safe changed-field names, and a governed evidence link. The SQL projection does not select audit `old_values` or `new_values`. Changed fields pass through a second allowlist, and an unknown Business Partner mutation throws `BP_360_ACTIVITY_EVENT_UNMAPPED` instead of falling back to raw metadata or a generic title.

The activity mapper covers request/workflow, lifecycle, address, bank, qualification/preference, certification, workforce, and MESH projection event families. Although audit is the durable projection used by the first reader, each public item is assigned its semantic source family.

Business Activity accepts only explicit provider adapters for procurement, finance, sales, projects, and contracts. Providers return bounded metrics and an authorized owning-module deep link. They execute independently with `Promise.allSettled`; a failed provider becomes `unavailable` without failing governance activity, the Business Partner summary, or successful providers. No transaction table is queried by the 360 repository.

## Pagination and redaction

Request and activity pages are snapshot-bound and ordered by timestamp, UUID, and source. The opaque cursor is bound to section and Business Partner and retains the heterogeneous source coordinate. Responses and errors use the existing `private, no-store` route envelope.

## Verification evidence

- Contracts, master-data service, gateway, and NEON client typechecks pass.
- The master-data suite passes 59 tests, including unmapped-event rejection, changed-field redaction, record-bound cursor replay, provider failure isolation, and static raw-payload selection guards.
- The NEON Business Partner package passes 9 tests and renders Requests, Activity, and Business Activity as separately failing panels.
- Concrete owning-module summary adapters, disposable-database heterogeneous ordering/acceptance-fixture coverage, and browser deep-link/leakage tests remain pending before exit.
