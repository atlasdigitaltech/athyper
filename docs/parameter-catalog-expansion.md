# Parameter Catalog Expansion — Hardcoded → `control.parameter_definition`

> Assessment date: 2026-05-08  
> Branch: `feature/finance-core`  
> Scope: All packages under `server/`, `packages/`, and `apps/web/`

---

## Context

`control.parameter_definition` is the platform's canonical store for configurable runtime
values.  The table supports three tiers of tenant access:

| `tenant_visibility` | Tenant can see | Tenant can override |
|---------------------|---------------|-------------------|
| `hidden`            | ✗             | ✗                 |
| `readonly`          | ✓             | ✗                 |
| `configurable`      | ✓             | ✓                 |

And three ownership levels:

| `control_level`       | Who owns the product value |
|-----------------------|---------------------------|
| `system_controlled`   | Platform engineering only |
| `tenant_configurable` | Product-defined, tenant-overridable |
| `tenant_owned`        | Created and managed by tenant admins |

**Current catalog**: 26 parameters, all in the `auth.*` / `keycloak.*` / `runtime.*`
namespaces, seeded in `900_seed_data/010_platform/003_control/020_parameter_definitions.sql`.

**Gap**: ~80 additional hardcoded constants exist across the codebase that are candidates for
promotion.

---

## Triage Framework

Each candidate is scored across three dimensions:

- **Tenant Value (TV)**: Would a real tenant legitimately want a different value?
- **Change Frequency (CF)**: How often might this need tuning after initial deployment?
- **Risk if Wrong (RW)**: What breaks if the value is incorrect?

Priority tiers:

| Tier | Description | Action |
|------|-------------|--------|
| **T1** | Business policy — tenant-configurable. High TV. | Register as `tenant_configurable / configurable`. |
| **T2** | Platform tuning — admin-visible readonly. Low TV, medium CF. | Register as `system_controlled / readonly`. |
| **T3** | Infrastructure constant — hidden from tenants. CF=low, engineering-only. | Register as `system_controlled / hidden` or leave in source. |
| **Skip** | Algorithmic constant, layout/UX preference, or framework internals. | Not suitable for the parameter store. |

---

## Findings by Domain

### 1. Finance & Accounting

These are the highest-value candidates — every accounting policy differs between tenants.

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `finance.ap.payment_terms_days` | records/ap route default | `30` (implied) | T1 | Net-30 is not universal; some tenants use Net-60/Net-45 |
| `finance.ap.tolerance_amount` | AP matching engine | matching threshold | T1 | Invoice matching tolerance varies by sector |
| `finance.ap.tolerance_percent` | AP matching engine | matching % threshold | T1 | Some tenants allow ±2%, others ±0.5% |
| `finance.ar.credit_days` | AR workbench | credit window | T1 | Standard credit days policy differs per tenant |
| `finance.ar.late_payment_grace_days` | AR aging report | grace period | T1 | Legal/policy requirement |
| `finance.gl.period_close_lock_days` | period gate trigger | lock buffer | T1 | Some tenants close on day 3, others day 10 |
| `finance.numbering.je_prefix` | numbering_series seed | `"JE"` | T1 | Tenant-branded document number prefixes |
| `finance.numbering.ap_invoice_prefix` | numbering_series seed | `"API"` | T1 | Same — AP prefix |
| `finance.numbering.ar_invoice_prefix` | numbering_series seed | `"ARI"` | T1 | Same — AR prefix |
| `finance.reporting.default_report` | `reportRegistry.ts:107` | `"profit-loss"` | T1 | Default landing report on Finance module open |
| `finance.reporting.fiscal_year_start_month` | master.tenant_profile | 1 (January) | T1 | Already in tenant profile — mirror here for runtime access |

> **Note on numbering prefixes**: These are currently stored in `master.numbering_series` rows
> but their *default* values are hardcoded in the seed.  Moving the prefix pattern into
> `control.parameter_definition` lets tenants change the format *before* the first document is
> issued, without a DDL migration.

