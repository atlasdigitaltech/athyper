-- =============================================================================
-- 010_demo/200_finance/271_bank_extended.sql
-- Extended banking seed for all 17 Athyper company codes.
--
-- Per company: 6 new accounts in addition to the domestic primary from 001_
--   usd_intl    — Citibank N.A. USD international account
--   neobank     — Revolut Business local-currency account
--   correspondent — HSBC Bank USA correspondent USD account
--   fx_broker   — Wise USD FX account
--   wallet      — PayPal USD wallet
--   payment     — Stripe USD payment account
--
-- Also seeds:
--   bank_party          (6 global institutions)
--   address + link      (registered address per institution)
--   contact_link + email/phone (support contact per institution)
--   bank_account_house_config (for all new + backfill domestic accounts)
--
-- Depends:  001_bank_accounts_per_company.sql, 003_address_contacts.sql,
--           200_finance/201_company_chart_assignments.sql (COA / GL accounts)
-- Idempotent: Yes — ON CONFLICT / NOT EXISTS guards throughout
-- =============================================================================

DO $bank_ext$
DECLARE
    v_tid        uuid;
    v_su         uuid        := '00000000-0000-0000-0000-000000000000';
    v_now        timestamptz := now();
    v_meta       jsonb       := '{"_seed":{"batch":"004_bank_extended","version":"1.0.0"}}'::jsonb;

    -- ── Bank party UUIDs ────────────────────────────────────────────────────
    v_bp_citi    uuid := 'dd003000-0000-0000-0000-000000000001';
    v_bp_revolut uuid := 'dd003000-0000-0000-0000-000000000002';
    v_bp_hsbc    uuid := 'dd003000-0000-0000-0000-000000000003';
    v_bp_wise    uuid := 'dd003000-0000-0000-0000-000000000004';
    v_bp_paypal  uuid := 'dd003000-0000-0000-0000-000000000005';
    v_bp_stripe  uuid := 'dd003000-0000-0000-0000-000000000006';

    -- ── GL account IDs (resolved dynamically from COA seed) ─────────────────
    v_gl_local   uuid;  -- IFRS-A-CASH-LOCAL  / USGAAP-A-CASH-CHECKING
    v_gl_usd     uuid;  -- IFRS-A-CASH-USD    / USGAAP-A-CASH-CHECKING
    v_gl_oper    uuid;  -- IFRS-A-CASH-OPER   / USGAAP-A-CASH-OPER

    -- ── Loop vars ────────────────────────────────────────────────────────────
    v_addr_id    uuid;
    v_cl_id      uuid;
    rec          record;
