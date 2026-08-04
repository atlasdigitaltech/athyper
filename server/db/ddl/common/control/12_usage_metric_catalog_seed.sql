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
    )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit_code = EXCLUDED.unit_code,
    dimension_type_code = EXCLUDED.dimension_type_code,
    status = 'active';
