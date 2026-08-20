-- 030_tenant/entity_engine/020_field_security_policies.sql
-- Seeds PII/masking policies for known sensitive canonical and entity fields.
-- Covers: tax_id, national_id, iban, account_no, email, phone, date_of_birth, salary.
-- Idempotent: checked via existence test (no single unique key across all columns).
-- Run AFTER: 030_tenant/000_tenant/000_athyper_tenant.sql + system entity registration.

DO $$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    cnt         int  := 0;

    -- Entity IDs (resolved by name)
    v_eid_principal          uuid;
    v_eid_employee           uuid;
    v_eid_customer           uuid;
    v_eid_supplier           uuid;
    v_eid_contact_email      uuid;
    v_eid_contact_phone      uuid;
    v_eid_bank_account       uuid;
    v_eid_bank_party         uuid;
BEGIN
    v_tenant_id := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Resolve entity IDs
    SELECT id INTO v_eid_principal     FROM control.entity WHERE name = 'principal'     AND table_schema = 'master';
    SELECT id INTO v_eid_employee      FROM control.entity WHERE name = 'employee'      AND table_schema = 'master';
    SELECT id INTO v_eid_customer      FROM control.entity WHERE name = 'customer'      AND table_schema = 'master';
    SELECT id INTO v_eid_supplier      FROM control.entity WHERE name = 'supplier'      AND table_schema = 'master';
    SELECT id INTO v_eid_contact_email FROM control.entity WHERE name = 'contact_email' AND table_schema = 'master';
    SELECT id INTO v_eid_contact_phone FROM control.entity WHERE name = 'contact_phone' AND table_schema = 'master';
    SELECT id INTO v_eid_bank_account  FROM control.entity WHERE name = 'bank_account'  AND table_schema = 'master';
    SELECT id INTO v_eid_bank_party    FROM control.entity WHERE name = 'bank_party'    AND table_schema = 'master';

    -- ── Helper: only insert if not already seeded ─────────────────────────────
    -- (no single unique key; guard by counting matching rows)

    -- ── principal: email / phone ──────────────────────────────────────────────
    IF v_eid_principal IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_principal AND field_path = 'email' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_principal, 'email',         'mask', 'partial',  'direct',           100, v_su),
            (v_tenant_id, v_eid_principal, 'phone',         'mask', 'partial',  'direct',           100, v_su),
            (v_tenant_id, v_eid_principal, 'date_of_birth', 'mask', 'null',     'quasi',            100, v_su),
            (v_tenant_id, v_eid_principal, 'national_id',   'mask', 'hash',     'sensitive',        100, v_su);
        cnt := cnt + 4;
    END IF;

    -- ── employee: salary / national_id / date_of_birth ───────────────────────
    IF v_eid_employee IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_employee AND field_path = 'national_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_employee, 'national_id',   'mask', 'hash',     'sensitive',        100, v_su),
            (v_tenant_id, v_eid_employee, 'date_of_birth', 'mask', 'null',     'quasi',            100, v_su),
            (v_tenant_id, v_eid_employee, 'salary',        'mask', 'null',     'special_category', 100, v_su),
            (v_tenant_id, v_eid_employee, 'tax_id',        'mask', 'hash',     'sensitive',        100, v_su);
        cnt := cnt + 4;
    END IF;

    -- ── customer / supplier: tax_id ───────────────────────────────────────────
    IF v_eid_customer IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_customer AND field_path = 'tax_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_customer, 'tax_id', 'mask', 'hash', 'sensitive', 100, v_su);
        cnt := cnt + 1;
    END IF;

    IF v_eid_supplier IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_supplier AND field_path = 'tax_id' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_supplier, 'tax_id', 'mask', 'hash', 'sensitive', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── contact_email: email_address ──────────────────────────────────────────
    IF v_eid_contact_email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_contact_email AND field_path = 'email_address' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_contact_email, 'email_address', 'mask', 'partial', 'direct', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── contact_phone: phone_number ───────────────────────────────────────────
    IF v_eid_contact_phone IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_contact_phone AND field_path = 'phone_number' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_contact_phone, 'phone_number', 'mask', 'partial', 'direct', 100, v_su);
        cnt := cnt + 1;
    END IF;

    -- ── bank_account: iban / account_number ───────────────────────────────────
    IF v_eid_bank_account IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM control.field_security_policy
                       WHERE entity_id = v_eid_bank_account AND field_path = 'iban' AND tenant_id = v_tenant_id) THEN
        INSERT INTO control.field_security_policy
            (tenant_id, entity_id, field_path, policy_type, mask_strategy, pii_classification, priority, created_by)
        VALUES
            (v_tenant_id, v_eid_bank_account, 'iban',           'mask', 'partial', 'sensitive', 100, v_su),
            (v_tenant_id, v_eid_bank_account, 'account_number', 'mask', 'partial', 'sensitive', 100, v_su);
        cnt := cnt + 2;
    END IF;

    RAISE NOTICE 'control.field_security_policy: % rows inserted for tenant %', cnt, v_tenant_id;
END $$;
