-- Table-owned seed for control.entity_version
-- Consolidated from platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.
-- In explicit rebuild mode, 005_rebuild_entity_metadata.sql clears the
-- metadata graph; the provisioner forces this file to recreate version rows.


-- ============================================================
-- SOURCE: server/db/seed/platform/004_entity_engine/020_entities.sql
-- ============================================================


-- tax_group is backed by control.tax_group, so it is not picked up by the
-- master.* bulk version/field seed. Register the minimal display metadata here.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'tax_group' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


-- ── business_partner_bank_account: entity_version ────────────────────────────
-- Explicit version needed: 025_entity_versions may have run before this entity
-- was added, leaving it without an EFFECTIVE version.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'v_business_partner_bank_account' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'party_identifier' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'party_tax_profile' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'certification' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'party_contact_person' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'party_governance_relation' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'v_business_partner_address' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_block' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'customer_qualification' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_qualification' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer_app_index'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier_app_index'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET status = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000';


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_order'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET status = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000';


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(), '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.table_schema = 'document' AND e.table_name = 'journal_line'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(), '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.table_schema = 'document' AND e.table_name = 'journal_line_reference'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET status = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000';


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'company_code_supplier_intent_policy' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_posting_override' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'customer_block' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_commodity_category' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'v_business_partner_role_summary'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'v_business_partner_app_index'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


-- ============================================================
-- REPAIR / BACKFILL
-- ============================================================

-- === SOURCE: 006_document_patches.sql (inside DO block â€” entity_version repair for PI/PIL/ACCD) ===
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from,
    change_type, created_by, updated_by
)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(), 'fix',
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
 WHERE e.entity_code IN (
           'purchase_invoice',
           'purchase_invoice_line',
           'accounting_distribution'
       )
   AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
   SET status = 'EFFECTIVE',
       effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000';


-- 2. control.entity_version
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'accounting_profile' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
   SET status = 'EFFECTIVE',
       label = COALESCE(control.entity_version.label, EXCLUDED.label),
       change_type = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
       effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from, now()),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE (
           control.entity_version.status <> 'EFFECTIVE'
        OR control.entity_version.effective_from IS NULL
        OR control.entity_version.label IS NULL
        OR control.entity_version.change_type IS NULL
       )
   AND NOT EXISTS (
       SELECT 1
         FROM control.entity_version ev_effective
        WHERE ev_effective.entity_id = control.entity_version.entity_id
          AND ev_effective.status = 'EFFECTIVE'
          AND ev_effective.id <> control.entity_version.id
   );


UPDATE control.entity_version ev
SET version_hash = encode(sha256(convert_to(
        jsonb_build_object(
            'version', jsonb_build_object(
                'id', ev.id,
                'entity_id', ev.entity_id,
                'version_no', ev.version_no,
                'behaviors', ev.behaviors
            ),
            'entity', jsonb_build_object(
                'entity_code', e.entity_code,
                'name', e.name,
                'slug', e.slug,
                'entity_class', e.entity_class,
                'table_schema', e.table_schema,
                'table_name', e.table_name,
                'backing_type', e.backing_type
            ),
            'fields', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ef.id,
                        'name', ef.name,
                        'column_name', ef.column_name,
                        'label', ef.label,
                        'data_type', ef.data_type,
                        'ui_type', ef.ui_type,
                        'cardinality', ef.cardinality,
                        'origin', ef.origin,
                        'is_required', ef.is_required,
                        'is_searchable', ef.is_searchable,
                        'is_filterable', ef.is_filterable,
                        'is_sortable', ef.is_sortable,
                        'is_read_only', ef.is_read_only,
                        'validation', ef.validation,
                        'reference_config', ef.reference_config,
                        'sort_order', ef.sort_order
                    )
                    ORDER BY ef.sort_order, ef.name, ef.id
                )
                FROM control.entity_field ef
                WHERE ef.entity_version_id = ev.id
                  AND ef.tenant_id IS NULL
                  AND ef.is_active = true
            ), '[]'::jsonb)
        )::text,
        'UTF8'
    )), 'hex'),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE ev.entity_id = e.id
  AND ev.tenant_id IS NULL
  AND e.tenant_id IS NULL
  AND e.entity_code = 'accounting_profile'
  AND ev.version_no = 1;


-- ============================================================
-- SCHEMA COVERAGE: entity_version backfill (from 035_version_fields)
-- ============================================================
-- === SOURCE: 035_version_fields/017_fields_master_schema_coverage.sql ===
INSERT INTO control.entity_version (
    entity_id,
    tenant_id,
    version_no,
    status,
    label,
    change_type,
    effective_from,
    created_by,
    updated_by
)
SELECT
    e.id,
    e.tenant_id,
    1,
    'EFFECTIVE',
    'Initial master schema coverage version',
    'structural',
    now(),
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
FROM control.entity e
WHERE e.table_schema = 'master'
  AND e.ownership_model = 'system'
  AND e.feature_flags ->> 'metadata_coverage_source' = 'master_schema_coverage'
