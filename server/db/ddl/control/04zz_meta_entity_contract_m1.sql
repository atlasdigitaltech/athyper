-- ============================================================================
-- Meta Entity Contract M1: version-aware uniqueness and lookup indexes.
-- Legacy entity-level constraints remain only for pre-M1 seed compatibility.
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM control.entity_version
         WHERE status IN ('DRAFT','IN_REVIEW')
         GROUP BY tenant_id, entity_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'M1 preflight failed: multiple open DRAFT/IN_REVIEW versions exist for an entity and tenant';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ev_one_open_work_version_uq
    ON control.entity_version (tenant_id, entity_id) NULLS NOT DISTINCT
    WHERE status IN ('DRAFT','IN_REVIEW');

CREATE UNIQUE INDEX IF NOT EXISTS es_v2_binding_uq_idx
    ON control.entity_surface (
        tenant_id, entity_version_id, v2_mode, surface_key
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS eo_v2_binding_uq_idx
    ON control.entity_operation (
        tenant_id, entity_version_id, permission_code
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS encfg_v2_binding_uq_idx
    ON control.entity_numbering_config (
        tenant_id, entity_version_id, company_code_id, number_field
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS elsm_v2_binding_uq_idx
    ON control.entity_lifecycle_state_mask (
        tenant_id, entity_version_id, lifecycle_state_id
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NOT NULL AND lifecycle_state_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ear_v2_binding_uq_idx
    ON control.entity_action_rule (
        tenant_id, entity_version_id, status, action_code
    ) NULLS NOT DISTINCT
    WHERE entity_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ev_contract_hash_idx
    ON control.entity_version (contract_hash)
    WHERE contract_hash IS NOT NULL;
