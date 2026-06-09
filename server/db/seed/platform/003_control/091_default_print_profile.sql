-- ============================================================
-- 091_default_print_profile.sql
-- Seeds a default print profile for each active tenant.
-- Idempotent: ON CONFLICT (tenant_id, code) DO NOTHING.
-- ============================================================

DO $$
DECLARE
    v_tenant record;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    FOR v_tenant IN
        SELECT id FROM master.tenant WHERE status = 'active'
    LOOP
        INSERT INTO master.print_profile (
            id,
            tenant_id,
            code,
            name,
            paper_size,
            orientation,
            color_mode,
            quality_dpi,
            output_format,
            duplex,
            margins,
            compression,
            header_footer,
            background_graphics,
            watermark_enabled,
            watermark_text,
            encrypt_pdf,
            archive_after_render,
            email_after_render,
            is_default,
            metadata,
            status,
            created_at,
            created_by
        )
        VALUES (
            shared.uuidv7(),
            v_tenant.id,
            'default_a4_portrait',
            'Default A4 Portrait',
            'A4',
            'portrait',
            'color',
            300,
            'pdf',
            'none',
            'normal',
            'medium',
            false,
            true,
            false,
            NULL,
            false,
            true,
            false,
            true,
            '{}'::jsonb,
            'active',
            now(),
            v_sys
        )
        ON CONFLICT (tenant_id, code) DO NOTHING;
    END LOOP;
END;
$$;
