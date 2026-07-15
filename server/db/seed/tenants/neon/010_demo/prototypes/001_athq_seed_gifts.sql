-- ============================================================================
-- ATHYPER NEON DEMO - ATHQ SEED GIFT PROTOTYPE
-- ============================================================================
-- Scope: Athyper Group Holdings only (company_code = ATHQ).
-- Purpose: Live database-backed prototype records for the generic document
--          entity/import flow.
-- Idempotent: Yes, keyed by (tenant_id, company_code_id, gift_code).
-- ============================================================================

DO $$
DECLARE
    v_tid uuid;
    v_company_code_id uuid;
    v_su uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
    SELECT id
      INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'athyper';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_athq_seed_gifts] athyper tenant not found - run 000_tenant.sql first';
    END IF;

    SELECT id
      INTO v_company_code_id
      FROM master.company_code
     WHERE tenant_id = v_tid
       AND code = 'ATHQ';

    IF v_company_code_id IS NULL THEN
        RAISE EXCEPTION '[001_athq_seed_gifts] ATHQ company code not found - run 100_org_structure/200_demo_legal_entities.sql first';
    END IF;

    WITH rows (
        gift_code,
        title,
        description,
        recipient_name,
        recipient_email,
        gift_type,
        gift_value,
        currency_code,
        source_ref,
        source_payload,
        metadata,
        status
    ) AS (
        VALUES
        (
            'SG-ATHQ-0001',
            'Founder Welcome Seed Gift',
            'Prototype seed gift for validating ATHQ holding-company recipient onboarding.',
            'Alya Rahman',
            'alya.rahman@example.athyper.test',
            'welcome',
            450.00::numeric,
            'MYR',
            'neon://seed_gift/athq/welcome-0001',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"welcome-0001"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"manual_seed"}'::jsonb,
            'active'
        ),
        (
            'SG-ATHQ-0002',
            'Partner Appreciation Seed Gift',
            'Gift record used to exercise external partner recipient details and source references.',
            'Daniel Tan',
            'daniel.tan@example.partner.test',
            'partner_appreciation',
            750.00::numeric,
            'MYR',
            'neon://seed_gift/athq/partner-0002',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"partner-0002"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"partner"}'::jsonb,
            'active'
        ),
        (
            'SG-ATHQ-0003',
            'Innovation Sprint Seed Gift',
            'Internal recognition fixture for validating import, filtering, and attachment linking.',
            'Priya Menon',
            'priya.menon@example.athyper.test',
            'recognition',
            300.00::numeric,
            'MYR',
            'neon://seed_gift/athq/innovation-0003',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"innovation-0003"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"internal"}'::jsonb,
            'draft'
        ),
        (
            'SG-ATHQ-0004',
            'Board Guest Seed Gift',
            'Board guest gifting fixture for validating high-value review and export cases.',
            'Maya Khalid',
            'maya.khalid@example.guest.test',
            'board_guest',
            1250.00::numeric,
            'MYR',
            'neon://seed_gift/athq/board-0004',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"board-0004"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"board"}'::jsonb,
            'draft'
        ),
        (
            'SG-ATHQ-0005',
            'Community Showcase Seed Gift',
            'Community-program fixture for validating archived records remain searchable.',
            'Nora Lim',
            'nora.lim@example.community.test',
            'community',
            200.00::numeric,
            'MYR',
            'neon://seed_gift/athq/community-0005',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"community-0005"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"community"}'::jsonb,
            'archived'
        ),
        (
            'SG-ATHQ-0006',
            'Executive Briefing Seed Gift',
            'Executive briefing fixture for testing import updates by gift code.',
            'Omar Ismail',
            'omar.ismail@example.athyper.test',
            'briefing',
            500.00::numeric,
            'MYR',
            'neon://seed_gift/athq/briefing-0006',
            '{"source":"neon_demo_seed","batch":"athq-seed-gift-prototype","external_id":"briefing-0006"}'::jsonb,
            '{"prototype":true,"company_code":"ATHQ","channel":"executive"}'::jsonb,
            'active'
        )
    )
    INSERT INTO document.seed_gift (
        tenant_id,
        company_code_id,
        gift_code,
        title,
        description,
        recipient_name,
        recipient_email,
        gift_type,
        gift_value,
        currency_code,
        source_ref,
        source_payload,
        metadata,
        status,
        status_changed_at,
        status_changed_by,
        created_by
    )
    SELECT
        v_tid,
        v_company_code_id,
        r.gift_code,
        r.title,
        r.description,
        r.recipient_name,
        r.recipient_email,
        r.gift_type,
        r.gift_value,
        r.currency_code,
        r.source_ref,
        r.source_payload,
        r.metadata,
        r.status,
        now(),
        v_su,
        v_su
    FROM rows r
    ON CONFLICT (tenant_id, company_code_id, gift_code) DO UPDATE
    SET title             = EXCLUDED.title,
        description       = EXCLUDED.description,
        recipient_name    = EXCLUDED.recipient_name,
        recipient_email   = EXCLUDED.recipient_email,
        gift_type         = EXCLUDED.gift_type,
        gift_value        = EXCLUDED.gift_value,
        currency_code     = EXCLUDED.currency_code,
        source_ref        = EXCLUDED.source_ref,
        source_payload    = EXCLUDED.source_payload,
        metadata          = EXCLUDED.metadata,
        status            = EXCLUDED.status,
        status_changed_at = CASE
                                WHEN document.seed_gift.status IS DISTINCT FROM EXCLUDED.status THEN now()
                                ELSE document.seed_gift.status_changed_at
                            END,
        status_changed_by = CASE
                                WHEN document.seed_gift.status IS DISTINCT FROM EXCLUDED.status THEN v_su
                                ELSE document.seed_gift.status_changed_by
                            END,
        updated_at        = now(),
        updated_by        = v_su;

    RAISE NOTICE '[001_athq_seed_gifts] Seeded ATHQ seed gift prototype records';
END $$;
