-- ============================================================================
-- 209: Release Scalability & Governed Export
-- ============================================================================
--
-- Three enhancements:
-- 1. Materialized view for release KPI aggregation (fast dashboard)
-- 2. Unified timeline view with indexes for server-side filtering
-- 3. Audit export governance (export history + content hash)
--
-- Depends on: 207_governed_release_orchestration, 208_release_operations_runtime
-- ============================================================================

SET search_path TO fin, core, public;

-- ============================================================================
-- 1. Materialized View: Release KPI Summary
-- ============================================================================
-- Pre-aggregated per tenant + entity + fiscal_year for fast dashboard loading.
-- Refresh after each release state transition (via application or pg_cron).

CREATE MATERIALIZED VIEW IF NOT EXISTS fin.mv_release_kpi_summary AS
SELECT
    r.tenant_id,
    r.entity_code,
    r.fiscal_year,
    -- Counts
    count(*) FILTER (WHERE r.status IN ('ASSEMBLING', 'READY'))      AS in_progress,
    count(*) FILTER (WHERE r.status IN ('ASSEMBLING', 'READY')
        AND r.is_clean_close = false)                                 AS policy_blocked,
    count(*) FILTER (WHERE r.requires_exception_signoff = true
        AND r.exception_signoff_by IS NULL
        AND r.status IN ('ASSEMBLING', 'READY'))                      AS awaiting_exception_signoff,
    count(*) FILTER (WHERE r.status = 'SUPERSEDED')                   AS superseded_count,
    count(*) FILTER (WHERE r.status = 'RELEASED')                     AS released_count,
    -- Average release duration (hours from assembled_at to released_at)
    avg(EXTRACT(EPOCH FROM (r.released_at - r.assembled_at)) / 3600.0)
        FILTER (WHERE r.released_at IS NOT NULL AND r.assembled_at IS NOT NULL)
        AS avg_release_hours,
    -- Integrity failures (via decision log)
    (SELECT count(*) FROM fin.release_decision_log dl
     WHERE dl.tenant_id = r.tenant_id
       AND dl.command = 'INTEGRITY_CHECK'
       AND dl.result = 'BLOCKED'
       AND EXISTS (
           SELECT 1 FROM fin.pack_release r2
           WHERE r2.id = dl.release_id
             AND r2.entity_code = r.entity_code
             AND r2.fiscal_year = r.fiscal_year
       )
    ) AS integrity_failures,
    -- Freshness
    now() AS refreshed_at
FROM fin.pack_release r
GROUP BY r.tenant_id, r.entity_code, r.fiscal_year;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_release_kpi_pk
    ON fin.mv_release_kpi_summary(tenant_id, entity_code, fiscal_year);

CREATE INDEX IF NOT EXISTS idx_mv_release_kpi_tenant
    ON fin.mv_release_kpi_summary(tenant_id);

COMMENT ON MATERIALIZED VIEW fin.mv_release_kpi_summary IS
    'Pre-aggregated release KPIs per tenant/entity/year. Refresh after state transitions. Application calls: REFRESH MATERIALIZED VIEW CONCURRENTLY fin.mv_release_kpi_summary;';

-- ============================================================================
-- 2. Unified Timeline View (for server-side filtered queries)
-- ============================================================================
-- Replaces the UNION ALL in the BFF route with a persistent view.
-- Allows WHERE pushdown on source, severity, timestamp, and text search.

DROP VIEW IF EXISTS fin.vw_release_timeline CASCADE;
CREATE OR REPLACE VIEW fin.vw_release_timeline AS
-- Decision log events
SELECT
    d.id,
    d.tenant_id,
    d.release_id,
    d.created_at AS event_at,
    'decision'::varchar(20) AS source,
    d.command || ' — ' || d.result AS title,
    NULL::text AS detail,
    CASE d.result
        WHEN 'BLOCKED' THEN 'HIGH'
        WHEN 'DEFERRED' THEN 'WARNING'
        ELSE 'INFO'
    END::varchar(10) AS severity,
    d.command,
    d.result AS decision_result,
    NULL::varchar(50) AS event_code,
    NULL::varchar(50) AS override_reason_code,
    d.actor_id,
    d.policy_evaluation AS payload
FROM fin.release_decision_log d

UNION ALL

-- Notification events
SELECT
    n.id,
    n.tenant_id,
    n.release_id,
    n.created_at AS event_at,
    'notification'::varchar(20) AS source,
    replace(n.event_code, '_', ' ') AS title,
    n.summary AS detail,
    n.severity::varchar(10),
    NULL AS command,
    NULL AS decision_result,
    n.event_code::varchar(50),
    NULL AS override_reason_code,
    NULL AS actor_id,
    n.detail_payload AS payload
FROM fin.release_notification_event n

UNION ALL

-- Release activity events
SELECT
    a.id,
    a.tenant_id,
    a.release_id,
    a.created_at AS event_at,
    'lifecycle'::varchar(20) AS source,
    a.event_type AS title,
    NULL AS detail,
    'INFO'::varchar(10) AS severity,
    NULL AS command,
    NULL AS decision_result,
    NULL AS event_code,
    NULL AS override_reason_code,
    a.actor_id,
    a.payload
FROM fin.pack_release_activity a

UNION ALL