BEGIN
    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[004_bank_extended] Athyper tenant not found';
    END IF;

    -- ── Resolve GL accounts (IFRS preferred; GAAP fallback) ─────────────────
    SELECT id INTO v_gl_local FROM master.gl_account
    WHERE tenant_id = v_tid AND status = 'active'
      AND code IN ('IFRS-A-CASH-LOCAL', 'USGAAP-A-CASH-CHECKING')
    ORDER BY CASE code WHEN 'IFRS-A-CASH-LOCAL' THEN 1 ELSE 2 END
    LIMIT 1;

    SELECT id INTO v_gl_usd FROM master.gl_account
    WHERE tenant_id = v_tid AND status = 'active'
      AND code IN ('IFRS-A-CASH-USD', 'USGAAP-A-CASH-CHECKING')
    ORDER BY CASE code WHEN 'IFRS-A-CASH-USD' THEN 1 ELSE 2 END
    LIMIT 1;

    SELECT id INTO v_gl_oper FROM master.gl_account
    WHERE tenant_id = v_tid AND status = 'active'
      AND code IN ('IFRS-A-CASH-OPER', 'USGAAP-A-CASH-OPER')
    ORDER BY CASE code WHEN 'IFRS-A-CASH-OPER' THEN 1 ELSE 2 END
    LIMIT 1;

    IF v_gl_local IS NULL OR v_gl_usd IS NULL OR v_gl_oper IS NULL THEN
        RAISE EXCEPTION '[004_bank_extended] GL cash accounts not resolved — run COA framework seed first';
    END IF;

    -- =========================================================================
    -- §1  BANK PARTIES  (6 global institutions)
    -- =========================================================================
    INSERT INTO master.bank_party (
        id, tenant_id, code, name, country_code, institution_type,
        bic, supports_swift, supports_local_clearing, supports_sepa, supports_ach,
        metadata, status, created_by, created_at
    ) VALUES
        (v_bp_citi,    v_tid, 'BP-CITI-US',    'Citibank N.A.',         'US', 'bank',             'CITIUS33', true,  true,  false, true,  v_meta, 'active', v_su, v_now),
        (v_bp_revolut, v_tid, 'BP-REVOLUT-GB', 'Revolut Business Ltd.', 'GB', 'neobank',          'REVOGB21', true,  true,  true,  false, v_meta, 'active', v_su, v_now),
        (v_bp_hsbc,    v_tid, 'BP-HSBC-US',    'HSBC Bank USA N.A.',    'US', 'correspondent_bank','MRMDUS33', true,  true,  false, true,  v_meta, 'active', v_su, v_now),
        (v_bp_wise,    v_tid, 'BP-WISE-US',    'Wise US Inc.',          'US', 'fx_broker',        NULL,       false, false, false, false, v_meta, 'active', v_su, v_now),
        (v_bp_paypal,  v_tid, 'BP-PAYPAL-SG',  'PayPal Pte. Ltd.',      'SG', 'wallet_provider',  NULL,       false, false, false, false, v_meta, 'active', v_su, v_now),
        (v_bp_stripe,  v_tid, 'BP-STRIPE-US',  'Stripe Inc.',           'US', 'payment_provider', NULL,       false, false, false, false, v_meta, 'active', v_su, v_now)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name             = EXCLUDED.name,
        institution_type = EXCLUDED.institution_type,
        bic              = EXCLUDED.bic,
        metadata         = master.bank_party.metadata || EXCLUDED.metadata,
        updated_at       = now(),
        updated_by       = v_su
    WHERE (master.bank_party.name, master.bank_party.institution_type, master.bank_party.bic)
       IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.institution_type, EXCLUDED.bic);

    -- =========================================================================
    -- §2  BANK PARTY ADDRESSES + CONTACTS
    -- =========================================================================
    CREATE TEMP TABLE tmp_bp_contact (
        bp_id        uuid     NOT NULL,
        addr_code    text     NOT NULL,
        addr_line1   text     NOT NULL,
        addr_line2   text,
        addr_city    text     NOT NULL,
        addr_region  text,
        addr_postal  text     NOT NULL,
        addr_country char(2)  NOT NULL,
        email        text     NOT NULL,
        email_local  text     NOT NULL,
        email_dom    text     NOT NULL,
        phone_e164   text     NOT NULL,
        phone_cc     text     NOT NULL,
        phone_nat    text     NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_bp_contact VALUES
        (v_bp_citi,    'BPADDR-CITI-US',    '388 Greenwich Street',   NULL,
         'New York',     'New York',       '10013', 'US',
         'treasury@citi.com',           'treasury',       'citi.com',
         '+12125591000', '+1',  '2125591000'),
        (v_bp_revolut, 'BPADDR-REVOLUT-GB', '7 Westferry Circus',    'Canary Wharf',
         'London',       'England',        'E144HD', 'GB',
         'business@revolut.com',        'business',       'revolut.com',
         '+442033229018', '+44', '2033229018'),
        (v_bp_hsbc,    'BPADDR-HSBC-US',    '452 Fifth Avenue',       NULL,
         'New York',     'New York',       '10018', 'US',
         'correspondents@hsbcusa.com',  'correspondents', 'hsbcusa.com',
         '+12127255000', '+1',  '2127255000'),
        (v_bp_wise,    'BPADDR-WISE-US',    '30 W 26th Street',      'Suite 7',
         'New York',     'New York',       '10010', 'US',
         'business@wise.com',           'business',       'wise.com',
         '+15126029753', '+1',  '5126029753'),
        (v_bp_paypal,  'BPADDR-PAYPAL-SG',  '5 Temasek Boulevard',   '#09-01',
         'Singapore',    'Central Region', '038985', 'SG',
         'merchant@paypal.com',         'merchant',       'paypal.com',
         '+6563770250',  '+65', '63770250'),
        (v_bp_stripe,  'BPADDR-STRIPE-US',  '510 Townsend Street',    NULL,
         'San Francisco','California',     '94103', 'US',
         'treasury@stripe.com',         'treasury',       'stripe.com',
         '+18884289248', '+1',  '8884289248');

    FOR rec IN SELECT * FROM tmp_bp_contact LOOP
        v_addr_id := NULL;
        v_cl_id   := NULL;

        -- Address (registered office of the institution)
        INSERT INTO master.address (
            tenant_id, code, name, address_type,
            line1, line2, city, region, postal_code, country_code,
            formatted_address, status, created_by
        )
        SELECT v_tid, lower(rec.addr_code),
               bp.name, 'commercial',
               rec.addr_line1, rec.addr_line2,
               rec.addr_city, rec.addr_region, rec.addr_postal, rec.addr_country,
               CONCAT_WS(', ', rec.addr_line1, rec.addr_city, rec.addr_postal, rec.addr_country),
               'active', v_su
        FROM master.bank_party bp
        WHERE bp.id = rec.bp_id AND bp.tenant_id = v_tid
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_addr_id;

        -- If ON CONFLICT fired the RETURNING clause may be NULL; fetch by code
        IF v_addr_id IS NULL THEN
            SELECT id INTO v_addr_id FROM master.address
            WHERE tenant_id = v_tid AND code = lower(rec.addr_code);
        END IF;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by
        ) VALUES (v_tid, 'bank_party', rec.bp_id, v_addr_id, 'legal', true, v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

        -- Email contact
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (v_tid, 'bank_party', rec.bp_id, 'email', rec.email,
            'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'bank_party' AND owner_id = rec.bp_id
          AND channel_type = 'email' AND value = rec.email AND purpose = 'support';

        INSERT INTO master.contact_email (
            tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
        ) VALUES (v_tid, v_cl_id, rec.email_local, rec.email_dom, true, v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        v_cl_id := NULL;

        -- Phone contact
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (v_tid, 'bank_party', rec.bp_id, 'phone', rec.phone_e164,
            'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'bank_party' AND owner_id = rec.bp_id
          AND channel_type = 'phone' AND value = rec.phone_e164 AND purpose = 'support';

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
        ) VALUES (v_tid, v_cl_id, rec.phone_e164, ltrim(rec.phone_cc, '+'), rec.phone_nat, 'landline', v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    END LOOP;

    -- =========================================================================
    -- §3  COMPANY DATA TABLE  (17 companies)
    -- =========================================================================
    -- cc_idx 1-17 → hex 0001-0011 used in bank_account ID:
    --   ('dd004000-' || lpad(idx,4,'0') || '-' || lpad(type_idx,4,'0') || '-0000-000000000000')

    CREATE TEMP TABLE tmp_cc (
        idx     int     NOT NULL,
        cc_id   uuid,
        cc_code text    NOT NULL,
        holder  text    NOT NULL,
        lcy     char(3) NOT NULL   -- local (functional) currency
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc (idx, cc_code, holder, lcy) VALUES
        ( 1, 'ATHQ', 'Athyper Group Holdings Sdn. Bhd.',                    'MYR'),
        ( 2, 'ACFB', 'Athyper Canada Food & Beverage Manufacturing Inc.',   'CAD'),
        ( 3, 'ADPM', 'Athyper Germany Pharma Manufacturing GmbH',           'EUR'),
        ( 4, 'AITM', 'Athyper India Textile Manufacturing Pvt. Ltd.',       'INR'),
        ( 5, 'AJED', 'Athyper Japan Education K.K.',                        'JPY'),
        ( 6, 'AMRE', 'Athyper Malaysia Real Estate Sdn. Bhd.',               'MYR'),
        ( 7, 'APHS', 'Athyper Philippines Hospital Corp.',                   'PHP'),
        ( 8, 'AQTS', 'Athyper Qatar Transport W.L.L.',                      'QAR'),
        ( 9, 'AQTU', 'Athyper Qatar Utilities W.L.L.',                      'QAR'),
        (10, 'ASAC', 'Athyper Saudi Construction Co. Ltd.',                  'SAR'),
        (11, 'ASAH', 'Athyper Saudi Hospitality Co. Ltd.',                   'SAR'),
        (12, 'ASGF', 'Athyper Singapore Financial Pte. Ltd.',                'SGD'),
        (13, 'ASPE', 'Athyper South Africa Petroleum Extraction (Pty) Ltd.','ZAR'),
        (14, 'ATEM', 'Athyper Taiwan Electronics Manufacturing Co., Ltd.',   'TWD'),
        (15, 'AUET', 'Athyper UAE Trading LLC',                              'AED'),
        (16, 'AUIC', 'Athyper US Information & Communications Inc.',         'USD'),
        (17, 'AUKA', 'Athyper UK Agriculture Ltd.',                          'GBP');

    UPDATE tmp_cc t
    SET cc_id = cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid AND cc.code = t.cc_code;

    IF EXISTS (SELECT 1 FROM tmp_cc WHERE cc_id IS NULL) THEN
        RAISE EXCEPTION '[004_bank_extended] Company codes not found in DB: %',
            (SELECT string_agg(cc_code, ', ' ORDER BY idx) FROM tmp_cc WHERE cc_id IS NULL);
    END IF;

    -- =========================================================================
    -- §4  ACCOUNT TYPE DATA TABLE  (6 types; type_idx 2–7)
    -- =========================================================================
    -- type_idx 1 = domestic (already in 001_bank_accounts_per_company.sql)
    -- Account ID pattern: dd004000-{cc_idx:04d}-{type_idx:04d}-0000-000000000000
    -- last4 pattern:      '0' || lpad(cc_idx,2,'0') || type_idx  e.g. '0012' (ATHQ usd_intl)
    -- account_id_value:   acct_pfx || lpad(cc_idx,2,'0')          e.g. '4001000001'

    CREATE TEMP TABLE tmp_btype (
        type_idx   int     NOT NULL,
        acc_type   text    NOT NULL,   -- bank_account_link.purpose
        bp_id      uuid    NOT NULL,
        bk_name    text    NOT NULL,
        bk_country char(2) NOT NULL,
        bic        text,
        fixed_ccy  char(3),            -- NULL = use company local currency
        acct_pfx   text    NOT NULL,   -- 8-char prefix for account_id_value
        gl_type    text    NOT NULL,   -- 'local' | 'usd' | 'oper'
        is_disb    bool    NOT NULL,
        is_coll    bool    NOT NULL,
        usage_tp   text    NOT NULL,
        priority   int     NOT NULL,
        pmt_file   bool    NOT NULL,
        lact_type  text    NOT NULL    -- local_account_type label
    ) ON COMMIT DROP;

    INSERT INTO tmp_btype VALUES
        (2, 'disbursement', v_bp_citi,    'Citibank N.A.',         'US', 'CITIUS33', 'USD', '40010000', 'usd',   true,  false, 'disbursement', 10, true,  'current'),
        (3, 'default',      v_bp_revolut, 'Revolut Business',      'GB', 'REVOGB21', NULL,  '50020000', 'local', true,  true,  'disbursement', 20, true,  'current'),
        (4, 'disbursement', v_bp_hsbc,    'HSBC Bank USA N.A.',    'US', 'MRMDUS33', 'USD', '60030000', 'usd',   true,  false, 'disbursement', 30, true,  'current'),
        (5, 'disbursement', v_bp_wise,    'Wise US Inc.',          'US', NULL,       'USD', '70040000', 'usd',   true,  false, 'disbursement', 40, false, 'current'),
        (6, 'collection',   v_bp_paypal,  'PayPal Pte. Ltd.',      'SG', NULL,       'USD', '80050000', 'oper',  false, true,  'collection',   50, false, 'current'),
        (7, 'collection',   v_bp_stripe,  'Stripe Inc.',           'US', NULL,       'USD', '90060000', 'oper',  false, true,  'collection',   60, false, 'current');

    -- =========================================================================
    -- §5  BANK ACCOUNTS  (6 types × 17 companies = 102 new accounts)
    -- =========================================================================
    INSERT INTO master.bank_account (
        id, tenant_id, bank_party_id,
        code, name, account_holder_name,
        account_id_type, account_id_value, account_last4,
        currency_code, bic_override, bank_name_override, bank_country_override,
        account_nature, is_verified, verified_at,
        metadata, status, created_by, created_at
    )
    SELECT
        ('dd004000-' || lpad(c.idx::text, 4, '0') || '-'
                     || lpad(t.type_idx::text, 4, '0')
                     || '-0000-000000000000')::uuid,
        v_tid,
        t.bp_id,
        -- code: ba-{cc_lower}-{ccy_lower}-0{type_idx}
        'ba-' || lower(c.cc_code) || '-' || lower(coalesce(t.fixed_ccy, c.lcy)) || '-0' || t.type_idx,
        -- name: "{BankName} — ••••{last4} ({Currency})"
        t.bk_name || ' — ••••0' || lpad(c.idx::text, 2, '0') || t.type_idx || ' ('
                   || coalesce(t.fixed_ccy, c.lcy) || ')',
        c.holder,
        'local',
        -- account_id_value: 8-char prefix + 2-digit company index
        t.acct_pfx || lpad(c.idx::text, 2, '0'),
        -- last4: '0' + 2-digit company idx + 1-digit type idx  → 4 chars
        '0' || lpad(c.idx::text, 2, '0') || t.type_idx::text,
        coalesce(t.fixed_ccy, c.lcy),
        t.bic,
        t.bk_name,
        t.bk_country,
        'direct',
        true, v_now,
        v_meta, 'active', v_su, v_now
    FROM tmp_cc c CROSS JOIN tmp_btype t
    ON CONFLICT (id) DO NOTHING;

    -- =========================================================================
    -- §6  BANK ACCOUNT LINKS  (one per new account, linked to company_code)
    -- =========================================================================
    INSERT INTO master.bank_account_link (
        tenant_id, owner_type, owner_id, bank_account_id, company_code_id,
        purpose, is_primary, effective_from, metadata, created_by, created_at
    )
    SELECT
        v_tid, 'company_code', c.cc_id,
        ('dd004000-' || lpad(c.idx::text, 4, '0') || '-'
                     || lpad(t.type_idx::text, 4, '0')
                     || '-0000-000000000000')::uuid,
        c.cc_id,
        t.acc_type, false, '2024-01-01'::date, v_meta, v_su, v_now
    FROM tmp_cc c CROSS JOIN tmp_btype t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account_link bal
        WHERE bal.tenant_id      = v_tid
          AND bal.bank_account_id = ('dd004000-' || lpad(c.idx::text, 4, '0') || '-'
                                                 || lpad(t.type_idx::text, 4, '0')
                                                 || '-0000-000000000000')::uuid
          AND bal.owner_type     = 'company_code'
    );

    -- =========================================================================
    -- §7  BANK ACCOUNT HOUSE CONFIGS — new accounts
    -- =========================================================================
    INSERT INTO master.bank_account_house_config (
        tenant_id, bank_account_link_id, gl_account_id,
        account_nickname, local_account_type, usage_type,
        is_disbursement_enabled, is_collection_enabled,
        is_default_disbursement, is_default_collection,
        priority, is_manual_payment_allowed, is_payment_file_allowed,
        reconciliation_mode, metadata, status, created_by, created_at
    )
    SELECT
        v_tid, bal.id,
        CASE t.gl_type
            WHEN 'local' THEN (
                SELECT gl_account_id FROM master.mv_company_postable_account
                WHERE company_code_id = c.cc_id
                  AND account_code IN ('IFRS-A-CASH-LOCAL', 'USGAAP-A-CASH-CHECKING')
                ORDER BY CASE account_code WHEN 'IFRS-A-CASH-LOCAL' THEN 1 ELSE 2 END
                LIMIT 1
            )
            WHEN 'usd' THEN (
                SELECT gl_account_id FROM master.mv_company_postable_account
                WHERE company_code_id = c.cc_id
                  AND account_code IN ('IFRS-A-CASH-USD', 'USGAAP-A-CASH-CHECKING')
                ORDER BY CASE account_code WHEN 'IFRS-A-CASH-USD' THEN 1 ELSE 2 END
                LIMIT 1
            )
            WHEN 'oper' THEN (
                SELECT gl_account_id FROM master.mv_company_postable_account
                WHERE company_code_id = c.cc_id
                  AND account_code IN ('IFRS-A-CASH-OPER', 'USGAAP-A-CASH-OPER')
                ORDER BY CASE account_code WHEN 'IFRS-A-CASH-OPER' THEN 1 ELSE 2 END
                LIMIT 1
            )
        END,
        ba.name,
        t.lact_type,
        t.usage_tp,
        t.is_disb, t.is_coll,
        false, false,
        t.priority::smallint,
        true, t.pmt_file,
        'manual',
        v_meta, 'active', v_su, v_now
    FROM tmp_cc c
    CROSS JOIN tmp_btype t
    JOIN master.bank_account ba
      ON ba.id        = ('dd004000-' || lpad(c.idx::text, 4, '0') || '-'
                                     || lpad(t.type_idx::text, 4, '0')
                                     || '-0000-000000000000')::uuid
     AND ba.tenant_id = v_tid
    JOIN master.bank_account_link bal
      ON bal.bank_account_id = ba.id
     AND bal.tenant_id       = v_tid
     AND bal.purpose         = t.acc_type
     AND bal.owner_type      = 'company_code'
     AND bal.owner_id        = c.cc_id
    WHERE NOT EXISTS (
        SELECT 1 FROM master.bank_account_house_config bahc
        WHERE bahc.tenant_id         = v_tid
          AND bahc.bank_account_link_id = bal.id
    );

    -- =========================================================================
    -- §8  BANK ACCOUNT HOUSE CONFIGS — backfill domestic accounts (dd002000-*)
    -- =========================================================================
    -- The domestic primary accounts from 001_bank_accounts_per_company.sql
    -- did not receive house configs. Link them now as default BOTH accounts.

    INSERT INTO master.bank_account_house_config (
        tenant_id, bank_account_link_id, gl_account_id,
        account_nickname, local_account_type, usage_type,
        is_disbursement_enabled, is_collection_enabled,
        is_default_disbursement, is_default_collection,
        priority, is_manual_payment_allowed, is_payment_file_allowed,
        reconciliation_mode, metadata, status, created_by, created_at
    )
    SELECT
        v_tid, bal.id,
        -- USD domestic (AUIC uses COA-GAAP) → per-company USD account; others → local
        CASE WHEN ba.currency_code = 'USD' THEN (
            SELECT gl_account_id FROM master.mv_company_postable_account
            WHERE company_code_id = bal.owner_id
              AND account_code IN ('IFRS-A-CASH-USD', 'USGAAP-A-CASH-CHECKING')
            ORDER BY CASE account_code WHEN 'IFRS-A-CASH-USD' THEN 1 ELSE 2 END
            LIMIT 1
        ) ELSE (
            SELECT gl_account_id FROM master.mv_company_postable_account
            WHERE company_code_id = bal.owner_id
              AND account_code IN ('IFRS-A-CASH-LOCAL', 'USGAAP-A-CASH-CHECKING')
            ORDER BY CASE account_code WHEN 'IFRS-A-CASH-LOCAL' THEN 1 ELSE 2 END
            LIMIT 1
        ) END,
        ba.name,
        'current',
        'disbursement', true, false, true, false,
        1::smallint, true, true,
        'manual',
        v_meta, 'active', v_su, v_now
    FROM master.bank_account_link bal
    JOIN master.bank_account ba
      ON ba.id        = bal.bank_account_id
     AND ba.tenant_id = v_tid
    WHERE bal.tenant_id  = v_tid
      AND bal.owner_type = 'company_code'
      AND ba.id = ANY(ARRAY[
          'dd002000-0000-0000-0000-000000000001'::uuid,
          'dd002000-0000-0000-0000-000000000002'::uuid,
          'dd002000-0000-0000-0000-000000000003'::uuid,
          'dd002000-0000-0000-0000-000000000004'::uuid,
          'dd002000-0000-0000-0000-000000000005'::uuid,
          'dd002000-0000-0000-0000-000000000006'::uuid,
          'dd002000-0000-0000-0000-000000000007'::uuid,
          'dd002000-0000-0000-0000-000000000008'::uuid,
          'dd002000-0000-0000-0000-000000000009'::uuid,
          'dd002000-0000-0000-0000-000000000010'::uuid,
          'dd002000-0000-0000-0000-000000000011'::uuid,
          'dd002000-0000-0000-0000-000000000012'::uuid,
          'dd002000-0000-0000-0000-000000000013'::uuid,
          'dd002000-0000-0000-0000-000000000014'::uuid,
          'dd002000-0000-0000-0000-000000000015'::uuid,
          'dd002000-0000-0000-0000-000000000016'::uuid,
          'dd002000-0000-0000-0000-000000000017'::uuid
      ])
      AND NOT EXISTS (
          SELECT 1 FROM master.bank_account_house_config bahc
          WHERE bahc.tenant_id          = v_tid
            AND bahc.bank_account_link_id = bal.id
      );

    RAISE NOTICE '[004_bank_extended] Seeded 6 bank parties + 102 accounts (6 types × 17 companies) + 119 house configs for tenant %', v_tid;
END $bank_ext$;
