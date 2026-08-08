import { sql, type Kysely, type RawBuilder } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

interface TenantCountRow {
  tenant: string | null;
  tenant_id: string | null;
  value: string | number | bigint | null;
}

interface LegalHoldRow {
  tenant: string | null;
  tenant_id: string | null;
  source: string | null;
  scope: string | null;
  active: string | number | bigint | null;
  created: string | number | bigint | null;
  released: string | number | bigint | null;
}

interface QuotaRow {
  tenant: string | null;
  tenant_id: string | null;
  quota_key: string | null;
  utilization_pct: string | number | bigint | null;
  breached: string | number | bigint | null;
}

interface PrivacyRow {
  tenant: string | null;
  tenant_id: string | null;
  inspected: string | number | bigint | null;
  warned: string | number | bigint | null;
}

interface ArchiveJobRow {
  tenant: string | null;
  tenant_id: string | null;
  completed: string | number | bigint | null;
  failed: string | number | bigint | null;
}

interface DocumentRegistryRow {
  tenant: string | null;
  tenant_id: string | null;
  doc_type: string | null;
  value: string | number | bigint | null;
}

interface SyncRow {
  tenant: string | null;
  tenant_id: string | null;
  total: string | number | bigint | null;
  failed: string | number | bigint | null;
}

interface OutboxHealthRow {
  topic: string | null;
  oldest_unpublished_seconds: string | number | null;
  retry_count: string | number | null;
  poison_event_count: string | number | null;
}

interface MetricSectionResult {
  name: string;
  ok: boolean;
  samples: MetricSample[];
}

type MetricSectionCollector = (db: DB, samples: MetricSample[]) => Promise<void>;

const DEFAULT_CACHE_TTL_MS = 30_000;