ON CONFLICT (entity_id, version_no) DO UPDATE
SET
    status = 'EFFECTIVE',
    label = COALESCE(control.entity_version.label, EXCLUDED.label),
    change_type = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
    effective_from = COALESCE(control.entity_version.effective_from, now()),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000001'
WHERE control.entity_version.status <> 'EFFECTIVE'
   OR control.entity_version.effective_from IS NULL;


-- === SOURCE: 035_version_fields/018_fields_governed_schema_coverage.sql ===
INSERT INTO control.entity_version (
    entity_id,
    tenant_id,
    version_no,
    status,
    label,
    change_type,
    effective_from,
    created_by,
    updated_by
)
SELECT
    e.id,
    e.tenant_id,
    1,
    'EFFECTIVE',
    'Initial governed metadata coverage version',
    'structural',
    now(),
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.ownership_model = 'system'
  AND e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
ON CONFLICT (entity_id, version_no) DO UPDATE
SET
    status = 'EFFECTIVE',
    label = COALESCE(control.entity_version.label, EXCLUDED.label),
    change_type = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
    effective_from = COALESCE(control.entity_version.effective_from, now()),
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE control.entity_version.status <> 'EFFECTIVE'
   OR control.entity_version.effective_from IS NULL;


-- ============================================================
-- SOURCE: server/db/seed/platform/004_entity_engine/025_entity_versions_and_canonical_fields.sql
-- ============================================================

-- 025_entity_versions_and_canonical_fields.sql
-- Version scaffold: entity version 1 creation, coverage backfill, and canonical field dictionary.
-- Sources: 025_entity_versions.sql + 026_entity_version_coverage_backfill.sql + 030_canonical_fields/000_canonical_dictionary.sql

-- === SOURCE: 025_entity_versions.sql ===

-- 900_seed_data/010_system/entity_engine/025_entity_versions.sql
-- Creates version 1 (EFFECTIVE) for every master.* system entity registered above.
-- Run AFTER all 020_entities/*.sql files.
-- The entity INSERT trigger auto-creates entity_publish_state — do NOT seed it manually.
-- Idempotent: ON CONFLICT (entity_id, version_no) DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    r    record;
    cnt  int := 0;
BEGIN
    FOR r IN
        SELECT e.id, e.tenant_id
        FROM   control.entity e
        WHERE  e.table_schema = 'master'
          AND  e.ownership_model = 'system'
          AND  NOT EXISTS (
              SELECT 1 FROM control.entity_version ev
              WHERE  ev.entity_id = e.id AND ev.version_no = 1
          )
        ORDER BY e.name
    LOOP
        INSERT INTO control.entity_version (
            entity_id, tenant_id, version_no, status,
            label, change_type, effective_from, created_by
        ) VALUES (
            r.id, r.tenant_id, 1, 'EFFECTIVE',
            'Initial Version', 'structural',
            now(),
            v_su
        );
        cnt := cnt + 1;
    END LOOP;

    RAISE NOTICE 'control.entity_version: % rows inserted (version 1 for master system entities)', cnt;
END $$;


-- === SOURCE: 026_entity_version_coverage_backfill.sql ===

-- 004_entity_engine/026_entity_version_coverage_backfill.sql
-- Ensures every control.entity row has a version-1 entity_version entry,
-- and normalises label, change_type, and effective_from on all existing version-1 rows.
--
-- Run AFTER all 020_entities/*.sql and 025_entity_versions.sql files.
-- Idempotent: UPDATE touches only rows that differ; INSERT uses ON CONFLICT DO NOTHING.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_upd integer;
    v_ins integer;
BEGIN
    -- 1. Normalise label, change_type, effective_from on all existing version-1 rows
    UPDATE control.entity_version
       SET label          = 'Initial Version',
           version_no     = 1,
           change_type    = COALESCE(change_type, 'structural'),
           effective_from = COALESCE(effective_from, created_at),
           updated_at     = now(),
           updated_by     = v_su
     WHERE version_no = 1
       AND (
           label IS DISTINCT FROM 'Initial Version'
           OR change_type IS NULL
           OR effective_from IS NULL
       );

    GET DIAGNOSTICS v_upd = ROW_COUNT;

    -- 2. Insert version 1 for any entity still missing a version record
    INSERT INTO control.entity_version (
        entity_id, tenant_id, version_no, status,
        label, change_type, effective_from, created_by
    )
    SELECT
        e.id, e.tenant_id, 1, 'EFFECTIVE',
        'Initial Version', 'structural',
        now(), v_su
    FROM control.entity e
    WHERE NOT EXISTS (
        SELECT 1 FROM control.entity_version ev
         WHERE ev.entity_id = e.id AND ev.version_no = 1
    )
    ON CONFLICT (entity_id, version_no) DO NOTHING;

    GET DIAGNOSTICS v_ins = ROW_COUNT;

    RAISE NOTICE 'entity_version backfill: % rows normalised, % new version-1 rows inserted', v_upd, v_ins;
END $$;
