-- ============================================================================
-- ATHYPER - LEGAL ENTITY NETWORK ACCOUNTS
-- ============================================================================
-- Neon stores the local business meaning of each BNA account. Mesh owns the
-- actual network account, connection graph, and document exchange lifecycle.
-- ============================================================================

DO $athq_legal_entity_network_accounts$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[005_legal_entity_network_accounts] athyper tenant not found'; END IF;

    WITH seed(legal_entity_code, account_code) AS (
        VALUES
            ('LE-ATHQ', 'BNA-1000000001'),
            ('LE-AMRE', 'BNA-1000000002'),
            ('LE-AQTU', 'BNA-1000000003'),
            ('LE-ASAC', 'BNA-1000000004'),
            ('LE-AQTS', 'BNA-1000000005'),
            ('LE-AUET', 'BNA-1000000006'),
            ('LE-ASAH', 'BNA-1000000007'),
            ('LE-AUIC', 'BNA-1000000008'),
            ('LE-ASGF', 'BNA-1000000009'),
            ('LE-AITM', 'BNA-1000000010'),
            ('LE-ACFB', 'BNA-1000000011'),
            ('LE-ADPM', 'BNA-1000000012'),
            ('LE-ATEM', 'BNA-1000000013'),
            ('LE-ASPE', 'BNA-1000000014'),
            ('LE-AUKA', 'BNA-1000000015'),
            ('LE-AJED', 'BNA-1000000016'),
            ('LE-APHS', 'BNA-1000000017')
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
            'tenant_code', 'athyper',
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

    RAISE NOTICE '[005_legal_entity_network_accounts] athyper BNA accounts seeded';
END $athq_legal_entity_network_accounts$;
