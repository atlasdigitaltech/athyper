-- ============================================================================
-- FILE:    tenants/neon/020_technostat/012_technostat_supplier_search_repair.sql
-- Purpose: Repair the supplier chooser seed surface for tenant schemas that have
--          evolved from legacy tenant_partner columns.
-- ============================================================================

DO $technostat_supplier_search_repair$
DECLARE
    v_tid uuid;
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_has_tax_residence_bp boolean;
    v_has_supplier_app_index boolean;
BEGIN
    SELECT id INTO v_tid
      FROM master.tenant
     WHERE realm_key = 'athyper' AND code = 'technostat'
     LIMIT 1;

    IF v_tid IS NULL THEN
        RAISE NOTICE '[technostat_supplier_search_repair] technostat tenant not found; skipping';
        RETURN;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='master' AND table_name='business_partner'
        AND column_name='tax_residence_country_code'
    ) INTO v_has_tax_residence_bp;

    SELECT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname='master' AND tablename='supplier_app_index'
    ) INTO v_has_supplier_app_index;

    IF v_has_tax_residence_bp THEN
        WITH supplier_seed (
            bp_code, supplier_code, name, display_name, legal_name,
            supplier_type, country_code, legal_form, aliases
        ) AS (
            VALUES
                ('SUP-KSA-01','SUP-TKSA-AMTS-001','Al Madar Technology Solutions LLC','Al Madar Tech','Al Madar Technology Solutions Limited Liability Company','service','SA','limited_liability',ARRAY['Al Madar','AMTS','AlMadar Tech']),
                ('SUP-KSA-02','SUP-SSK-ANIC-001','Arabian Network Infrastructure Co','Arabian Network','Arabian Network Infrastructure Company','contractor','SA','limited_liability',ARRAY['ANIC','Arabian Network']),
                ('SUP-EGY-01','SUP-TEGY-NTP-001','Nile Technology Partners','Nile Tech Partners','Nile Technology Partners S.A.E.','service','EG','joint_stock',ARRAY['NTP','Nile Tech']),
                ('SUP-EGY-02','SUP-SDTX-CSI-001','Cairo Systems Integration LLC','Cairo Systems','Cairo Systems Integration Limited Liability Company','contractor','EG','limited_liability',ARRAY['CSI','Cairo Systems']),
                ('SUP-GLB-01','SUP-GLB-GPS-001','Global Procurement Solutions Ltd','Global Procurement','Global Procurement Solutions Limited','service','GB','limited_company',ARRAY['GPS','Global Procurement']),
                ('BOTH-GLB-01','SUP-GLB-MGI-001','Meridian Group International BV','Meridian Group','Meridian Group International B.V.','service','NL','private_limited',ARRAY['MGI','Meridian'])
        )
        UPDATE master.business_partner bp
        SET
            name = s.name,
            display_name = s.display_name,
            legal_name = s.legal_name,
            partner_category = 'organization',
            legal_form = s.legal_form,
            registration_country_code = s.country_code,
            tax_residence_country_code = s.country_code,
            aliases = s.aliases,
            metadata = coalesce(bp.metadata, '{}'::jsonb)
                       || jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
            updated_by = v_sys,
            updated_at = now()
        FROM supplier_seed s
        WHERE bp.tenant_id = v_tid
          AND bp.code = s.bp_code;

        WITH supplier_seed (
            bp_code, supplier_code, name, display_name, legal_name,
            supplier_type, country_code, legal_form, aliases
        ) AS (
            VALUES
                ('SUP-KSA-01','SUP-TKSA-AMTS-001','Al Madar Technology Solutions LLC','Al Madar Tech','Al Madar Technology Solutions Limited Liability Company','service','SA','limited_liability',ARRAY['Al Madar','AMTS','AlMadar Tech']),
                ('SUP-KSA-02','SUP-SSK-ANIC-001','Arabian Network Infrastructure Co','Arabian Network','Arabian Network Infrastructure Company','contractor','SA','limited_liability',ARRAY['ANIC','Arabian Network']),
                ('SUP-EGY-01','SUP-TEGY-NTP-001','Nile Technology Partners','Nile Tech Partners','Nile Technology Partners S.A.E.','service','EG','joint_stock',ARRAY['NTP','Nile Tech']),
                ('SUP-EGY-02','SUP-SDTX-CSI-001','Cairo Systems Integration LLC','Cairo Systems','Cairo Systems Integration Limited Liability Company','contractor','EG','limited_liability',ARRAY['CSI','Cairo Systems']),
                ('SUP-GLB-01','SUP-GLB-GPS-001','Global Procurement Solutions Ltd','Global Procurement','Global Procurement Solutions Limited','service','GB','limited_company',ARRAY['GPS','Global Procurement']),
                ('BOTH-GLB-01','SUP-GLB-MGI-001','Meridian Group International BV','Meridian Group','Meridian Group International B.V.','service','NL','private_limited',ARRAY['MGI','Meridian'])
        )
        INSERT INTO master.business_partner (
            tenant_id, code, name, display_name, legal_name, partner_category,
            legal_form, registration_country_code, tax_residence_country_code,
            aliases, metadata, created_by, updated_by, updated_at
        )
        SELECT
            v_tid, s.bp_code, s.name, s.display_name, s.legal_name, 'organization',
            s.legal_form, s.country_code, s.country_code,
            s.aliases,
            jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
            v_sys, v_sys, now()
        FROM supplier_seed s
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner existing
            WHERE existing.tenant_id = v_tid
              AND existing.code = s.bp_code
        );
    ELSE
        WITH supplier_seed (
            bp_code, supplier_code, name, display_name, legal_name,
            supplier_type, country_code, legal_form, aliases
        ) AS (
            VALUES
                ('SUP-KSA-01','SUP-TKSA-AMTS-001','Al Madar Technology Solutions LLC','Al Madar Tech','Al Madar Technology Solutions Limited Liability Company','service','SA','limited_liability',ARRAY['Al Madar','AMTS','AlMadar Tech']),
                ('SUP-KSA-02','SUP-SSK-ANIC-001','Arabian Network Infrastructure Co','Arabian Network','Arabian Network Infrastructure Company','contractor','SA','limited_liability',ARRAY['ANIC','Arabian Network']),
                ('SUP-EGY-01','SUP-TEGY-NTP-001','Nile Technology Partners','Nile Tech Partners','Nile Technology Partners S.A.E.','service','EG','joint_stock',ARRAY['NTP','Nile Tech']),
                ('SUP-EGY-02','SUP-SDTX-CSI-001','Cairo Systems Integration LLC','Cairo Systems','Cairo Systems Integration Limited Liability Company','contractor','EG','limited_liability',ARRAY['CSI','Cairo Systems']),
                ('SUP-GLB-01','SUP-GLB-GPS-001','Global Procurement Solutions Ltd','Global Procurement','Global Procurement Solutions Limited','service','GB','limited_company',ARRAY['GPS','Global Procurement']),
                ('BOTH-GLB-01','SUP-GLB-MGI-001','Meridian Group International BV','Meridian Group','Meridian Group International B.V.','service','NL','private_limited',ARRAY['MGI','Meridian'])
        )
        UPDATE master.business_partner bp
        SET
            name = s.name,
            display_name = s.display_name,
            legal_name = s.legal_name,
            partner_category = 'organization',
            legal_form = s.legal_form,
            registration_country_code = s.country_code,
            aliases = s.aliases,
            metadata = coalesce(bp.metadata, '{}'::jsonb)
                       || jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
            updated_by = v_sys,
            updated_at = now()
        FROM supplier_seed s
        WHERE bp.tenant_id = v_tid
          AND bp.code = s.bp_code;

        WITH supplier_seed (
            bp_code, supplier_code, name, display_name, legal_name,
            supplier_type, country_code, legal_form, aliases
        ) AS (
            VALUES
                ('SUP-KSA-01','SUP-TKSA-AMTS-001','Al Madar Technology Solutions LLC','Al Madar Tech','Al Madar Technology Solutions Limited Liability Company','service','SA','limited_liability',ARRAY['Al Madar','AMTS','AlMadar Tech']),
                ('SUP-KSA-02','SUP-SSK-ANIC-001','Arabian Network Infrastructure Co','Arabian Network','Arabian Network Infrastructure Company','contractor','SA','limited_liability',ARRAY['ANIC','Arabian Network']),
                ('SUP-EGY-01','SUP-TEGY-NTP-001','Nile Technology Partners','Nile Tech Partners','Nile Technology Partners S.A.E.','service','EG','joint_stock',ARRAY['NTP','Nile Tech']),
                ('SUP-EGY-02','SUP-SDTX-CSI-001','Cairo Systems Integration LLC','Cairo Systems','Cairo Systems Integration Limited Liability Company','contractor','EG','limited_liability',ARRAY['CSI','Cairo Systems']),
                ('SUP-GLB-01','SUP-GLB-GPS-001','Global Procurement Solutions Ltd','Global Procurement','Global Procurement Solutions Limited','service','GB','limited_company',ARRAY['GPS','Global Procurement']),
                ('BOTH-GLB-01','SUP-GLB-MGI-001','Meridian Group International BV','Meridian Group','Meridian Group International B.V.','service','NL','private_limited',ARRAY['MGI','Meridian'])
        )
        INSERT INTO master.business_partner (
            tenant_id, code, name, display_name, legal_name, partner_category,
            legal_form, registration_country_code, aliases, metadata, created_by, updated_by, updated_at
        )
        SELECT
            v_tid, s.bp_code, s.name, s.display_name, s.legal_name, 'organization',
            s.legal_form, s.country_code,
            s.aliases,
            jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
            v_sys, v_sys, now()
        FROM supplier_seed s
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner existing
            WHERE existing.tenant_id = v_tid
              AND existing.code = s.bp_code
        );
    END IF;

    WITH supplier_seed (bp_code, supplier_code, supplier_type) AS (
        VALUES
            ('SUP-KSA-01','SUP-TKSA-AMTS-001','service'),
            ('SUP-KSA-02','SUP-SSK-ANIC-001','contractor'),
            ('SUP-EGY-01','SUP-TEGY-NTP-001','service'),
            ('SUP-EGY-02','SUP-SDTX-CSI-001','contractor'),
            ('SUP-GLB-01','SUP-GLB-GPS-001','service'),
            ('BOTH-GLB-01','SUP-GLB-MGI-001','service')
    ),
    supplier_partner_rows AS (
        SELECT
            v_tid AS tenant_id,
            bp.id AS business_partner_id,
            s.supplier_code,
            s.supplier_type
        FROM supplier_seed s
        JOIN master.business_partner bp
          ON bp.tenant_id=v_tid AND bp.code=s.bp_code
    )
    UPDATE master.supplier ms
    SET
        business_partner_id = spr.business_partner_id,
        supplier_type = spr.supplier_type,
        metadata = coalesce(ms.metadata, '{}'::jsonb)
                   || jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
        updated_by = v_sys,
        updated_at = now()
    FROM supplier_partner_rows spr
    WHERE ms.tenant_id = v_tid
      AND ms.supplier_code = spr.supplier_code;

    WITH supplier_seed (bp_code, supplier_code, supplier_type) AS (
        VALUES
            ('SUP-KSA-01','SUP-TKSA-AMTS-001','service'),
            ('SUP-KSA-02','SUP-SSK-ANIC-001','contractor'),
            ('SUP-EGY-01','SUP-TEGY-NTP-001','service'),
            ('SUP-EGY-02','SUP-SDTX-CSI-001','contractor'),
            ('SUP-GLB-01','SUP-GLB-GPS-001','service'),
            ('BOTH-GLB-01','SUP-GLB-MGI-001','service')
    ),
    supplier_partner_rows AS (
        SELECT
            v_tid AS tenant_id,
            bp.id AS business_partner_id,
            s.supplier_code,
            s.supplier_type
        FROM supplier_seed s
        JOIN master.business_partner bp
          ON bp.tenant_id=v_tid AND bp.code=s.bp_code
    )
    INSERT INTO master.supplier (
        tenant_id, business_partner_id, supplier_code, supplier_type,
        metadata, status, created_by, updated_by, created_at, updated_at
    )
    SELECT
        spr.tenant_id,
        spr.business_partner_id,
        spr.supplier_code,
        spr.supplier_type,
        jsonb_build_object('_seed', jsonb_build_object('file', '012_technostat_supplier_search_repair')),
        'active',
        v_sys,
        v_sys,
        now(),
        now()
    FROM supplier_partner_rows spr
    WHERE NOT EXISTS (
        SELECT 1
        FROM master.supplier existing
        WHERE existing.tenant_id = v_tid
          AND existing.supplier_code = spr.supplier_code
    );

    IF v_has_supplier_app_index THEN
        RAISE NOTICE '[technostat_supplier_search_repair] supplier_app_index exists but rebuild is intentionally skipped in this tenant-safe variant.';
    ELSE
        RAISE NOTICE '[technostat_supplier_search_repair] supplier_app_index table absent; skipping index rebuild';
    END IF;

    RAISE NOTICE '[technostat_supplier_search_repair] supplier chooser baseline restored';
END;
$technostat_supplier_search_repair$;
