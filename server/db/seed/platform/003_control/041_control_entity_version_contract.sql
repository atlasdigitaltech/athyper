-- Targeted version-1 seeds + coverage backfill. Trigger on control.entity
-- auto-creates entity_publish_state â€” never seed it manually.

-- tax_group lives in control.* so the master.* bulk seed skips it; register here.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'tax_group' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;


-- business_partner_bank_account may pre-date the bulk version backfill and lack an EFFECTIVE version.
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


-- Repair: force EFFECTIVE on PI / PIL / ACCD versions in case prior runs left them DRAFT.
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


-- Schema-coverage backfill: master.* entities flagged metadata_coverage_source.
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


-- Same backfill for governed_schema_coverage entities (cross-schema).
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


-- Sweep: insert version 1 for every system-owned master entity still missing one.
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

-- Final sweep across all entities (any schema): normalise version-1 fields then
-- insert a missing version-1 row. UPDATE guard skips rows already matching.
DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_upd integer;
    v_ins integer;
BEGIN
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

-- Phase 3: materialize one typed contract row for every effective version.
-- This is a compatibility backfill only; compiler consumers still read the
-- legacy entity columns until the execution compiler migration phase.
INSERT INTO control.entity_version_contract (
    entity_version_id, tenant_id, catalog_enabled, api_exposure,
    backing_type, table_schema, table_name, key_strategy, primary_key,
    tenant_column, read_capability, write_capability, source_kind,
    created_by, updated_by
)
SELECT
    ev.id, ev.tenant_id, true,
    CASE WHEN e.runtime_enabled THEN 'API' ELSE 'CATALOG_ONLY' END,
    e.backing_type, e.table_schema, e.table_name,
    CASE WHEN e.primary_key IS NULL THEN 'none' ELSE 'single' END,
    e.primary_key, e.tenant_column, e.read_capability, e.write_capability,
    CASE WHEN e.feature_flags ->> 'metadata_coverage_source' = 'governed_schema_coverage'
         THEN 'derived' ELSE 'explicit' END,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ev.status = 'EFFECTIVE'
ON CONFLICT (entity_version_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    catalog_enabled = EXCLUDED.catalog_enabled,
    api_exposure = EXCLUDED.api_exposure,
    backing_type = EXCLUDED.backing_type,
    table_schema = EXCLUDED.table_schema,
    table_name = EXCLUDED.table_name,
    key_strategy = EXCLUDED.key_strategy,
    primary_key = EXCLUDED.primary_key,
    tenant_column = EXCLUDED.tenant_column,
    read_capability = EXCLUDED.read_capability,
    write_capability = EXCLUDED.write_capability,
    source_kind = EXCLUDED.source_kind,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

DO $$
BEGIN
    RAISE NOTICE 'entity_version_contract: % effective version contracts materialized',
        (SELECT count(*) FROM control.entity_version_contract);
END $$;