---

### 2. Collaboration & Document Management

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `collab.attachments.max_file_bytes` | `apps/web/app/api/collab/attachments/route.ts:17` | `104_857_600` (100 MiB) | T1 | Storage tier per tenant differs. Enterprise = 500 MiB, Starter = 25 MiB |
| `collab.attachments.max_files_per_batch` | `collaboration-ui/src/hooks/attachments.ts:46` | `10` | T1 | Tenants with compliance requirements may need lower limits |
| `collab.comments.max_thread_depth` | `CommentThread.tsx:16` | `5` | T2 | UX constant, unlikely to change but worth cataloguing |
| `collab.bookmarks.max_per_user` | implicit in query | no cap | T2 | Resource bound for large orgs |

---

### 3. Jobs & Background Workers

These are operational constants that platform admins (not tenants) may need to tune, especially
in high-volume deployments.

#### 3a. Worker Sweep Intervals

| Code (proposed) | Current location | Hardcoded value | Tier |
|-----------------|-----------------|-----------------|------|
| `jobs.lifecycle.sweep_interval_ms` | `jobs.types.ts:282` | `60_000` (1 min) | T2 |
| `jobs.notification.sweep_interval_ms` | `jobs.types.ts:283` | `300_000` (5 min) | T2 |
| `jobs.outbox.drain_interval_ms` | `jobs.types.ts:284` | `30_000` (30 s) | T2 |
| `jobs.sla.check_interval_ms` | `jobs.types.ts:285` | `300_000` (5 min) | T2 |
| `jobs.notification.digest_hourly_ms` | `jobs.types.ts:286` | `3_600_000` (1 h) | T2 |
| `jobs.notification.digest_daily_ms` | `jobs.types.ts:287` | `86_400_000` (24 h) | T2 |
| `jobs.notification.digest_weekly_ms` | `jobs.types.ts:288` | `604_800_000` (7 d) | T2 |
| `jobs.provider.health_check_interval_ms` | `jobs.types.ts:289` | `900_000` (15 min) | T2 |
| `jobs.docrender.sweep_interval_ms` | `jobs.types.ts:290` | `30_000` (30 s) | T2 |
| `jobs.iam.kc_sync_interval_ms` | `jobs.types.ts:291` | `900_000` (15 min) | T2 |
| `jobs.endpoint.health_sweep_interval_ms` | `jobs.types.ts:292` | `300_000` (5 min) | T2 |
| `jobs.tika.sweep_interval_ms` | `jobs.types.ts:293` | `600_000` (10 min) | T2 |
| `jobs.outbox.purge_interval_ms` | `jobs.types.ts:294` | `3_600_000` (1 h) | T2 |
| `jobs.editlock.stale_sweep_interval_ms` | `jobs.types.ts:295` | `300_000` (5 min) | T2 |

#### 3b. Worker Batch Sizes

| Code (proposed) | Current location | Hardcoded value | Tier |
|-----------------|-----------------|-----------------|------|
| `jobs.lifecycle.batch_size` | `lifecycle-timer.worker.ts:59` | `200` | T2 |
| `jobs.sla.batch_size` | `sla-check.worker.ts:44` | `100` | T2 |
| `jobs.notification.send_batch_size` | `notification.worker.ts:172` | `100` | T2 |
| `jobs.notification.digest_batch_size` | `notification.worker.ts:490` | `500` | T2 |
| `jobs.tika.sweep_batch_size` | `tika-extract.worker.ts:48` | `200` | T2 |
| `jobs.outbox.drain_batch_size` | `domain-outbox.worker.ts:67` | `50` | T2 |
| `jobs.kc_sync.batch_size` | `kc-sync.worker.ts:72` | `100` | T2 |
| `jobs.webhook.sweep_batch_size` | `webhook-delivery.worker.ts:41` | `50` | T2 |
| `jobs.import.chunk_size` | `import.route.ts:128` | `500` | T2 |

#### 3c. Worker Concurrency

