-- ============================================================================
-- CIRRUSATLANTIC — ORGANIZATION ADDRESS AND CONTACT FOUNDATION
-- ============================================================================
-- seed-pack-version: 3.0.0
-- Dataset:  cirrusatlantic.organization-address-contact
-- Plane:    neon
-- Depends:  cirrusatlantic.organization-root 2.1.0; control.owner_type
-- Natural keys: deterministic owner/address and owner/channel identities
-- Idempotent: convergent updates; no destructive refresh
-- ============================================================================

DO $catl_address_contact$
DECLARE
    v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_le_id uuid;
    v_cc_id uuid;
    v_address_id constant uuid :=
        md5('neon:address:athyper:cirrusatlantic:registered-office')::uuid;
    v_owner record;
    v_contact record;
    v_contact_id uuid;
    v_metadata constant jsonb :=
        '{"_seed":{"pack":"cirrusatlantic.organization-address-contact","version":"3.0.0"}}'::jsonb;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant
         WHERE id = v_tid AND code = 'cirrusatlantic' AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[003_address_contacts] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal
         WHERE tenant_id = v_tid AND id = v_actor AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[003_address_contacts] active tenant-local actor required';
    END IF;

    SELECT id INTO v_le_id
      FROM master.legal_entity
     WHERE tenant_id = v_tid AND code = 'catl' AND status = 'active';
    SELECT id INTO v_cc_id
      FROM master.company_code
     WHERE tenant_id = v_tid AND code = 'catl' AND status = 'active';

    IF v_le_id IS NULL OR v_cc_id IS NULL THEN
        RAISE EXCEPTION '[003_address_contacts] catl legal entity/company code required';
    END IF;

    IF (
        SELECT count(*) FROM control.owner_type
         WHERE tenant_id IS NULL
           AND code IN ('tenant', 'legal_entity', 'company_code')
           AND supports_address AND supports_contact AND status = 'active'
    ) <> 3 THEN
        RAISE EXCEPTION '[003_address_contacts] required owner-type registry entries missing';
    END IF;

    INSERT INTO master.address (
        id, tenant_id, address_type, line1, line2, line3, city, region,
        postal_code, country_code, metadata, status, created_by
    ) VALUES (
        v_address_id, v_tid, 'commercial',
        'Floor 2, Innovative Data Building', '18 Innovation Avenue', 'Canary Wharf',
        'London', 'England', 'EC3M 3BY', 'GB', v_metadata, 'active', v_actor
    )
    ON CONFLICT (id) DO UPDATE SET
        address_type = EXCLUDED.address_type,
        line1 = EXCLUDED.line1,
        line2 = EXCLUDED.line2,
        line3 = EXCLUDED.line3,
        city = EXCLUDED.city,
        region = EXCLUDED.region,
        postal_code = EXCLUDED.postal_code,
        country_code = EXCLUDED.country_code,
        metadata = master.address.metadata || EXCLUDED.metadata,
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = v_actor
    WHERE (
        master.address.address_type, master.address.line1, master.address.line2,
        master.address.line3, master.address.city, master.address.region,
        master.address.postal_code, master.address.country_code,
        master.address.metadata, master.address.status
    ) IS DISTINCT FROM (
        EXCLUDED.address_type, EXCLUDED.line1, EXCLUDED.line2,
        EXCLUDED.line3, EXCLUDED.city, EXCLUDED.region,
        EXCLUDED.postal_code, EXCLUDED.country_code,
        master.address.metadata || EXCLUDED.metadata, EXCLUDED.status
    );

    FOR v_owner IN
        SELECT owner_type.id AS owner_type_id, owner_row.owner_id, owner_row.owner_code
          FROM (VALUES
              ('tenant'::text, v_tid, 'tenant'::text),
              ('legal_entity'::text, v_le_id, 'legal_entity'::text),
              ('company_code'::text, v_cc_id, 'company_code'::text)
          ) AS owner_row(owner_type_code, owner_id, owner_code)
          JOIN control.owner_type owner_type
            ON owner_type.tenant_id IS NULL
           AND owner_type.code = owner_row.owner_type_code
           AND owner_type.status = 'active'
    LOOP
        INSERT INTO master.address_link (
            id, tenant_id, owner_type_id, owner_id, address_id, purpose,
            attention_line, is_primary, effective_from, metadata, created_by
        ) VALUES (
            md5('neon:address-link:' || v_tid || ':' || v_owner.owner_code || ':registered-office')::uuid,
            v_tid, v_owner.owner_type_id, v_owner.owner_id, v_address_id,
            'default', 'CirrusAtlantic Limited', true, DATE '2025-01-01',
            v_metadata, v_actor
        )
        ON CONFLICT (id) DO UPDATE SET
            address_id = EXCLUDED.address_id,
            attention_line = EXCLUDED.attention_line,
            is_primary = EXCLUDED.is_primary,
            effective_from = EXCLUDED.effective_from,
            effective_until = NULL,
            metadata = master.address_link.metadata || EXCLUDED.metadata,
            updated_at = now(),
            updated_by = v_actor
        WHERE (
            master.address_link.address_id, master.address_link.attention_line,
            master.address_link.is_primary, master.address_link.effective_from,
            master.address_link.effective_until, master.address_link.metadata
        ) IS DISTINCT FROM (
            EXCLUDED.address_id, EXCLUDED.attention_line,
            EXCLUDED.is_primary, EXCLUDED.effective_from,
            NULL::date, master.address_link.metadata || EXCLUDED.metadata
        );

        FOR v_contact IN
            SELECT * FROM (VALUES
                ('email'::text,
                 CASE v_owner.owner_code
                   WHEN 'tenant' THEN 'info@cirrusatlantic.co.uk'
                   WHEN 'legal_entity' THEN 'legal@cirrusatlantic.co.uk'
                   ELSE 'finance@cirrusatlantic.co.uk' END,
                 'correspondence'::text),
                ('phone'::text,
                 CASE v_owner.owner_code
                   WHEN 'tenant' THEN '+442071112222'
                   WHEN 'legal_entity' THEN '+442071112223'
                   ELSE '+442071112224' END,
                 'default'::text)
            ) AS desired(channel_type, value, purpose)
        LOOP
            v_contact_id := md5(
                'neon:contact-link:' || v_tid || ':' || v_owner.owner_code || ':' ||
                v_contact.channel_type || ':' || v_contact.purpose
            )::uuid;

            INSERT INTO master.contact_link (
                id, tenant_id, owner_type_id, owner_id, channel_type, value,
                purpose, is_primary, is_verified, verified_at,
                metadata, status, created_by
            ) VALUES (
                v_contact_id, v_tid, v_owner.owner_type_id, v_owner.owner_id,
                v_contact.channel_type, v_contact.value, v_contact.purpose,
                true, true, TIMESTAMPTZ '2025-01-01 00:00:00+00',
                v_metadata, 'active', v_actor
            )
            ON CONFLICT (id) DO UPDATE SET
                value = EXCLUDED.value,
                is_primary = EXCLUDED.is_primary,
                is_verified = EXCLUDED.is_verified,
                verified_at = EXCLUDED.verified_at,
                metadata = master.contact_link.metadata || EXCLUDED.metadata,
                status = EXCLUDED.status,
                updated_at = now(),
                updated_by = v_actor
            WHERE (
                master.contact_link.value, master.contact_link.is_primary,
                master.contact_link.is_verified, master.contact_link.verified_at,
                master.contact_link.metadata, master.contact_link.status
            ) IS DISTINCT FROM (
                EXCLUDED.value, EXCLUDED.is_primary,
                EXCLUDED.is_verified, EXCLUDED.verified_at,
                master.contact_link.metadata || EXCLUDED.metadata, EXCLUDED.status
            );

            IF v_contact.channel_type = 'email' THEN
                INSERT INTO master.contact_email (
                    contact_link_id, tenant_id, mx_checked_at, mx_valid,
                    metadata, created_by
                ) VALUES (
                    v_contact_id, v_tid, TIMESTAMPTZ '2025-01-01 00:00:00+00', true,
                    v_metadata, v_actor
                )
                ON CONFLICT (contact_link_id) DO UPDATE SET
                    mx_checked_at = EXCLUDED.mx_checked_at,
                    mx_valid = EXCLUDED.mx_valid,
                    metadata = master.contact_email.metadata || EXCLUDED.metadata,
                    updated_at = now(), updated_by = v_actor
                WHERE (master.contact_email.mx_checked_at, master.contact_email.mx_valid,
                       master.contact_email.metadata)
                   IS DISTINCT FROM
                      (EXCLUDED.mx_checked_at, EXCLUDED.mx_valid,
                       master.contact_email.metadata || EXCLUDED.metadata);
            ELSE
                INSERT INTO master.contact_phone (
                    contact_link_id, tenant_id, line_type, metadata, created_by
                ) VALUES (
                    v_contact_id, v_tid, 'landline', v_metadata, v_actor
                )
                ON CONFLICT (contact_link_id) DO UPDATE SET
                    line_type = EXCLUDED.line_type,
                    metadata = master.contact_phone.metadata || EXCLUDED.metadata,
                    updated_at = now(), updated_by = v_actor
                WHERE (master.contact_phone.line_type, master.contact_phone.metadata)
                   IS DISTINCT FROM
                      (EXCLUDED.line_type,
                       master.contact_phone.metadata || EXCLUDED.metadata);
            END IF;
        END LOOP;
    END LOOP;

    IF (SELECT count(*) FROM master.address_link
         WHERE tenant_id = v_tid AND address_id = v_address_id
           AND metadata->'_seed'->>'pack' = 'cirrusatlantic.organization-address-contact') <> 3
       OR (SELECT count(*) FROM master.contact_link
            WHERE tenant_id = v_tid
              AND metadata->'_seed'->>'pack' = 'cirrusatlantic.organization-address-contact') <> 6 THEN
        RAISE EXCEPTION '[003_address_contacts] expected-count assertion failed';
    END IF;

    RAISE NOTICE '[003_address_contacts] organization address and six contact channels ready';
END
$catl_address_contact$;