const HELP = [
  "# HELP gov_legal_holds_active Active legal holds by tenant and scope",
  "# TYPE gov_legal_holds_active gauge",
  "# HELP gov_legal_holds_created Legal hold rows currently recorded from governance.legal_hold",
  "# TYPE gov_legal_holds_created gauge",
  "# HELP gov_legal_holds_released Released legal hold rows currently recorded from governance.legal_hold",
  "# TYPE gov_legal_holds_released gauge",
  "# HELP gov_manifests_held Active legal hold manifest rows currently blocking archive partitions",
  "# TYPE gov_manifests_held gauge",
  "# HELP gov_manifests_purge_ready Released legal hold manifest rows eligible for purge/archive progression",
  "# TYPE gov_manifests_purge_ready gauge",
  "# HELP gov_legal_hold_overlaps Active legal hold manifest partition overlaps detected from governance.legal_hold_manifest",
  "# TYPE gov_legal_hold_overlaps gauge",
  "# HELP gov_quota_utilization_pct Current content quota utilization percentage by tenant and quota key",
  "# TYPE gov_quota_utilization_pct gauge",
  "# HELP gov_quota_breaches Current breached content quotas by tenant and quota key",
  "# TYPE gov_quota_breaches gauge",
  "# HELP gov_privacy_guard_inspected Attachments that completed PII inspection in the recent monitoring window",
  "# TYPE gov_privacy_guard_inspected gauge",
  "# HELP gov_privacy_guard_warned Attachments where PII was detected in the recent monitoring window",
  "# TYPE gov_privacy_guard_warned gauge",
  "# HELP gov_archive_jobs_completed Completed partition archive jobs in the recent monitoring window",
  "# TYPE gov_archive_jobs_completed gauge",
  "# HELP gov_archive_jobs_failed Failed partition archive jobs in the recent monitoring window",
  "# TYPE gov_archive_jobs_failed gauge",
  "# HELP fin_doc_registry_compliance_posting_inconsistency Posted finance documents whose linked journal entry is missing or inconsistent",
  "# TYPE fin_doc_registry_compliance_posting_inconsistency gauge",
  "# HELP fin_doc_registry_compliance_approved_not_posted Approved finance documents not yet posted",
  "# TYPE fin_doc_registry_compliance_approved_not_posted gauge",
  "# HELP fin_doc_registry_compliance_closed_period_violation Posted journal entries linked to finance documents in closed/future periods without override",
  "# TYPE fin_doc_registry_compliance_closed_period_violation gauge",
  "# HELP fin_doc_registry_compliance_entity_mismatch Finance documents whose company code differs from the linked journal entry",
  "# TYPE fin_doc_registry_compliance_entity_mismatch gauge",
  "# HELP fin_doc_registry_bridge_incomplete Posted finance documents with missing or unresolved journal entry bridge",
  "# TYPE fin_doc_registry_bridge_incomplete gauge",
  "# HELP fin_doc_registry_compliance_approved_without_scoring Approved or posted invoices without classification decision evidence",
  "# TYPE fin_doc_registry_compliance_approved_without_scoring gauge",
  "# HELP fin_doc_registry_trigger_sync_count Current registry sync outbox rows completed",
  "# TYPE fin_doc_registry_trigger_sync_count gauge",
  "# HELP fin_doc_registry_trigger_sync_failed_count Current registry sync outbox rows failed or dead-lettered",
  "# TYPE fin_doc_registry_trigger_sync_failed_count gauge",
  "# HELP athyper_outbox_oldest_unpublished_seconds Age of the oldest pending, failed, or processing outbox event",
  "# TYPE athyper_outbox_oldest_unpublished_seconds gauge",
  "# HELP athyper_outbox_retry_count Total delivery retries represented by current outbox rows",
  "# TYPE athyper_outbox_retry_count gauge",
  "# HELP athyper_outbox_poison_event_count Current dead-lettered outbox events",
  "# TYPE athyper_outbox_poison_event_count gauge",
  "# HELP fin_doc_registry_status_mapping_fallbacks Source document statuses without an active canonical_status lookup mapping",
  "# TYPE fin_doc_registry_status_mapping_fallbacks gauge",
  "# HELP athyper_platform_metric_section_up Whether a platform metric collection section succeeded on the last scrape",
  "# TYPE athyper_platform_metric_section_up gauge",
];

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function asNumber(value: string | number | bigint | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function tenantLabels(row: { tenant: string | null; tenant_id: string | null }): Record<string, string> {
  return {
    tenant: row.tenant ?? "unknown",
    tenant_id: row.tenant_id ?? "unknown",
  };
}

function addSample(
  samples: MetricSample[],
  name: string,
  labels: Record<string, string>,
  value: string | number | bigint | null | undefined,
): void {
  samples.push({ name, labels, value: asNumber(value) });
}

function renderSample(sample: MetricSample): string {
  const labels = Object.entries(sample.labels)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",");
  return `${sample.name}{${labels}} ${sample.value}`;
}

function cacheTtlMs(): number {
  const parsed = Number(process.env.PLATFORM_METRICS_CACHE_MS ?? DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CACHE_TTL_MS;
}

async function queryRows<T>(db: DB, query: RawBuilder<T>): Promise<T[]> {
  const result = await query.execute(db);
  return result.rows;
}

async function collectLegalHoldMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<LegalHoldRow>(db, sql<LegalHoldRow>`
    WITH legal_hold_scopes(scope) AS (
      SELECT scope
      FROM (
        VALUES
          ('all'::text),
          ('purchase_invoice'::text),
          ('payment_entry'::text),
          ('receipt'::text),
          ('service_sheet'::text)
      ) AS known(scope)
      UNION
      SELECT DISTINCT COALESCE(scope_entity_type, 'all') AS scope
      FROM governance.legal_hold
    ),
    hold_counts AS (
      SELECT
        lh.tenant_id,
        COALESCE(lh.scope_entity_type, 'all') AS scope,
        count(*) FILTER (WHERE lh.status = 'active') AS active,
        count(*) AS created,
        count(*) FILTER (WHERE lh.status = 'released') AS released
      FROM governance.legal_hold lh
      GROUP BY lh.tenant_id, COALESCE(lh.scope_entity_type, 'all')
    )
    SELECT
      t.code AS tenant,
      t.id::text AS tenant_id,
      'db'::text AS source,
      s.scope,
      COALESCE(h.active, 0)::text AS active,
      COALESCE(h.created, 0)::text AS created,
      COALESCE(h.released, 0)::text AS released
    FROM master.tenant t
    CROSS JOIN legal_hold_scopes s
    LEFT JOIN hold_counts h
      ON h.tenant_id = t.id
     AND h.scope = s.scope
    WHERE t.is_active = true
  `);

  for (const row of rows) {
    const labels = {
      ...tenantLabels(row),
      source: row.source ?? "db",
      scope: row.scope ?? "all",
    };
    addSample(samples, "gov_legal_holds_active", labels, row.active);
    addSample(samples, "gov_legal_holds_created", labels, row.created);
    addSample(samples, "gov_legal_holds_released", labels, row.released);
  }
}