| Code (proposed) | Current location | Hardcoded value | Tier |
|-----------------|-----------------|-----------------|------|
| `jobs.cms.preview_concurrency` | `cms-preview.worker.ts:215` | `4` | T2 |
| `jobs.webhook.delivery_concurrency` | `webhook-delivery.worker.ts:335` | `10` | T2 |
| `jobs.outbox.drain_concurrency` | `domain-outbox.worker.ts:200` | `3` | T2 |
| `jobs.docrender.concurrency` | `render-document.worker.ts:585` | `3` | T2 |

#### 3d. SLA & Stuck Detection

| Code (proposed) | Current location | Hardcoded value | Tier |
|-----------------|-----------------|-----------------|------|
| `jobs.sla.stuck_threshold_hours` | `sla-check.worker.ts:431` | `24` | T1 |
| `jobs.editlock.default_ttl_seconds` | `edit-lock.service.ts:25` | `300` (5 min) | T1 |
| `jobs.editlock.heartbeat_seconds` | `edit-lock.service.ts:26` | `30` | T2 |

> `stuck_threshold_hours` is T1 because operational tenants in fast-paced industries (e.g.,
> trading) may define "stuck" as 4 hours, while a government entity may tolerate 72 hours.

---

### 4. Notification Channels

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `notifications.dedup_window_ms` | `notification.worker.ts:105` | `300_000` (5 min) | T1 | Some tenants want instant delivery; others want batching |
| `notifications.sms.max_chars` | `sms.adapter.ts:36` | `1_600` | T2 | SMS concatenation limit — carrier-dependent |
| `notifications.webhook.rate_limit_rpm` | `webhook-receiver.route.ts:54` | `120` | T1 | Tenants on premium tier may need higher limits |
| `notifications.webhook.replay_window_ms` | `webhook-receiver.route.ts:53` | `300_000` (5 min) | T2 | Security constant — rarely changed but auditable |
| `notifications.webhook.max_body_bytes` | `webhook-receiver.route.ts:55` | `1_048_576` (1 MiB) | T2 | Payload limit |

---

### 5. Content Management & Document Services

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `cms.tika.max_extract_bytes` | `tika-extract.worker.ts:45` | `52_428_800` (50 MiB) | T2 | Text extraction file size cap |
| `cms.tika.max_text_chars` | `tika-extract.worker.ts:46` | `5_000_000` | T2 | Extracted text truncation limit |
| `cms.preview.max_chars` | `cms-preview.worker.ts:37` | `500` | T2 | Card preview text length |
| `cms.quota.default_gb` | content quota middleware | varies | T1 | Storage quota per tenant tier |

---

### 6. API & Query Behaviour

These affect how data is paginated and filtered across all entity list views.

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `api.pagination.default_page_size` | `records.route.ts:363`, search, documents | `20` | T1 | Dense-display tenants (finance houses) prefer 50+ rows |
| `api.pagination.max_page_size` | multiple routes | `500` | T2 | Product hard cap; use page navigation after 500 rows |
| `api.pagination.load_more_increment` | entity list footer | `50` | T1 | Tenant-tunable Load More increment |
| `api.facets.max_fields` | `records.route.ts:797` | `20` | T2 | Facet UI performance bound |
| `api.facets.max_values` | `records.route.ts:798` | `200` | T2 | Facet dropdown item count |
| `api.facets.query_timeout_ms` | `records.route.ts:799` | `2_000` | T2 | Hard kill for slow facet queries |
| `api.export.records_max_rows` | `export.route.ts:52` | `10_000` | T1 | Enterprise tenants export full datasets |
| `api.export.audit_max_rows` | `audit.route.ts:121` | `50_000` | T1 | Compliance teams need higher limits |
| `api.audit.default_window_days` | `audit.route.ts:48` | `7` | T1 | Compliance tenants want 30-day default view |
| `api.audit.max_window_days` | `audit.route.ts:49` | `90` | T1 | Legal hold tenants need full 7-year query window |
| `api.integration.max_event_window_days` | `integration.route.ts:85` | `30` | T2 | Integration event history window |