-- Close overrides (via close_run link)
SELECT
    o.id,
    o.tenant_id,
    r.id AS release_id,
    o.requested_at AS event_at,
    'override'::varchar(20) AS source,
    o.reason_code || COALESCE(' (' || o.reason_subcode || ')', '') || ' — ' || o.status AS title,
    o.reason_detail AS detail,
    CASE o.status
        WHEN 'REJECTED' THEN 'HIGH'
        WHEN 'PENDING' THEN 'WARNING'
        ELSE 'INFO'
    END::varchar(10) AS severity,
    NULL AS command,
    NULL AS decision_result,
    NULL AS event_code,
    o.reason_code::varchar(50) AS override_reason_code,
    NULL AS actor_id,
    jsonb_build_object(
        'scope', o.override_scope,
        'impact_amount', o.impact_amount,
        'impact_currency', o.impact_currency
    ) AS payload
FROM fin.close_override o
JOIN fin.pack_release r ON r.close_run_id = o.run_id;

COMMENT ON VIEW fin.vw_release_timeline IS
    'Unified timeline merging decisions, notifications, lifecycle events, and overrides for server-side filtered queries.';

-- Indexes on the source tables that support filtered timeline queries
-- (Most already exist from 207-208; adding any missing ones)
CREATE INDEX IF NOT EXISTS idx_fin_release_activity_event_type
    ON fin.pack_release_activity(release_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fin_release_notif_severity
    ON fin.release_notification_event(release_id, severity, created_at DESC);

-- ============================================================================
-- 3. Governed Audit Export
-- ============================================================================

-- 3a. Export history table — tracks every audit package export
CREATE TABLE IF NOT EXISTS fin.release_export_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
    entity_code     varchar(20) NOT NULL,
    release_id      uuid NOT NULL REFERENCES fin.pack_release(id),
    -- Export metadata
    exported_by     uuid,
    exported_at     timestamptz NOT NULL DEFAULT now(),
    export_format   varchar(20) NOT NULL DEFAULT 'EXCEL'
                    CHECK (export_format IN ('EXCEL', 'PDF', 'JSON')),
    -- Content hash for tamper detection
    content_hash    varchar(128) NOT NULL,
    hash_algorithm  varchar(10) NOT NULL DEFAULT 'SHA-256',
    -- Scope: what was included
    included_sections text[] NOT NULL DEFAULT ARRAY[
        'summary', 'decisions', 'overrides', 'manifest',
        'integrity', 'notifications', 'sla', 'timeline'
    ],
    -- Snapshot of release state at export time
    release_status_at_export varchar(20) NOT NULL,
    is_clean_close_at_export boolean,
    override_count_at_export integer NOT NULL DEFAULT 0,
    integrity_valid_at_export boolean,
    -- Version tracking
    export_version  smallint NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_fin_export_log_release
    ON fin.release_export_log(release_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_export_log_tenant
    ON fin.release_export_log(tenant_id, entity_code, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_export_log_hash
    ON fin.release_export_log(content_hash);

COMMENT ON TABLE fin.release_export_log IS
    'Immutable log of audit package exports. Content hash enables tamper detection; export history supports compliance evidence.';

-- Immutability guards
DROP FUNCTION IF EXISTS fin.trg_export_log_immutable() CASCADE;
CREATE OR REPLACE FUNCTION fin.trg_export_log_immutable()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'release_export_log records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_export_log_no_update
    BEFORE UPDATE ON fin.release_export_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_export_log_immutable();

CREATE TRIGGER trg_export_log_no_delete
    BEFORE DELETE ON fin.release_export_log
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_export_log_immutable();

-- 3b. Helper function to log an export and return the record
DROP FUNCTION IF EXISTS fin.log_release_export(uuid, varchar, uuid, uuid, varchar, varchar, text[]) CASCADE;
CREATE OR REPLACE FUNCTION fin.log_release_export(
    p_tenant_id         uuid,
    p_entity_code       varchar,
    p_release_id        uuid,
    p_exported_by       uuid,
    p_export_format     varchar DEFAULT 'EXCEL',
    p_content_hash      varchar DEFAULT '',
    p_included_sections text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_release   record;
    v_integrity boolean;
    v_export_id uuid;
BEGIN
    -- Get current release state
    SELECT status, is_clean_close, override_count
    INTO v_release
    FROM fin.pack_release
    WHERE id = p_release_id AND tenant_id = p_tenant_id;

    IF v_release IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Release not found');
    END IF;

    -- Get latest integrity result
    SELECT dl.result = 'APPROVED'
    INTO v_integrity
    FROM fin.release_decision_log dl
    WHERE dl.release_id = p_release_id
      AND dl.command = 'INTEGRITY_CHECK'
    ORDER BY dl.created_at DESC
    LIMIT 1;

    INSERT INTO fin.release_export_log (
        tenant_id, entity_code, release_id,
        exported_by, export_format, content_hash,
        included_sections,
        release_status_at_export, is_clean_close_at_export,
        override_count_at_export, integrity_valid_at_export
    ) VALUES (
        p_tenant_id, p_entity_code, p_release_id,
        p_exported_by, p_export_format, p_content_hash,
        COALESCE(p_included_sections, ARRAY[
            'summary', 'decisions', 'overrides', 'manifest',
            'integrity', 'notifications', 'sla', 'timeline'
        ]),
        v_release.status, v_release.is_clean_close,
        v_release.override_count, v_integrity
    )
    RETURNING id INTO v_export_id;

    RETURN jsonb_build_object(
        'success', true,
        'export_id', v_export_id,
        'release_status', v_release.status,
        'integrity_valid', v_integrity
    );
END;
$$;

COMMENT ON FUNCTION fin.log_release_export(uuid, varchar, uuid, uuid, varchar, varchar, text[]) IS
    'Records an audit package export with signed metadata. Returns export_id for client-side artifact stamping.';
