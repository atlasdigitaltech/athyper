CREATE VIEW metadata.entity_publication_status
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    entity_row.id AS entity_id,
    entity_row.tenant_id,
    entity_row.module_id,
    entity_row.entity_code,
    entity_row.entity_class,
    entity_row.ownership_model,
    entity_row.status AS entity_status,
    latest_release.id AS current_release_id,
    latest_release.release_no,
    latest_release.version_label,
    latest_release.revision_id,
    latest_release.contract_schema_code,
    latest_release.contract_schema_version,
    latest_release.contract_hash,
    latest_release.release_hash,
    latest_release.compatibility_level,
    latest_release.target_planes,
    latest_release.published_at,
    CASE
        WHEN latest_release.id IS NULL THEN 'unpublished'
        WHEN latest_release.release_kind = 'retire' THEN 'retired'
        ELSE 'published'
    END AS publication_status
FROM metadata.entity AS entity_row
LEFT JOIN LATERAL (
    SELECT release_row.*
      FROM metadata.entity_release AS release_row
     WHERE release_row.tenant_id IS NOT DISTINCT FROM entity_row.tenant_id
       AND release_row.entity_id = entity_row.id
     ORDER BY release_row.release_no DESC
     LIMIT 1
) AS latest_release ON true;

COMMENT ON VIEW metadata.entity_publication_status IS
  'Derived current publication head. Compilation and plane-delivery status join this view in the compilation/projection phase.';

CREATE VIEW metadata.pii_inventory
WITH (security_invoker = true, security_barrier = true) AS
SELECT entity_row.tenant_id, entity_row.entity_code, field_row.field_key,
       field_row.data_classification, field_row.retention_policy_code,
       published_change_set.change_set_code, published_change_set.published_at
  FROM metadata.entity AS entity_row
  JOIN LATERAL (
      SELECT change_set_row.id, change_set_row.change_set_code, change_set_row.published_at
        FROM metadata.entity_change_set AS change_set_row
       WHERE change_set_row.tenant_id IS NOT DISTINCT FROM entity_row.tenant_id
         AND change_set_row.entity_id = entity_row.id
         AND change_set_row.status = 'published'
       ORDER BY change_set_row.published_at DESC, change_set_row.id DESC
       LIMIT 1
  ) AS published_change_set ON true
  JOIN metadata.entity_field AS field_row
    ON field_row.tenant_id IS NOT DISTINCT FROM entity_row.tenant_id
   AND field_row.entity_id = entity_row.id
   AND field_row.change_set_id = published_change_set.id
 WHERE field_row.status = 'active'
   AND field_row.data_classification IN ('pii','sensitive_pii');

COMMENT ON VIEW metadata.pii_inventory IS 'Current published PII inventory derived only from explicit Entity Metadata classifications.';