---

### 7. Security & Entity Governance

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `governance.cert.expiring_soon_days` | `ChildSummaryCardsPanel.tsx:388` | `90` | T1 | ISO 27001 tenants may flag certs 180 days in advance |
| `governance.kc_sync.circuit_breaker_open_ms` | `kc-sync.worker.ts:71` | `600_000` (10 min) | T2 | Keycloak circuit-breaker hold time |
| `governance.ai.confidence_cache_ttl_seconds` | `confidence-resolver.service.ts:33` | `60` | T2 | AI confidence score cache |
| `governance.ai.autonomy_cache_ttl_seconds` | `autonomy-resolver.service.ts:35` | `60` | T2 | AI autonomy config cache |

---

### 8. Navigation & UX Behaviour

These are lower-priority but relevant for tenants with large catalogs.

| Code (proposed) | Current location | Hardcoded value | Tier | Rationale |
|-----------------|-----------------|-----------------|------|-----------|
| `ux.recents.max_nav_items` | `recent-items.ts:40` | `20` | T1 | Power-users want 50 items; minimal tenants want 5 |
| `ux.recents.max_record_items` | `recently-viewed.ts:19` | `12` | T1 | Same rationale |
| `ux.refdata.stale_time_ms` | `useRefData.ts:127` | `3_600_000` (1 h) | T2 | Reference data (currencies, timezones) cache freshness |

---

### 9. Infrastructure Constants (Hidden / Skip)

These are purely technical and should stay in source or be registered as `hidden` for
documentation purposes only — tenants should never configure these.

| Constant | Location | Recommendation |
|----------|----------|----------------|
| Redis connection timeouts, ping intervals, reconnect backoff | `session-redis.ts` | **Hidden** (infra, not tenant-relevant) |
| DB/API/Redis retry policies | `retry.ts` | **Skip** (framework config, not business) |
| Health check `REQUEST_TIMEOUT_MS` | `healthchecks.ts` | **Skip** |
| UI panel widths (FilterDrawer, SortDrawer min/max) | various drawer components | **Skip** (layout constants, not business policy) |
| Column widths in ExcelView | `ExcelView.tsx` | **Skip** |
| `MAX_VISIBLE_ACTIONS` in DocumentIdentityCard | `DocumentIdentityCard.tsx` | **Skip** (presentational) |
| Notification stream reconnection backoff | `useNotificationStream.ts` | **Skip** (technical resilience) |

---

## Consolidated Priority Matrix

### Tier 1 — Tenant-Configurable (Register as `tenant_configurable / configurable`)

26 new parameters across 7 namespaces:

```
finance.ap.*              (4 params)  — tolerances, payment terms, numbering
finance.ar.*              (2 params)  — credit days, grace period  
finance.gl.*              (2 params)  — period lock, fiscal start
finance.numbering.*       (3 params)  — JE/AP/AR prefix patterns
finance.reporting.*       (1 param)   — default report landing
collab.attachments.*      (2 params)  — max bytes, max files per batch
jobs.sla.*                (1 param)   — stuck threshold hours
jobs.editlock.*           (1 param)   — default lock TTL
notifications.dedup.*     (1 param)   — dedup window
notifications.webhook.*   (1 param)   — rate limit RPM
api.pagination.*          (1 param)   — default page size
api.export.*              (2 params)  — records and audit export row limits
api.audit.*               (2 params)  — default and max window days
governance.cert.*         (1 param)   — expiring-soon threshold
ux.recents.*              (2 params)  — nav and record history length
```

### Tier 2 — Platform-Tuning (Register as `system_controlled / readonly`)

~38 new parameters across jobs, cms, api, and infrastructure namespaces.
These are visible to admin users in Setup > Parameters but cannot be overridden by tenants.

### Tier 3 / Skip

~18 constants that are layout, algorithmic, or framework-level — do not register.

---

## Proposed New Namespace Taxonomy

