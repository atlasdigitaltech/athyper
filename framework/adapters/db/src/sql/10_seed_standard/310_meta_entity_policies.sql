/* ============================================================================
   Athyper v2.1 — Meta Entity Policies
   Sets default behavior policies (access, OU scope, audit) for all registered entities.

   Dependencies: meta.entity, meta.entity_policy (from 300_meta_entity_registration.sql)
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
    v_entity_id uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP
        -- ====================================================================
        -- Full governance entities: default_deny + OU subtree + audit enabled
        -- Applies to: ent masters, doc business, fin masters
        -- ====================================================================
        FOR v_entity_id IN
            SELECT id FROM meta.entity
            WHERE tenant_id = v_tenant AND governance_level = 'full'
        LOOP
            INSERT INTO meta.entity_policy (tenant_id, entity_id, access_mode, ou_scope_mode,
                                            audit_mode, created_by)
            VALUES (v_tenant, v_entity_id, 'default_deny', 'subtree', 'enabled', 'system')
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- ====================================================================
        -- Light governance entities: default_deny + no OU scope + audit enabled
        -- Applies to: ref tables, config/rule tables, junction tables
        -- ====================================================================
        FOR v_entity_id IN
            SELECT id FROM meta.entity
            WHERE tenant_id = v_tenant AND governance_level = 'light'
        LOOP
            INSERT INTO meta.entity_policy (tenant_id, entity_id, access_mode, ou_scope_mode,
                                            audit_mode, created_by)
            VALUES (v_tenant, v_entity_id, 'default_deny', 'none', 'enabled', 'system')
            ON CONFLICT DO NOTHING;
        END LOOP;

        -- ====================================================================
        -- Audit-only entities: inherit access + no OU scope + audit enabled
        -- Applies to: transaction/ledger tables, infrastructure tables
        -- ====================================================================
        FOR v_entity_id IN
            SELECT id FROM meta.entity
            WHERE tenant_id = v_tenant AND governance_level = 'audit_only'
        LOOP
            INSERT INTO meta.entity_policy (tenant_id, entity_id, access_mode, ou_scope_mode,
                                            audit_mode, created_by)
            VALUES (v_tenant, v_entity_id, 'inherit', 'none', 'enabled', 'system')
            ON CONFLICT DO NOTHING;
        END LOOP;

    END LOOP;

    RAISE NOTICE 'Entity policies created: %',
        (SELECT count(*) FROM meta.entity_policy);
END $$;
