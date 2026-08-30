# Business Partner 360 resilience and operational readiness evidence

**Evidence date:** 2026-08-30  
**Technical rehearsal:** Passed  
**Release readiness:** Blocked pending supervised notification/on-call exercise and eight accountable approvals

## Rehearsed failure contracts

The guarded operational runner composes the existing service and disposable
database authorities. It does not replace them with mock-only success flags.

| Scenario | Expected containment | Result |
| --- | --- | --- |
| STUDIO absent after a valid definition | Use cloned last-valid compatible definition | Pass |
| STUDIO incompatible after a valid definition | Reject candidate and retain last valid | Pass |
| STUDIO cold and absent | Completeness fails closed | Pass |
| MESH timeout | Network unavailable; bounded timeout | Pass |
| MESH denial | Network denied without source read | Pass |
| MESH corrupt payload | Network unavailable with response-invalid reason | Pass |
| MESH incompatible schema | Network unavailable with schema reason | Pass |
| MESH stale projection | Stale state and provenance retained | Pass |
| Stale/foreign cursor | Stable `BP_360_CURSOR_STALE` conflict | Pass |
| Permission epoch change | All caller query keys change and in-flight shell request is cleared | Pass |
| Failed materialization | Master, typed child, snapshot, audit, outbox and request state all roll back | Pass — six stages |
| Reveal expiry/replay/incident boundary | Expired and replayed claims fail; audit remains value-free | Pass |

The retained machine evidence is
`docs/architecture/evidence/business-partner-360-operational-readiness.json`.
It records `technicalPassed: true` and `releaseReady: false`.

## Dashboards, alerts and routing

Prometheus 3.11.2 validated the nine-rule source file. `promtool test rules`
evaluated safe synthetic counter series and fired the BP360 error-rate,
definition-unavailable, MESH-fallback and reveal-failure alerts. Synthetic
labels contain service, team, severity, section/status/reason class only; no
subject identifier or restricted value is used.

The Grafana dashboard JSON parsed and all eight required panels were present:
latency, safe errors, payload, completeness, MESH fallback, redaction/reveal,
materialization failure and legacy aggregate traffic. Its expressions and
legends are negative for subject IDs and restricted-value dimensions.

The production Alertmanager template was rendered with disposable sink values,
validated with Alertmanager 0.32.0, and queried using safe synthetic label sets:

| Synthetic alert | Expected receivers | Result |
| --- | --- | --- |
| BP360 warning, `team=platform` | `platform-email` | Pass |
| BP360 critical reveal, `team=security` | `critical-email`, `security-email` | Pass |

No real email or page was sent. Real notification delivery acknowledgement is
still required during the supervised on-call exercise.

## Approval evidence

The release evaluator now requires one structured approval for each gate in
addition to its measured pass boolean. Required records are functional, data,
security/privacy, contract, performance, resilience, UX and operations. Each
record must contain `status: approved`, an accountable approver ID, an
offset-aware timestamp and a durable evidence reference. Missing, duplicate or
invalid records prevent promotion.

The checked-in ledger at
`docs/architecture/evidence/business-partner-360-release-approvals.json` records
all eight gates as pending. This is intentional: repository automation cannot
grant organizational approval.

## Reproduction

Follow the guarded command in the BP360 operations runbook. The runner requires
the explicit confirmation phrase, refuses shared database coordinates, uses
pinned Prometheus and Alertmanager images, deletes its temporary rendered
routing configuration, and writes only safe summarized evidence.

## Remaining activities

1. Conduct the supervised on-call/support exercise with named participants.
2. Exercise a configured non-production notification sink and retain delivery
   and acknowledgement references.
3. Replace each pending ledger entry only after the accountable owner approves
   its referenced evidence.
4. Re-run the release evaluator. Canary remains prohibited until the result has
   no missing approval reasons and all other observed cohort gates pass.

The P1 qualification evaluator now additionally requires a durable non-production
sink reference, delivery and acknowledgement timestamps, and at least two named
exercise participants before `notification_oncall` can pass. The existing safe
synthetic route checks remain technical rehearsal only.
