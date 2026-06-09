-- ============================================================================
-- master/09_lifecycle_instance_backfill.sql
-- Backfill current lifecycle instance rows for document entities that predate
-- the WorkflowLifecycleRuntime kernel.
--
-- This patch intentionally handles only unconditional entity lifecycle bindings.
-- Conditional bindings require payload-aware JSONLogic evaluation and are kept
-- in the service runtime sync path.
-- Before enabling strict runtime reads, compare lifecycle_instance counts against
-- expected source record counts for entities that use conditional bindings.
-- ============================================================================

WITH source_records AS (
    SELECT
        'purchase_invoice'::text AS entity_name,
        pi.tenant_id,
        pi.id::text AS entity_id,
        pi.status,
        COALESCE(pi.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS created_by,
        COALESCE(pi.updated_by, pi.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS updated_by
    FROM document.purchase_invoice pi

    UNION ALL

    SELECT
        'payment_entry'::text AS entity_name,
        pe.tenant_id,
        pe.id::text AS entity_id,
        pe.status,
        COALESCE(pe.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS created_by,
        COALESCE(pe.updated_by, pe.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS updated_by
    FROM document.payment_entry pe

    UNION ALL

    SELECT
        'journal_entry'::text AS entity_name,
        je.tenant_id,
        je.id::text AS entity_id,
        je.status,
        COALESCE(je.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS created_by,
        COALESCE(je.updated_by, je.created_by, '00000000-0000-0000-0000-000000000000'::uuid) AS updated_by
    FROM document.journal_entry je
),
resolved AS (
    SELECT
        src.entity_name,
        src.tenant_id,
        src.entity_id,
        binding.lifecycle_id,
        binding.state_id,
        src.created_by,
        src.updated_by
    FROM source_records src
    JOIN LATERAL (
        SELECT
            el.lifecycle_id,
            ls.id AS state_id
        FROM control.entity_lifecycle el
        JOIN control.lifecycle lc
          ON lc.id = el.lifecycle_id
        JOIN control.lifecycle_state ls
          ON ls.lifecycle_id = lc.id
         AND ls.code = lower(regexp_replace(trim(src.status), '[[:space:]_.-]+', '_', 'g'))
        WHERE el.entity_name = src.entity_name
          AND (el.tenant_id IS NULL OR el.tenant_id = src.tenant_id)
          AND el.conditions IS NULL
          AND lc.is_active = true
        ORDER BY
          CASE WHEN el.tenant_id = src.tenant_id THEN 0 ELSE 1 END,
          el.priority ASC,
          el.created_at ASC
        LIMIT 1
    ) binding ON true
)
INSERT INTO master.lifecycle_instance (
    tenant_id,
    entity_name,
    entity_id,
    lifecycle_id,
    state_id,
    created_by,
    updated_by
)
SELECT
    tenant_id,
    entity_name,
    entity_id,
    lifecycle_id,
    state_id,
    created_by,
    updated_by
FROM resolved
ON CONFLICT (tenant_id, entity_name, entity_id, lifecycle_id)
DO UPDATE SET
    state_id = EXCLUDED.state_id,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by
WHERE master.lifecycle_instance.state_id IS DISTINCT FROM EXCLUDED.state_id;