Extend the existing `auth.*` / `keycloak.*` / `runtime.*` namespaces with:

```
finance.ap          AP invoicing policy
finance.ar          AR receivables policy
finance.gl          GL and period control policy
finance.numbering   Document numbering series defaults
finance.reporting   Default views and reports
collab.attachments  Collaboration file upload limits
collab.comments     Commenting behaviour
jobs.lifecycle      Lifecycle timer worker
jobs.notification   Notification dispatch worker
jobs.outbox         Domain event outbox worker
jobs.sla            SLA check worker
jobs.tika           Text extraction worker
jobs.webhook        Webhook delivery worker
jobs.editlock       Collaborative edit-lock service
jobs.iam            IAM / Keycloak sync worker
jobs.docrender      Document render worker
jobs.import         Bulk import engine
cms.tika            Tika extraction limits
cms.preview         CMS card preview
notifications.sms   SMS channel
notifications.webhook  Webhook channel
api.pagination      List/query defaults
api.facets          Facet query limits
api.export          Export row limits
api.audit           Audit query windows
api.integration     Integration event windows
governance.cert     Certificate governance
governance.ai       AI autonomy/confidence
ux.recents          Recent-items navigation
ux.refdata          Reference data caching
```

---

## Implementation Plan

### Phase A — Finance & Collaboration (Tier 1 only, 16 params)

**Effort**: ~4 hours  
**File**: `server/db/sql/900_seed_data/010_platform/003_control/021_parameter_definitions_finance.sql`

Insert the 16 Tier 1 finance + collab parameters with appropriate `control_level`, bounds, and
`metadata.source` references.  Update all consumer sites to call the parameter-resolver service
instead of reading the constant directly.

### Phase B — Operations Tuning (Tier 2 jobs/api params, 38 params)

**Effort**: ~1 day  
**File**: `server/db/sql/900_seed_data/010_platform/003_control/022_parameter_definitions_ops.sql`

These are read-only catalog entries — no consumer code change needed immediately. They serve as
documentation and allow platform engineers to view current values through Setup > Parameters.
Consumer code can be refactored to read from the parameter snapshot in a follow-up pass.

### Phase C — Consumer Refactor

For each Tier 1 parameter, replace the hardcoded constant with a call to
`ParameterResolverService.getEffectiveValue(tenantId, code, fallback)`.  The fallback constant
ensures zero regression risk during the migration.

Pattern:
```typescript
// Before
const PAGE_SIZE = 20;

// After
const PAGE_SIZE = await resolver.getInteger(
  ctx.tenantId,
  'api.pagination.default_page_size',
  20   // compile-time fallback — zero regression risk
);
```

---

## Sample SQL — Phase A Finance Parameters

