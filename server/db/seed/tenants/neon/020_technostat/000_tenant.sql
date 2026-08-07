-- =====================================================================
-- TECHNOSTAT GROUP — LIGHTWEIGHT TENANT SEED (INTERIM BOOTSTRAP)
-- =====================================================================
-- Temporary bootstrap to unblock phase-3:
-- creates minimum tenant + principal + legal_entity + one company_code so
-- tenant resolution and seed context can proceed.
-- Replace with full Wave-5 rewrite after stabilization.
-- =====================================================================

DO $tenant_seed$
DECLARE
    v_su uuid := coalesce(
        nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    );
    v_tid uuid;
    v_le_id uuid;
    v_cc_id uuid;
    v_seed_principal uuid := '4ea5e0b2-c6f1-4de2-9f03-5f4a89f66f8f'::uuid;
    v_payload jsonb := jsonb_build_object(
        'seed',
        jsonb_build_object(
            'origin', 'interim-bootstrap',
            'pack', '000_tenant',
            'seeded_at', now()::text
        ),
        'domain', '020_technostat'
    );
    v_country_code text := 'SA';
BEGIN
    -- Recovery-safe fallback when phase-1 was only partially rehydrated.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'master'
        AND t.typname = 'principal_type_d'
    ) THEN
      CREATE DOMAIN master.principal_type_d AS text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'master'
        AND t.typname = 'legal_entity_type_d'
    ) THEN
      CREATE DOMAIN master.legal_entity_type_d AS text;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM master.tenant
      WHERE realm_key = 'athyper' AND code = 'technostat'
    ) THEN
      INSERT INTO master.tenant (
          code,
          name,
          display_name,
          realm_key,
          canonical_party_id,
          metadata,
          status,
          created_by
      )
      VALUES (
          'technostat',
          'Technostat Group',
          'Technostat Group Holdings',
          'athyper',
          md5('athyper:canonical-party:technostat')::uuid,
          v_payload,
          'active',
          v_su
      );
    ELSE
      UPDATE master.tenant
         SET name = 'Technostat Group',
             display_name = 'Technostat Group Holdings',
             canonical_party_id = md5('athyper:canonical-party:technostat')::uuid,
             metadata = COALESCE(metadata, '{}'::jsonb) || v_payload,
             status = 'active',
             updated_at = now(),
             updated_by = v_su
       WHERE realm_key = 'athyper' AND code = 'technostat';
    END IF;

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF NOT EXISTS (
      SELECT 1 FROM master.principal WHERE tenant_id = v_tid AND id = v_seed_principal
    ) THEN
      INSERT INTO master.principal (
          id,
          tenant_id,
          code,
          name,
          principal_type,
          created_by
      )
      VALUES (
          v_seed_principal,
          v_tid,
          'seed_service',
          'Seed Service Account',
          'service_account'::master.principal_type_d,
          v_su
      );
    ELSE
      UPDATE master.principal
         SET name = 'Seed Service Account',
             principal_type = 'service_account'::master.principal_type_d,
             status = 'active',
             updated_at = now(),
             updated_by = v_su
       WHERE tenant_id = v_tid AND id = v_seed_principal;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM master.legal_entity
      WHERE tenant_id = v_tid AND code = 'tksa'
    ) THEN
      INSERT INTO master.legal_entity (
        tenant_id,
        code,
        name,
        display_name,
        legal_name,
        entity_type,
        functional_currency,
        reporting_currency,
        registration_country_code,
        metadata,
        status,
        created_by
      )
      VALUES (
          v_tid,
          'tksa',
          'Technostat Group',
          'Technostat Group Holdings',
          'Technostat Group Holdings',
          'company'::master.legal_entity_type_d,
          'SAR',
          'SAR',
          'SA',
          v_payload,
          'active',
          v_su
      );
    ELSE
      UPDATE master.legal_entity
         SET name = 'Technostat Group',
             display_name = 'Technostat Group Holdings',
             legal_name = 'Technostat Group Holdings',
             status = 'active',
             metadata = COALESCE(metadata, '{}'::jsonb) || v_payload,
             updated_at = now(),
             updated_by = v_su
       WHERE tenant_id = v_tid AND code = 'tksa';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'master'
        AND table_name = 'legal_entity'
        AND column_name = 'country_code'
    ) THEN
      UPDATE master.legal_entity
         SET country_code = v_country_code
       WHERE tenant_id = v_tid AND code = 'tksa';
    END IF;

    SELECT id INTO v_le_id
    FROM master.legal_entity
    WHERE tenant_id = v_tid AND code = 'tksa';

    IF NOT EXISTS (
      SELECT 1
      FROM master.company_code
      WHERE tenant_id = v_tid AND code = 'tksa'
    ) THEN
      INSERT INTO master.company_code (
          tenant_id,
          legal_entity_id,
          code,
          name,
          display_name,
          functional_currency,
          status,
          created_by
      )
      VALUES (
          v_tid,
          v_le_id,
          'tksa',
          'Technostat Group',
          'Technostat Group',
          'SAR',
          'active',
          v_su
      );
    ELSE
      UPDATE master.company_code
         SET legal_entity_id = v_le_id,
             name = 'Technostat Group',
             display_name = 'Technostat Group',
             functional_currency = 'SAR',
             status = 'active',
             updated_at = now(),
             updated_by = v_su
       WHERE tenant_id = v_tid AND code = 'tksa';
    END IF;

    SELECT id INTO v_cc_id
    FROM master.company_code
    WHERE tenant_id = v_tid AND code = 'tksa';

    RAISE NOTICE '[000_tenant] technostat bootstrap applied (tenant %, legal_entity %, company %)',
        v_tid, v_le_id, v_cc_id;
END
$tenant_seed$;