async function collectLegalHoldManifestMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<{
    tenant: string | null;
    tenant_id: string | null;
    held: string | number | bigint | null;
    purge_ready: string | number | bigint | null;
  }>(db, sql<{
    tenant: string | null;
    tenant_id: string | null;
    held: string | number | bigint | null;
    purge_ready: string | number | bigint | null;
  }>`
    SELECT
      t.code AS tenant,
      lhm.tenant_id::text AS tenant_id,
      count(*) FILTER (WHERE lhm.is_released = false AND lh.status = 'active')::text AS held,
      count(*) FILTER (WHERE lhm.is_released = true)::text AS purge_ready
    FROM governance.legal_hold_manifest lhm
    JOIN governance.legal_hold lh
      ON lh.tenant_id = lhm.tenant_id
     AND lh.id = lhm.legal_hold_id
    JOIN master.tenant t ON t.id = lhm.tenant_id
    GROUP BY t.code, lhm.tenant_id
  `);

  for (const row of rows) {
    addSample(samples, "gov_manifests_held", tenantLabels(row), row.held);
    addSample(samples, "gov_manifests_purge_ready", tenantLabels(row), row.purge_ready);
  }

  const overlaps = await queryRows<TenantCountRow>(db, sql<TenantCountRow>`
    WITH active_partitions AS (
      SELECT
        lhm.tenant_id,
        lhm.partition_schema,
        lhm.partition_table,
        count(DISTINCT lhm.legal_hold_id) AS hold_count
      FROM governance.legal_hold_manifest lhm
      JOIN governance.legal_hold lh
        ON lh.tenant_id = lhm.tenant_id
       AND lh.id = lhm.legal_hold_id
      WHERE lhm.is_released = false
        AND lh.status = 'active'
      GROUP BY lhm.tenant_id, lhm.partition_schema, lhm.partition_table
      HAVING count(DISTINCT lhm.legal_hold_id) > 1
    )
    SELECT
      t.code AS tenant,
      ap.tenant_id::text AS tenant_id,
      COALESCE(sum(ap.hold_count - 1), 0)::text AS value
    FROM active_partitions ap
    JOIN master.tenant t ON t.id = ap.tenant_id
    GROUP BY t.code, ap.tenant_id
  `);

  for (const row of overlaps) {
    addSample(samples, "gov_legal_hold_overlaps", tenantLabels(row), row.value);
  }
}

async function collectQuotaMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<QuotaRow>(db, sql<QuotaRow>`
    WITH counts AS (
      SELECT tenant_id, kind, count(*) AS item_count
      FROM document.content_item
      GROUP BY tenant_id, kind
    ),
    quotas AS (
      SELECT tenant_id, kind, max_items
      FROM control.content_quota
      WHERE is_active = true
        AND max_items IS NOT NULL
    ),
    usage AS (
      SELECT
        q.tenant_id,
        q.kind,
        COALESCE(c.item_count, 0) AS item_count,
        q.max_items
      FROM quotas q
      LEFT JOIN counts c
        ON c.tenant_id = q.tenant_id
       AND c.kind = q.kind
      WHERE q.kind <> '*'
      UNION ALL
      SELECT
        q.tenant_id,
        c.kind,
        c.item_count,
        q.max_items
      FROM quotas q
      JOIN counts c ON c.tenant_id = q.tenant_id
      WHERE q.kind = '*'
        AND NOT EXISTS (
          SELECT 1
          FROM quotas exact
          WHERE exact.tenant_id = c.tenant_id
            AND exact.kind = c.kind
            AND exact.kind <> '*'
        )
    )
    SELECT
      t.code AS tenant,
      u.tenant_id::text AS tenant_id,
      u.kind AS quota_key,
      round((u.item_count::numeric / NULLIF(u.max_items, 0)::numeric) * 100, 2)::text AS utilization_pct,
      CASE WHEN u.item_count >= u.max_items THEN 1 ELSE 0 END::text AS breached
    FROM usage u
    JOIN master.tenant t ON t.id = u.tenant_id
  `);

  for (const row of rows) {
    const labels = {
      ...tenantLabels(row),
      quota_key: row.quota_key ?? "unknown",
    };
    addSample(samples, "gov_quota_utilization_pct", labels, row.utilization_pct);
    addSample(samples, "gov_quota_breaches", labels, row.breached);
  }
}