```sql
-- server/db/sql/900_seed_data/010_platform/003_control/021_parameter_definitions_finance.sql

INSERT INTO control.parameter_definition (
    code, namespace, display_name, description,
    owner_model, control_level, tenant_visibility,
    data_type, unit, default_value, product_value,
    min_value, max_value, allowed_values,
    runtime_reload, cache_ttl_seconds,
    is_security_sensitive, is_runtime_reloadable,
    sort_order, metadata, created_by
)
SELECT
    v.code, v.namespace, v.display_name, v.description,
    'product', v.control_level, v.tenant_visibility,
    v.data_type, v.unit,
    v.default_value::jsonb, NULLIF(v.product_value, '')::jsonb,
    NULLIF(v.min_value, '')::jsonb, NULLIF(v.max_value, '')::jsonb,
    NULLIF(v.allowed_values, '')::jsonb,
    v.runtime_reload, v.cache_ttl_seconds,
    v.is_security_sensitive, v.is_runtime_reloadable,
    v.sort_order, v.metadata::jsonb,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    -- ── Finance: AP ──────────────────────────────────────────────────────
    ('finance.ap.payment_terms_days',    'finance.ap',
     'Default AP payment terms (days)',
     'Default net-payment days applied to AP invoices when no supplier-specific terms are set.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '30', '30', '0', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/workspace/finance/ap/ap.service.ts","fallback_constant":"DEFAULT_PAYMENT_TERMS_DAYS"}'),

    ('finance.ap.tolerance_amount',      'finance.ap',
     'AP matching absolute tolerance',
     'Maximum absolute currency difference allowed when matching a purchase invoice line to a GR.',
     'tenant_configurable', 'configurable', 'number', 'currency_units',
     '0', '0', '0', '10000', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/workspace/finance/ap/matching.service.ts"}'),

    ('finance.ap.tolerance_percent',     'finance.ap',
     'AP matching percentage tolerance',
     'Maximum percentage difference allowed when matching invoice value to GR/PO value.',
     'tenant_configurable', 'configurable', 'number', 'percent',
     '2', '2', '0', '20', NULL,
     'next_request', 300, false, true, 30,
     '{"source":"server/workspace/finance/ap/matching.service.ts"}'),

    -- ── Finance: AR ──────────────────────────────────────────────────────
    ('finance.ar.credit_days',           'finance.ar',
     'Standard AR credit days',
     'Default credit period (days) given to customers on AR invoices.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '30', '30', '0', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/workspace/finance/ar/ar.service.ts"}'),

    ('finance.ar.late_payment_grace_days', 'finance.ar',
     'Late payment grace period (days)',
     'Days after invoice due date before a receivable is classified as overdue in aging reports.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '0', '0', '0', '30', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"packages/domain/finance/finance-workbench/src/reports/ArAging"}'),

    -- ── Finance: GL ──────────────────────────────────────────────────────
    ('finance.gl.period_close_lock_days', 'finance.gl',
     'Period close lock buffer (days)',
     'How many days after a period ends before it is automatically locked to new postings.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '5', '5', '0', '30', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/db/sql/master/06_triggers.sql","fallback_constant":"PERIOD_CLOSE_LOCK_DAYS"}'),

    -- ── Finance: Reporting ────────────────────────────────────────────────
    ('finance.reporting.default_report', 'finance.reporting',
     'Default financial report view',
     'Which report tab opens by default when a user lands on the Finance > Reports page.',
     'tenant_configurable', 'configurable', 'enum', NULL,
     '"profit-loss"', '"profit-loss"', NULL, NULL,
     '["profit-loss","balance-sheet","trial-balance","cash-flow","ap-aging","ar-aging"]',
     'next_request', 300, false, true, 10,
     '{"source":"packages/domain/finance/finance-workbench/src/lib/reportRegistry.ts:107"}'),

    -- ── Finance: Numbering ────────────────────────────────────────────────
    ('finance.numbering.je_prefix',      'finance.numbering',
     'Journal entry number prefix',
     'Prefix prepended to auto-generated journal entry document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"JE"', '"JE"', NULL, NULL, NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/db/sql/master/numbering_series seed"}'),

    ('finance.numbering.ap_invoice_prefix', 'finance.numbering',
     'AP invoice number prefix',
     'Prefix prepended to auto-generated AP invoice document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"API"', '"API"', NULL, NULL, NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/db/sql/master/numbering_series seed"}'),

    ('finance.numbering.ar_invoice_prefix', 'finance.numbering',
     'AR invoice number prefix',
     'Prefix prepended to auto-generated AR invoice document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"ARI"', '"ARI"', NULL, NULL, NULL,
     'next_request', 300, false, true, 30,
     '{"source":"server/db/sql/master/numbering_series seed"}'),

    -- ── Collaboration: Attachments ────────────────────────────────────────
    ('collab.attachments.max_file_bytes', 'collab.attachments',
     'Maximum attachment file size',
     'Largest single file that can be uploaded to a comment or document attachment.',
     'tenant_configurable', 'configurable', 'integer', 'bytes',
     '104857600', '104857600', '1048576', '524288000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"apps/web/app/api/collab/attachments/route.ts:17","fallback_constant":"MAX_BYTES"}'),

    ('collab.attachments.max_files_per_batch', 'collab.attachments',
     'Maximum files per upload batch',
     'Number of files that can be attached in a single upload action.',
     'tenant_configurable', 'configurable', 'integer', 'files',
     '10', '10', '1', '50', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"packages/shared/runtime/collaboration-ui/src/hooks/attachments.ts:46","fallback_constant":"MAX_FILES"}'),

    -- ── Notifications ─────────────────────────────────────────────────────
    ('notifications.dedup_window_ms',    'notifications',
     'Notification deduplication window',
     'Time window within which identical notifications are suppressed to prevent alert storms.',
     'tenant_configurable', 'configurable', 'integer', 'milliseconds',
     '300000', '300000', '0', '3600000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/jobs/workers/notification.worker.ts:105","fallback_constant":"DEFAULT_DEDUP_WINDOW_MS"}'),

    ('notifications.webhook.rate_limit_rpm', 'notifications.webhook',
     'Inbound webhook rate limit (RPM)',
     'Maximum inbound webhook events accepted per minute per integration endpoint.',
     'tenant_configurable', 'configurable', 'integer', 'requests_per_minute',
     '120', '120', '10', '1200', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/integration/routes/webhook-receiver.route.ts:54","fallback_constant":"RATE_LIMIT_RPM"}'),

    -- ── API Defaults ──────────────────────────────────────────────────────
    ('api.pagination.default_page_size', 'api.pagination',
     'Default list page size',
     'Number of records returned per page on entity list views when no page_size is specified.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '20', '20', '10', '200', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/records/routes/records.route.ts:363"}'),

    ('api.export.records_max_rows',      'api.export',
     'Maximum export rows (records)',
     'Row limit enforced on CSV/XLSX entity record exports.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '10000', '10000', '1000', '500000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/records/routes/export.route.ts:52","fallback_constant":"EXPORT_MAX_ROWS"}'),

    ('api.export.audit_max_rows',        'api.export',
     'Maximum export rows (audit log)',
     'Row limit enforced on audit event exports.  Compliance tenants require larger windows.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '50000', '50000', '1000', '1000000', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:121","fallback_constant":"EXPORT_MAX_ROWS"}'),

    ('api.audit.default_window_days',    'api.audit',
     'Default audit query window (days)',
     'Default date range applied to audit event queries when no from/to is specified.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '7', '7', '1', '90', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:48","fallback_constant":"DEFAULT_WINDOW_DAYS"}'),

    ('api.audit.max_window_days',        'api.audit',
     'Maximum audit query window (days)',
     'Hard upper bound on audit query date ranges.  Increase for compliance/legal hold tenants.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '90', '90', '30', '2557', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:49","fallback_constant":"MAX_WINDOW_DAYS"}'),

    -- ── Governance ────────────────────────────────────────────────────────
    ('governance.cert.expiring_soon_days', 'governance.cert',
     'Certificate expiry warning threshold (days)',
     'Number of days before certification expiry that the "expiring soon" badge appears.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '90', '90', '7', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"packages/shared/runtime/entity-runtime/src/detail/ChildSummaryCardsPanel.tsx:388","fallback_constant":"CERT_EXPIRING_SOON_DAYS"}'),

    -- ── Jobs: SLA & Edit Locks ────────────────────────────────────────────
    ('jobs.sla.stuck_threshold_hours',   'jobs.sla',
     'Workflow stuck-item threshold (hours)',
     'A workflow item is flagged as stuck if it has not progressed within this many hours.',
     'tenant_configurable', 'configurable', 'integer', 'hours',
     '24', '24', '1', '168', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/jobs/workers/sla-check.worker.ts:431","fallback_constant":"STUCK_THRESHOLD_HOURS"}'),

    ('jobs.editlock.default_ttl_seconds', 'jobs.editlock',
     'Collaborative edit-lock TTL (seconds)',
     'How long an edit lock held by a user persists before expiring if no heartbeat is received.',
     'tenant_configurable', 'configurable', 'integer', 'seconds',
     '300', '300', '60', '1800', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/shared/edit-lock.service.ts:25","fallback_constant":"DEFAULT_LOCK_TTL_SECONDS"}'),

    -- ── UX ────────────────────────────────────────────────────────────────
    ('ux.recents.max_nav_items',         'ux.recents',
     'Recent navigation items limit',
     'Maximum number of recently visited pages kept in the sidebar navigation history.',
     'tenant_configurable', 'configurable', 'integer', 'items',
     '20', '20', '5', '100', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"apps/web/lib/recent-items.ts:40","fallback_constant":"MAX_ITEMS"}'),

    ('ux.recents.max_record_items',      'ux.recents',
     'Recently viewed records limit',
     'Maximum number of recently opened entity records shown in the entity list "Recent" panel.',
     'tenant_configurable', 'configurable', 'integer', 'items',
     '12', '12', '5', '50', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"apps/web/lib/recently-viewed.ts:19","fallback_constant":"MAX"}')

) AS v(
    code, namespace, display_name, description,
    control_level, tenant_visibility, data_type, unit,
    default_value, product_value, min_value, max_value, allowed_values,
    runtime_reload, cache_ttl_seconds,
    is_security_sensitive, is_runtime_reloadable,
    sort_order, metadata
)
ON CONFLICT (code) DO UPDATE SET
    namespace             = EXCLUDED.namespace,
    display_name          = EXCLUDED.display_name,
    description           = EXCLUDED.description,
    control_level         = EXCLUDED.control_level,
    tenant_visibility     = EXCLUDED.tenant_visibility,
    data_type             = EXCLUDED.data_type,
    unit                  = EXCLUDED.unit,
    default_value         = EXCLUDED.default_value,
    product_value         = EXCLUDED.product_value,
    min_value             = EXCLUDED.min_value,
    max_value             = EXCLUDED.max_value,
    allowed_values        = EXCLUDED.allowed_values,
    runtime_reload        = EXCLUDED.runtime_reload,
    cache_ttl_seconds     = EXCLUDED.cache_ttl_seconds,
    is_security_sensitive = EXCLUDED.is_security_sensitive,
    is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
    sort_order            = EXCLUDED.sort_order,
    metadata              = EXCLUDED.metadata,
    status                = 'active',
    updated_at            = now(),
    updated_by            = EXCLUDED.created_by;
```

