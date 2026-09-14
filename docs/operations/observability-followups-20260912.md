# Business Partner alerting fix — deferred observability follow-ups

Decision date: 2026-09-12.

While fixing the Business Partner alerting/routing gaps (job-label mismatch,
missing Alertmanager routes, un-aggregated multi-instance rules), the audit
also covered every other Prometheus rule file mounted or referenced across the
repo. This records what was deliberately **not** fixed now, and why.

## Deleted: governance, document-registry, and generic recording rules

`deploy/config/telemetry/metrics/governance-alerts.yml`,
`document-registry-alerts.yml`, and `recording-rules.yml` were removed, and the
matching `rule_files` entries dropped from `config.yml`, `config.staging.yml`,
and `config.production.yml` in the same directory. Every metric these three
files referenced was checked against the current `server/` tree by name
(`gov_archive_job_backlog`, `gov_legal_holds_*`, `gov_quota_*`,
`gov_privacy_guard_*`, `athyper_metric_collector_*`,
`athyper_studio_metric_section_up`, all `fin_doc_registry_*` names,
`athyper_http_requests_total`, `athyper_queue_jobs`) — zero matches. They are
not renamed variants; the current metric catalog
(`server/packages/adapters/telemetry-otel/src/prometheus-metrics.ts`) uses
`athyper_http_request_duration_seconds` and `athyper_http_errors_total`
instead, and there is no queue-depth gauge at all today (only
`athyper_job_latency_seconds`, `athyper_job_retries_total`,
`athyper_job_dlq_total`, `athyper_schedule_lag_seconds`). Mounting these files
as-is would have produced rules and dashboards that can never fire or populate
— worse than not mounting them, because it looks like coverage that isn't
there.

`document-registry-slo.yml` (a spec-only, non-Prometheus-native document in
the same directory) already points at `document-registry-alerts.yml` as the
target for turning its SLOs into real rules — that pointer is left as-is since
it documents the intended shape of the future work below.

### To re-instrument (governance)

Would need real counters/gauges for: archive job backlog and failures
(`gov_archive_job_backlog`, `gov_archive_jobs_failed`), legal holds
(`gov_legal_holds_created`, `gov_legal_holds_released`, `gov_manifests_held`,
`gov_legal_hold_overlaps`), quotas (`gov_quota_breaches`,
`gov_quota_utilization_pct`), privacy guard PII detection
(`gov_privacy_guard_warned`, `gov_privacy_guard_inspected`), purge backlog
(`gov_manifests_purge_ready`), and the platform metric collector's own health
(`athyper_metric_collector_up`, `athyper_metric_collector_last_success_timestamp_seconds`,
`athyper_studio_metric_section_up`). None of this instrumentation exists in
`server/packages/platform/governance` today.

### To re-instrument (document registry)

Would need: `fin_doc_registry_compliance_posting_inconsistency`,
`fin_doc_registry_bridge_incomplete`,
`fin_doc_registry_compliance_approved_not_posted`,
`fin_doc_registry_compliance_closed_period_violation`,
`fin_doc_registry_compliance_entity_mismatch`,
`fin_doc_registry_trigger_sync_failed_count`,
`fin_doc_registry_status_mapping_fallbacks`,
`fin_doc_registry_trigger_sync_count`, and
`fin_doc_registry_compliance_approved_without_scoring`. `document-registry-slo.yml`
in the same directory already specifies the target burn-rate math for two of
these (status mapping success, posting consistency) — start there.

## Resolved: API and Business Partner case/notification alerting

Both active Compose Prometheus configurations now load `api-alerts.yml` and
`business-partner-case-alerts.yml`. The latter owns the former
`athyper-business-partner-v1` group, moved out of the legacy Business Partner
file. Delivery and 360 rules remain in the existing Compose rule files so each
condition has one deployed alert rather than duplicate notifications.

API error-rate alerting now uses `athyper_http_errors_total` divided by
`athyper_http_request_duration_seconds_count`, retaining deployment, method and
route labels and requiring more than one request per second. Case aggregates
also retain instance/environment labels in shared monitoring.

Compose enables a dedicated API metrics listener on port 9464. It is attached to
private instance/observability networks and has no host port mapping or gateway
route. The application listener on port 4000 keeps its loopback-only `/metrics`
restriction. Operations target receipts now include `api-<instance>:9464`.
A rebuilt runtime image and normal instance/operations deployment are required
before these changes affect running systems; old target receipts are not edited
by this source change. Configure `BUSINESS_PARTNER_METRICS_TARGETS` for intended
collector scopes; the collection-failure alert intentionally detects an
unconfigured or stale collector.

The `config*.yml` tree remains a legacy, unselected topology, not the deployment
source of truth. Its unique supported case/notification rules are now deployed
by the two active stacks. Its references follow the rule split, and its legacy
API target points to 9464; using that topology for another deployment still
requires independent network and label validation.

Validation:

```sh
docker run --rm --entrypoint /bin/promtool \
  -v "$PWD/deploy/config/telemetry/metrics:/work:ro" -w /work \
  prom/prometheus:v3.11.2 test rules application-alert-tests.yml business-partner-360-alert-tests.yml
ATHYPER_APPLICATION_ALERT_TESTS=true node --test deploy/compose/tests/application-alerts.integration.test.mjs
```

These cover rule firing/recovery, deployment isolation, missing traffic, active
rule loading and cross-container scraping using the runtime metrics endpoint.
Existing Alertmanager default and Business Partner routes cover the newly loaded
alerts; Mailpit remains a qualification mailbox rather than external paging.