async function collectPrivacyMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<PrivacyRow>(db, sql<PrivacyRow>`
    SELECT
      t.code AS tenant,
      a.tenant_id::text AS tenant_id,
      count(*) FILTER (WHERE a.pii_scanned_at IS NOT NULL)::text AS inspected,
      count(*) FILTER (WHERE a.pii_detected = true)::text AS warned
    FROM document.attachment a
    JOIN master.tenant t ON t.id = a.tenant_id
    WHERE a.created_at >= now() - interval '30 days'
       OR a.pii_scanned_at >= now() - interval '30 days'
    GROUP BY t.code, a.tenant_id
  `);

  for (const row of rows) {
    addSample(samples, "gov_privacy_guard_inspected", tenantLabels(row), row.inspected);
    addSample(samples, "gov_privacy_guard_warned", tenantLabels(row), row.warned);
  }
}

async function collectArchiveJobMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<ArchiveJobRow>(db, sql<ArchiveJobRow>`
    SELECT
      t.code AS tenant,
      jl.tenant_id::text AS tenant_id,
      count(*) FILTER (WHERE jl.status = 'success')::text AS completed,
      count(*) FILTER (WHERE jl.status = 'failed')::text AS failed
    FROM ops.job_execution jl
    JOIN master.tenant t ON t.id = jl.tenant_id
    WHERE jl.job_code = 'partition_archive'
      AND jl.created_at >= now() - interval '24 hours'
    GROUP BY t.code, jl.tenant_id
  `);

  for (const row of rows) {
    addSample(samples, "gov_archive_jobs_completed", tenantLabels(row), row.completed);
    addSample(samples, "gov_archive_jobs_failed", tenantLabels(row), row.failed);
  }
}

async function collectDocumentRegistryComplianceMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const postingRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    WITH fin_docs AS (
      SELECT tenant_id, company_code_id, 'purchase_invoice'::text AS doc_type, id AS doc_id, ap_je_id AS je_id, status, is_posted, posted_at
      FROM document.purchase_invoice
      UNION ALL
      SELECT tenant_id, company_code_id, 'payment_entry'::text AS doc_type, id AS doc_id, payment_je_id AS je_id, status, is_posted, posted_at
      FROM document.payment_entry
      UNION ALL
      SELECT tenant_id, company_code_id, 'receipt'::text AS doc_type, id AS doc_id, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.receipt
      UNION ALL
      SELECT tenant_id, company_code_id, 'service_sheet'::text AS doc_type, id AS doc_id, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.service_sheet
    )
    SELECT
      t.code AS tenant,
      d.tenant_id::text AS tenant_id,
      d.doc_type,
      count(*)::text AS value
    FROM fin_docs d
    JOIN master.tenant t ON t.id = d.tenant_id
    LEFT JOIN document.journal_entry je
      ON je.tenant_id = d.tenant_id
     AND je.id = d.je_id
    WHERE (d.is_posted = true OR d.status = 'posted')
      AND (d.posted_at IS NULL OR d.posted_at >= now() - interval '90 days')
      AND d.je_id IS NOT NULL
      AND je.id IS NOT NULL
      AND (
        je.status <> 'posted'
        OR je.source_doc_type <> d.doc_type
        OR je.source_doc_id IS DISTINCT FROM d.doc_id
      )
    GROUP BY t.code, d.tenant_id, d.doc_type
  `);

  for (const row of postingRows) {
    addSample(samples, "fin_doc_registry_compliance_posting_inconsistency", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }

  const approvedRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    WITH fin_docs AS (
      SELECT tenant_id, 'purchase_invoice'::text AS doc_type, status, is_posted, approved_at
      FROM document.purchase_invoice
      UNION ALL
      SELECT tenant_id, 'payment_entry'::text AS doc_type, status, is_posted, approved_at
      FROM document.payment_entry
      UNION ALL
      SELECT tenant_id, 'receipt'::text AS doc_type, status, is_posted, approved_at
      FROM document.receipt
      UNION ALL
      SELECT tenant_id, 'service_sheet'::text AS doc_type, status, is_posted, approved_at
      FROM document.service_sheet
    )
    SELECT
      t.code AS tenant,
      d.tenant_id::text AS tenant_id,
      d.doc_type,
      count(*)::text AS value
    FROM fin_docs d
    JOIN master.tenant t ON t.id = d.tenant_id
    WHERE d.status = 'approved'
      AND d.is_posted = false
    GROUP BY t.code, d.tenant_id, d.doc_type
  `);

  for (const row of approvedRows) {
    addSample(samples, "fin_doc_registry_compliance_approved_not_posted", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }

  const entityMismatchRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    WITH fin_docs AS (
      SELECT tenant_id, company_code_id, 'purchase_invoice'::text AS doc_type, id AS doc_id, ap_je_id AS je_id, status, is_posted, posted_at
      FROM document.purchase_invoice
      UNION ALL
      SELECT tenant_id, company_code_id, 'payment_entry'::text AS doc_type, id AS doc_id, payment_je_id AS je_id, status, is_posted, posted_at
      FROM document.payment_entry
      UNION ALL
      SELECT tenant_id, company_code_id, 'receipt'::text AS doc_type, id AS doc_id, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.receipt
      UNION ALL
      SELECT tenant_id, company_code_id, 'service_sheet'::text AS doc_type, id AS doc_id, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.service_sheet
    )
    SELECT
      t.code AS tenant,
      d.tenant_id::text AS tenant_id,
      d.doc_type,
      count(*)::text AS value
    FROM fin_docs d
    JOIN master.tenant t ON t.id = d.tenant_id
    JOIN document.journal_entry je
      ON je.tenant_id = d.tenant_id
     AND je.id = d.je_id
    WHERE (d.is_posted = true OR d.status = 'posted')
      AND (d.posted_at IS NULL OR d.posted_at >= now() - interval '90 days')
      AND je.company_code_id IS DISTINCT FROM d.company_code_id
    GROUP BY t.code, d.tenant_id, d.doc_type
  `);

  for (const row of entityMismatchRows) {
    addSample(samples, "fin_doc_registry_compliance_entity_mismatch", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }

  const bridgeRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    WITH fin_docs AS (
      SELECT tenant_id, 'purchase_invoice'::text AS doc_type, ap_je_id AS je_id, status, is_posted, posted_at
      FROM document.purchase_invoice
      UNION ALL
      SELECT tenant_id, 'payment_entry'::text AS doc_type, payment_je_id AS je_id, status, is_posted, posted_at
      FROM document.payment_entry
      UNION ALL
      SELECT tenant_id, 'receipt'::text AS doc_type, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.receipt
      UNION ALL
      SELECT tenant_id, 'service_sheet'::text AS doc_type, accrual_je_id AS je_id, status, is_posted, posted_at
      FROM document.service_sheet
    )
    SELECT
      t.code AS tenant,
      d.tenant_id::text AS tenant_id,
      d.doc_type,
      count(*)::text AS value
    FROM fin_docs d
    JOIN master.tenant t ON t.id = d.tenant_id
    LEFT JOIN document.journal_entry je
      ON je.tenant_id = d.tenant_id
     AND je.id = d.je_id
    WHERE (d.is_posted = true OR d.status = 'posted')
      AND (d.posted_at IS NULL OR d.posted_at >= now() - interval '90 days')
      AND (d.je_id IS NULL OR je.id IS NULL)
    GROUP BY t.code, d.tenant_id, d.doc_type
  `);

  for (const row of bridgeRows) {
    addSample(samples, "fin_doc_registry_bridge_incomplete", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }

  const closedPeriodRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    SELECT
      t.code AS tenant,
      je.tenant_id::text AS tenant_id,
      COALESCE(je.source_doc_type, 'unknown') AS doc_type,
      count(*)::text AS value
    FROM document.journal_entry je
    JOIN master.tenant t ON t.id = je.tenant_id
    JOIN master.fiscal_period fp
      ON fp.tenant_id = je.tenant_id
     AND fp.id = je.fiscal_period_id
    LEFT JOIN governance.book_period_status bps
      ON bps.tenant_id = je.tenant_id
     AND bps.company_code_id = je.company_code_id
     AND bps.book_id = je.book_id
     AND bps.fiscal_year = je.fiscal_year
     AND bps.period_number = je.period_number
    WHERE je.status = 'posted'
      AND je.source_doc_type IN ('purchase_invoice', 'payment_entry', 'receipt', 'service_sheet')
      AND (je.posted_at IS NULL OR je.posted_at >= now() - interval '90 days')
      AND je.close_override_id IS NULL
      AND (
        (fp.status IN ('hard_close', 'future') AND (fp.hard_closed_at IS NULL OR je.posted_at > fp.hard_closed_at))
        OR (COALESCE(bps.status, 'future') IN ('hard_close', 'future') AND (bps.hard_closed_at IS NULL OR je.posted_at > bps.hard_closed_at))
      )
    GROUP BY t.code, je.tenant_id, COALESCE(je.source_doc_type, 'unknown')
  `);

  for (const row of closedPeriodRows) {
    addSample(samples, "fin_doc_registry_compliance_closed_period_violation", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }

  const scoringRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    SELECT
      t.code AS tenant,
      pi.tenant_id::text AS tenant_id,
      'purchase_invoice'::text AS doc_type,
      count(*)::text AS value
    FROM document.purchase_invoice pi
    JOIN master.tenant t ON t.id = pi.tenant_id
    WHERE pi.status IN ('approved', 'posted', 'partially_paid', 'fully_paid')
      AND COALESCE(pi.posted_at, pi.approved_at, pi.created_at) >= now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1
        FROM document.purchase_invoice_line pil
        WHERE pil.tenant_id = pi.tenant_id
          AND pil.purchase_invoice_id = pi.id
          AND pil.classification_decision <> '{}'::jsonb
      )
    GROUP BY t.code, pi.tenant_id
  `);

  for (const row of scoringRows) {
    addSample(samples, "fin_doc_registry_compliance_approved_without_scoring", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "purchase_invoice",
    }, row.value);
  }
}

async function collectDocumentRegistrySyncMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<SyncRow>(db, sql<SyncRow>`
    SELECT
      t.code AS tenant,
      o.tenant_id::text AS tenant_id,
      count(*) FILTER (WHERE o.status = 'completed')::text AS total,
      count(*) FILTER (WHERE o.status IN ('failed', 'dead_letter'))::text AS failed
    FROM event.outbox o
    JOIN master.tenant t ON t.id = o.tenant_id
    WHERE o.event_type = 'document.registry_sync_requested'
    GROUP BY t.code, o.tenant_id
  `);

  for (const row of rows) {
    addSample(samples, "fin_doc_registry_trigger_sync_count", tenantLabels(row), row.total);
    addSample(samples, "fin_doc_registry_trigger_sync_failed_count", tenantLabels(row), row.failed);
  }

  const fallbackRows = await queryRows<DocumentRegistryRow>(db, sql<DocumentRegistryRow>`
    WITH source_docs AS (
      SELECT tenant_id, 'purchase_invoice'::text AS doc_type, status
      FROM document.purchase_invoice
      UNION ALL
      SELECT tenant_id, 'payment_entry'::text AS doc_type, status
      FROM document.payment_entry
      UNION ALL
      SELECT tenant_id, 'receipt'::text AS doc_type, status
      FROM document.receipt
      UNION ALL
      SELECT tenant_id, 'service_sheet'::text AS doc_type, status
      FROM document.service_sheet
    )
    SELECT
      t.code AS tenant,
      d.tenant_id::text AS tenant_id,
      d.doc_type,
      count(*)::text AS value
    FROM source_docs d
    JOIN master.tenant t ON t.id = d.tenant_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM control.lookup_value lv
      WHERE lv.domain_code = 'canonical_status.' || d.doc_type
        AND lv.status = 'active'
        AND lv.code = d.status
        AND (lv.tenant_id IS NULL OR lv.tenant_id = d.tenant_id)
    )
    GROUP BY t.code, d.tenant_id, d.doc_type
  `);

  for (const row of fallbackRows) {
    addSample(samples, "fin_doc_registry_status_mapping_fallbacks", {
      ...tenantLabels(row),
      doc_type: row.doc_type ?? "unknown",
    }, row.value);
  }
}