---

## Summary Scorecard

| Category | New T1 params | New T2 params | Skip |
|----------|:------------:|:------------:|:----:|
| Finance (AP/AR/GL/Numbering/Reporting) | 11 | 0 | 0 |
| Collaboration (attachments, comments) | 2 | 1 | 0 |
| Jobs workers (intervals, batches, concurrency) | 2 | 38 | 0 |
| Notifications (dedup, rate limits, payload) | 2 | 3 | 0 |
| API (pagination, export, audit windows) | 5 | 4 | 0 |
| Governance & AI | 1 | 2 | 0 |
| UX recents | 2 | 1 | 0 |
| Infrastructure (Redis, retry, layout) | 0 | 0 | 18 |
| **Total** | **25** | **49** | **18** |

**Already in catalog**: 26 parameters (auth/session/keycloak/runtime)  
**After Phase A**: 51 tenant-configurable parameters  
**After Phase B**: 100 catalogued parameters (T1 + T2), 26 hidden/infra

---

## What Does NOT Belong in the Parameter Store

- **Locales list** (`i18nConfig.locales`) — platform capability, not a policy
- **RTL locale codes** — language configuration, not configurable per tenant
- **UI panel widths** (filter/sort/column drawer min/max) — layout constants
- **Spreadsheet column widths** — UI rendering constants
- **Notification stream reconnection backoff** — client resilience, not policy
- **DB/Redis/API retry policies** — infrastructure, configure via env or compose
- **`MAX_VISIBLE_ACTIONS` in document header** — hard presentational cap

These either belong in `CLAUDE.md`-style conventions, environment variables, or are simply not
worth the operational overhead of a runtime lookup.
