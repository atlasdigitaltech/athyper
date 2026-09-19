# Business Partner case and notification metrics

The API process collects metrics in the background, independently of `/readyz`, `/healthz`, and `/health`. The former `business-partner-case-age.neon` readiness contribution has been removed. Existing dependency readiness checks are unchanged.

## Configuration

Set `BUSINESS_PARTNER_METRICS_TARGETS` to a JSON array of authorized NEON tenant/service-account pairs. This is an operator-owned allowlist, not input accepted from HTTP requests. For example (replace both IDs with your actual IDs):

```dotenv
BUSINESS_PARTNER_METRICS_TARGETS='[{"tenantId":"10000000-0000-4000-8000-000000000001","principalId":"20000000-0000-4000-8000-000000000001"}]'
```

The instance parity Compose API service forwards this setting. For other launchers, set it on the API process environment. Restart/redeploy the API after changing the list. There is no automatic cross-tenant enumeration or implicit system tenant. Missing configuration defaults to an empty list, performs no business-data queries, and exports configured-tenants=0 and collection-success=0; the collection alert makes that state visible.

Every configured pair must identify an active NEON tenant and an active service account belonging to that tenant. Use the normal application database role with existing SELECT grants; do not grant BYPASSRLS or superuser privileges. Invalid configuration fails config loading; inactive, missing, or mismatched accounts fail only that collection sweep. Revalidation occurs every sweep, so disabling the account prevents further collection.

## Execution and metrics

Collection begins asynchronously after lifecycle initialization and repeats 30 seconds after the preceding sweep completes. Sweeps never overlap. Each tenant uses the adapter's existing `withTenantTransaction` path, which stamps tenant/principal settings transaction-locally. Queries also explicitly filter the tenant. Each transaction uses a 5-second statement timeout and a 1-second lock timeout. Shutdown stops scheduling and cancels further work; in-flight database statements remain subject to the database timeout.

The collector retains the existing metric names and alert thresholds:

| Metric | Complete-sweep value |
| --- | --- |
| `athyper_business_partner_case_oldest_open_seconds` | Maximum open case age across configured tenants |
| `athyper_business_partner_notification_oldest_pending_seconds` | Maximum pending notification age across configured tenants |
| `athyper_business_partner_notification_dead_letters` | Sum of dead letters across configured tenants |

All metrics carry only `plane="neon"`. The exporter forbids tenant identity labels. Tenant failures are attributed in protected operational logs. The public health response does not expose these collection errors.

A failed tenant does not stop remaining tenants from being sampled. A sweep publishes business metrics only when all configured tenants succeed; on failure it retains the last complete snapshot instead of publishing partial totals or false zeros. No sample is published before the first successful sweep. An empty tenant's aggregates are zero, but an empty configured tenant list is unconfigured, not a successful zero sample.

Separate monitoring metrics:

- `athyper_business_partner_metrics_configured_tenants`: number of configured tenants.
- `athyper_business_partner_metrics_failed_tenants`: failures in the last sweep.
- `athyper_business_partner_metrics_collection_success`: 1 only after a fully successful nonempty sweep; otherwise 0.
- `athyper_business_partner_metrics_last_success_timestamp_seconds`: time of the last complete successful sweep.

`AthyperBusinessPartnerMetricsCollectionFailed` warns after five minutes of failed, unconfigured, or stale collection. Existing case/backlog alerts continue using the preserved names. Large target lists may require interval/timeout tuning or a partitioned collector in the future; the default implementation collects sequentially to bound database load.

## Verification

Focused command:

```sh
pnpm --filter @athyper/server-platform-host exec vitest run src/monitoring/__tests__/business-partner-metrics.test.ts src/__tests__/config.test.ts
```

Regression tests use the real Kysely transaction runner and a simulated PostgreSQL transport. They verify two separate actor stamps, explicit tenant parameters, active-account validation, distinct tenant samples, correct max/sum aggregation, failure isolation/recovery, retention of the last complete snapshot, exporter label compatibility, non-overlapping scheduling, shutdown, and readiness staying 200 during collector failures while a required dependency failure still returns 503. These tests are not a live PostgreSQL RLS integration test.

After configuring targets and deploying, verify through the internal metrics listener that configured-tenants matches the allowlist, collection-success reaches 1, and last-success advances. Use two fixture tenants with different case ages and notification counts to compare each tenant's SQL result with the aggregate metrics. Disable one fixture service account to verify the collector failure alert and unchanged service readiness, then restore it and verify recovery. The unrelated MESH readiness failure may still keep overall readiness at 503.

Validation in this workspace: the focused collector/config suites passed (41 tests), and the platform-host typecheck passed. The broader host suite exposed two unrelated existing source-format assertion failures in `plane-transaction-coordinator.test.ts` and `optional-capability-readiness.test.ts`. Compose and alert files parsed successfully as YAML. No deployment or live-database data changes were made.