async function collectOutboxHealthMetrics(db: DB, samples: MetricSample[]): Promise<void> {
  const rows = await queryRows<OutboxHealthRow>(db, sql<OutboxHealthRow>`
    SELECT
      topic,
      COALESCE(EXTRACT(EPOCH FROM (
        now() - MIN(created_at) FILTER (WHERE status IN ('pending', 'failed', 'processing'))
      )), 0)::text AS oldest_unpublished_seconds,
      COALESCE(SUM(GREATEST(attempts - 1, 0)), 0)::text AS retry_count,
      COUNT(*) FILTER (WHERE status = 'dead_letter')::text AS poison_event_count
    FROM event.outbox
    GROUP BY topic
  `);
  for (const row of rows) {
    const labels = { topic: row.topic ?? "unknown" };
    addSample(samples, "athyper_outbox_oldest_unpublished_seconds", labels, row.oldest_unpublished_seconds);
    addSample(samples, "athyper_outbox_retry_count", labels, row.retry_count);
    addSample(samples, "athyper_outbox_poison_event_count", labels, row.poison_event_count);
  }
}

async function collectSection(db: DB, name: string, collect: MetricSectionCollector): Promise<MetricSectionResult> {
  const samples: MetricSample[] = [];
  try {
    await collect(db, samples);
    return { name, ok: true, samples };
  } catch {
    return { name, ok: false, samples: [] };
  }
}

async function collectGovernanceMetrics(db: DB): Promise<MetricSectionResult[]> {
  return Promise.all([
    collectSection(db, "governance_legal_hold", collectLegalHoldMetrics),
    collectSection(db, "governance_legal_hold_manifest", collectLegalHoldManifestMetrics),
    collectSection(db, "governance_quota", collectQuotaMetrics),
    collectSection(db, "governance_privacy", collectPrivacyMetrics),
    collectSection(db, "governance_archive_jobs", collectArchiveJobMetrics),
  ]);
}

async function collectDocumentRegistryMetrics(db: DB): Promise<MetricSectionResult[]> {
  return Promise.all([
    collectSection(db, "document_registry_compliance", collectDocumentRegistryComplianceMetrics),
    collectSection(db, "document_registry_sync", collectDocumentRegistrySyncMetrics),
  ]);
}

export function createPlatformMetricCollector(db: DB): () => Promise<string[]> {
  let cached: { expiresAt: number; lines: string[] } | null = null;

  return async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.lines;
    }

    const samples: MetricSample[] = [];
    const [governanceResults, documentRegistryResults] = await Promise.all([
      collectGovernanceMetrics(db),
      collectDocumentRegistryMetrics(db),
    ]);
    const outboxResult = await collectSection(db, "outbox_health", collectOutboxHealthMetrics);
    const sectionResults = [...governanceResults, ...documentRegistryResults, outboxResult];

    for (const result of sectionResults) {
      addSample(samples, "athyper_platform_metric_section_up", { section: result.name }, result.ok ? 1 : 0);
      if (result.ok) {
        samples.push(...result.samples);
      }
    }

    if (sectionResults.length > 0 && sectionResults.every((result) => !result.ok)) {
      throw new Error("All platform metric collection sections failed");
    }

    const lines = [
      ...HELP,
      "",
      ...samples.map(renderSample),
    ];
    cached = { expiresAt: now + cacheTtlMs(), lines };
    return lines;
  };
}
