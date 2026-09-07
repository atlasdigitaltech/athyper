# Local address-link cancellation

> Local-development baseline update: the 16 scripts listed in [SQL DDL consolidation](sql-ddl-consolidation.md) have been folded into `server/db/ddl/` and removed from the migration manifests. Use the canonical DDL for a fresh local database. Migration commands and migration-path test results below describe the earlier implementation and are historical, not current setup instructions.

The existing `POST /api/master/addresses/{addressLinkId}/deactivate` endpoint now supports immediate cancellation without creating an invalid date interval. Authorization and the HTTP 204 response remain the same.

| Link/request | Result |
| --- | --- |
| Starts today; default end date today | Cancel immediately |
| Starts in the future; default end date today | Cancel immediately |
| Starts today or later; explicit end date between today and its start date, inclusive | Cancel immediately |
| Explicit end date later than the start date | End-date the usage period |
| Already cancelled | 409 `ADDRESS_LINK_ALREADY_CANCELLED`, no new effects |
| Established link; requested end date on/before its start date | 400; historical usage cannot be erased through cancellation |
| Repeated identical end date or extension of a previously closed interval | 409 `MASTER_DATA_PERIOD_CLOSED` |

Dates are evaluated in UTC. Cancellation uses `usage_status='cancelled'` and the existing reason, timestamp and actor columns. It preserves the original effective dates and the shared canonical address. Cancelled links are excluded from profiles at all dates and release their duplicate and primary-address slots. Replacing one creates a new link; it does not reactivate or overwrite the cancelled record. Database enforcement rejects reactivation.

The existing `master.address.deactivated` audit/outbox event includes `disposition: "cancelled"` or `"deactivated"`. The state change and both effects participate in the same transaction. Keeping the event code preserves the published local audit contract while making the outcome explicit.

Established links continue to use their effective date interval, so their historical profile visibility is preserved. Same-day cancellation removes the link from date-based profile history; the cancelled record and audit timestamp retain evidence that it was created and cancelled.

## Migration and compatibility

`20260919_address_link_cancellation.sql` updates the state checks, usage guard, duplicate index and primary constraints. It does not delete or backfill address rows. The matching clean-install DDL and Prisma index descriptions are updated for all planes; only local Neon was migrated during this task. QA/staging/production remain deferred.

The local migration was executed through the forward runner and is recorded with its checksum in `public.athyper_schema_migration_v1`. A pre-migration table backup and previous runtime profile are stored under `~/.athyper/instances/dev/deployments/local-address-cancellation-20260907/`.

Deploy the migration before the new runtime. Once cancellation is used, retain the cancellation-aware runtime when rolling back unrelated changes. An older runtime's duplicate scan counts cancelled rows, so rolling back this feature would regress replacement behavior. Do not drop the new state or restore the old unconditional unique constraint over replacement history. Prefer a forward correction; a table backup is an investigation/recovery artifact, not an instruction to overwrite audited data.

## Validation

- Master-data package build passed.
- 61 service and route tests passed, including cancellation audit/outbox disposition.
- 23 PostgreSQL tests passed, including migration execution, same-day/future cancellation, missing-tenant denial, repeat rejection, rollback, terminal-state enforcement, concurrent replacement and shared-address reuse.
- 15 host composition/authority tests passed.
- All 89 authenticated checks passed, including cancellation and exact-slot replacement for both selected CirrusAtlantic users. The [acceptance receipt](master-data-launch/local-address-cancellation-acceptance-20260907.json) retains results. All four application services are healthy and the queue is empty.
