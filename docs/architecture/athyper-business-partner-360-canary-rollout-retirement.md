# Business Partner 360 canary, broad rollout and retirement evidence

**Evidence date:** 2026-08-30  
**Rollout state:** Disabled, 0%, no tenant overrides  
**Internal eligibility:** Blocked by P0, P1 and eight pending release approvals  
**Retirement eligibility:** Blocked

## Guarded rollout implementation

The rollout controller manages the existing
`neon.business_partner.view_360` feature flag and explicit tenant overrides. Its
allowed actions are status, internal enable, canary promotion, broad promotion,
rollback and retirement evaluation. There is deliberately no endpoint or
command that removes compatibility code.

Named local disposable cohorts are staged as:

| Stage | Tenant | Enabled now |
| --- | --- | --- |
| Internal | `athyper` | No |
| Canary | `technostat` | No |
| Broad | Tenant-stable 100% rollout | No |

Staging cohort names is not authorization. A correctly confirmed internal
enable attempt was executed and failed before its transaction because P0 is
not closed, P1 is not release-ready, and the functional, data,
security/privacy, contract, performance, resilience, UX and operations
approvals are all absent. A subsequent status read confirmed 0% and zero
overrides.

The controller and observation recorder now consume the normative P0 and P1
evaluators directly. Approval-ledger completion alone cannot enable the
internal tenant or record an observation. Current entry reasons include
`P0_NOT_CLOSED` and `P1_NOT_RELEASE_READY` in addition to all eight missing
release approvals.

Internal observation requires at least 60 minutes and 100 requests. Canary
requires at least 24 hours and 1,000 requests. Broad evidence requires at least
seven days and 10,000 requests. Each recorded observation carries the eight
accountable approvals and is re-evaluated against latency, payload, error,
MESH fallback and definition-availability limits. Missing Prometheus samples
fail closed rather than becoming zeros.

Every forward promotion re-evaluates the current P0, P1, operational and
approval state; a previously passing observation cannot override a later gate
revocation. Observation capture also compares the exact enabled tenant codes
with the named cohort definition. An unrelated enabled override cannot satisfy
the internal or canary count.

The observation ledger is currently empty because the feature has not been
authorized or enabled. No elapsed-time or request-volume evidence has been
fabricated.

## Legacy inventory

The source inventory found one active consumer: the feature-disabled
`BusinessPartnerAggregateDetail` UI rollback path. Four additional compatibility
boundaries remain: the BFF relay operation, legacy HTTP route, service adapter
and repository delegate. All are governed by the separate retirement gate.

The dashboard monitors
`athyper_business_partner_request_http_total{operation="get-aggregate"}`. The
retirement evidence uses `legacyCalls: -1` to represent not-yet-qualified,
rather than asserting zero. The local operations Prometheus retains only 24
hours and cannot establish a 30-day zero-traffic window.

The retirement evaluator now requires `telemetryRetentionDays >= 30`, a
durable `trafficEvidenceRef`, exact offset-aware zero-call window timestamps,
and consistency between the elapsed window, reported observation days and
telemetry retention. It also requires a durable rollback approval reference
and three structured approvals with distinct approver identities. A manually
entered zero or elapsed-day count cannot qualify retirement by itself.

A live query of the local 24-hour Prometheus store returned no series for the
legacy aggregate counter. The evidence records this as `no_series` with
`qualifiedAsZero: false`; absence of a sample is not converted to zero traffic.

## Current evaluator result

| Gate | Current result |
| --- | --- |
| Internal entry | Blocked — P0 open, P1 open and eight approvals missing |
| Internal observation | Missing |
| Canary promotion | Blocked — internal observation missing |
| Broad promotion | Blocked — canary observation missing |
| Broad qualification | Missing |
| Known consumers | 1 |
| Legacy calls | Unknown/not qualified |
| Zero-traffic window | 0 of 30 days |
| Qualifying telemetry retention | 1 of at least 30 days |
| Durable traffic evidence | Missing |
| Compatibility tests | Passing |
| Rollback approval | Missing |
| Retirement owner approvals | 0 of 3 |
| Deletion available | No |

The retirement evaluator reports legacy traffic present/unknown, a known
consumer remaining, incomplete observation, insufficient telemetry retention,
missing traffic evidence, an invalid zero-call window, rollback not approved
and owner approvals incomplete.

## Required continuation

1. Obtain and record all eight release approvals.
2. Enable only the named internal tenant and begin the observation timestamp.
3. After 60 minutes and 100 real requests, record and evaluate internal data.
4. Promote only if the result is `promote`, then repeat for the 24-hour canary.
5. Promote broad only after canary approval and retain seven-day/10,000-request
   broad evidence.
6. Migrate the rollback UI consumer and establish 30 consecutive zero-call days
   using adequate-retention telemetry.
7. Obtain rollback approval and three distinct retirement owner approvals.
8. Open a separate reviewed deletion change. Do not delete the endpoint or
   monolithic component in this rollout change.
