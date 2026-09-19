-- seed-contract-version: 1
-- seed-pack: common.control.usage-metric-catalog
-- seed-pack-version: 1.0.0
-- seed-dataset: platform.usage-metric-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Athyper platform usage governance","publisher":"Athyper","source_version":"1.0.0","retrieved_at":"2026-08-30","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.usage_metric_catalog(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:3
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$ BEGIN
    IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
        RAISE EXCEPTION '[common.control.usage-metric-catalog] app.database_plane is missing or invalid';
    END IF;
END $seed_plane_guard$;

INSERT INTO control.usage_metric_catalog (
    code, name, description, unit_code, dimension_type_code, status, created_by
)
VALUES
    (
        'content_item_count', 'Content item count',
        'Number of active content items. Limits may be set per content kind or with the wildcard fallback.',
        'count', 'content_kind', 'active',
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    (
        'attachment_storage_bytes', 'Attachment storage',
        'Bytes occupied by current tenant attachment objects. Each object is counted once regardless of attachment links.',
        'bytes', NULL, 'active',
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    (
        'attachment_item_count', 'Attachment count',
        'Number of active tenant attachment objects. Each object is counted once regardless of attachment links.',
        'count', NULL, 'active',
        '00000000-0000-0000-0000-000000000000'::uuid
    )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit_code = EXCLUDED.unit_code,
    dimension_type_code = EXCLUDED.dimension_type_code,
    status = 'active',
    updated_at = now(),
    updated_by = EXCLUDED.created_by
WHERE (control.usage_metric_catalog.name,
       control.usage_metric_catalog.description,
       control.usage_metric_catalog.unit_code,
       control.usage_metric_catalog.dimension_type_code,
       control.usage_metric_catalog.status)
  IS DISTINCT FROM
      (EXCLUDED.name, EXCLUDED.description, EXCLUDED.unit_code,
       EXCLUDED.dimension_type_code, EXCLUDED.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $seed_assertions$ BEGIN
    IF (SELECT count(*) FROM control.usage_metric_catalog
        WHERE code IN ('content_item_count', 'attachment_storage_bytes', 'attachment_item_count')) <> 3 THEN
        RAISE EXCEPTION '[common.control.usage-metric-catalog] expected-count assertion failed';
    END IF;
    IF EXISTS (
        SELECT 1 FROM control.usage_metric_catalog metric
        LEFT JOIN control.module module ON module.id = metric.module_id
        WHERE metric.code IN ('content_item_count', 'attachment_storage_bytes', 'attachment_item_count')
          AND metric.module_id IS NOT NULL AND module.id IS NULL
    ) THEN
        RAISE EXCEPTION '[common.control.usage-metric-catalog] orphan assertion failed';
    END IF;
    IF EXISTS (
        SELECT code FROM control.usage_metric_catalog
        WHERE code IN ('content_item_count', 'attachment_storage_bytes', 'attachment_item_count')
        GROUP BY code HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION '[common.control.usage-metric-catalog] uniqueness assertion failed';
    END IF;
    IF EXISTS (
        SELECT 1 FROM control.usage_metric_catalog
        WHERE code IN ('content_item_count', 'attachment_storage_bytes', 'attachment_item_count')
          AND (code <> lower(btrim(code)) OR btrim(name) = '' OR unit_code NOT IN ('count', 'bytes') OR status <> 'active')
    ) THEN
        RAISE EXCEPTION '[common.control.usage-metric-catalog] semantic assertion failed';
    END IF;
END $seed_assertions$;
