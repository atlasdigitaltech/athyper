-- ============================================================================
-- TECHNOSTAT - LEGAL ENTITY NETWORK ACCOUNTS
-- ============================================================================

DO $tksa_legal_entity_network_accounts$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[005_legal_entity_network_accounts] technostat tenant not found'; END IF;

    WITH seed(legal_entity_code, account_code) AS (
        VALUES
            ('LE-TKSA', 'BNA-1000000018'),
            ('LE-SSK',  'BNA-1000000019'),
            ('LE-TEGY', 'BNA-1000000020'),
            ('LE-SDTX', 'BNA-1000000021')
    )
    INSERT INTO master.legal_entity_network_account (
        tenant_id, legal_entity_id,
        provider_code, account_code, account_role,
        is_default, sync_status, last_synced_at, status,
        metadata, created_by
    )
    SELECT
        v_tid, le.id,
        'athyper_mesh', seed.account_code, 'both',
        true, 'synced', now(), 'active',
        jsonb_build_object(
            'seed', 'athyper_phase1',
            'tenant_code', 'technostat',
            'legal_entity_code', seed.legal_entity_code
        ),
        v_su
    FROM seed
    JOIN master.legal_entity le
      ON le.tenant_id = v_tid
     AND le.code = seed.legal_entity_code
    ON CONFLICT (tenant_id, legal_entity_id, provider_code, account_code, account_role) DO UPDATE SET
        is_default     = EXCLUDED.is_default,
        sync_status    = EXCLUDED.sync_status,
        last_synced_at = now(),
        status         = EXCLUDED.status,
        metadata       = master.legal_entity_network_account.metadata || EXCLUDED.metadata,
        updated_at     = now(),
        updated_by     = v_su;

    RAISE NOTICE '[005_legal_entity_network_accounts] technostat BNA accounts seeded';
END $tksa_legal_entity_network_accounts$;
