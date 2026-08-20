-- seed-pack-version: p3.0-v1
-- Phase 3 authoring examples extend only the intentionally editable Business
-- Partner Studio draft. Published P2.7 package releases remain untouched.
DO $phase3_business_partner$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:business_partner');
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
    v_surface_id uuid := pg_temp.meta_entity_seed_id('surface:business_partner:p2_7_studio_draft:editor');
    v_identity_section_id uuid := pg_temp.meta_entity_seed_id('surface-section:business_partner:p2_7_studio_draft:editor:identity');
    v_contact_section_id uuid := pg_temp.meta_entity_seed_id('surface-section:business_partner:p2_7_studio_draft:editor:contact');
    v_lock_version bigint;
    v_field record;
    v_position smallint := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM metadata.entity_surface WHERE id = v_surface_id) THEN
        RETURN;
    END IF;

    SELECT lock_version INTO v_lock_version
      FROM metadata.entity_change_set
     WHERE id = v_change_set_id AND status = 'draft';
    IF v_lock_version IS NULL THEN
        RAISE EXCEPTION '[meta-entity P3] editable Business Partner draft is missing';
    END IF;
    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id, v_lock_version, v_actor);

    INSERT INTO metadata.entity_surface (
        id, tenant_id, entity_id, change_set_id, surface_key, surface_kind,
        title, description, layout_kind, layout_config, is_default, created_by
    ) VALUES (
        v_surface_id, NULL, v_entity_id, v_change_set_id, 'editor', 'form',
        'Business Partner', 'Canonical create and edit surface.', 'grid',
        '{"columns":12,"density":"comfortable"}'::jsonb, true, v_actor
    );

    INSERT INTO metadata.entity_surface_section (
        id, tenant_id, entity_id, change_set_id, entity_surface_id, section_key,
        section_kind, title, position, column_count, created_by
    ) VALUES
        (v_identity_section_id, NULL, v_entity_id, v_change_set_id, v_surface_id,
         'identity', 'section', 'Identity', 0, 2, v_actor),
        (v_contact_section_id, NULL, v_entity_id, v_change_set_id, v_surface_id,
         'contact', 'section', 'Contact and communication', 1, 2, v_actor);

    FOR v_field IN
        SELECT id, field_key
          FROM metadata.entity_field
         WHERE change_set_id = v_change_set_id
           AND field_key IN ('code', 'name', 'display_name', 'legal_name', 'description', 'website_url')
         ORDER BY CASE field_key
             WHEN 'code' THEN 1 WHEN 'name' THEN 2 WHEN 'display_name' THEN 3
             WHEN 'legal_name' THEN 4 WHEN 'description' THEN 5 ELSE 6 END
    LOOP
        INSERT INTO metadata.entity_surface_field_binding (
            id, tenant_id, entity_id, change_set_id, entity_surface_id,
            entity_surface_section_id, entity_field_id, binding_key, position,
            widget_key, column_span, display_config, created_by
        ) VALUES (
            pg_temp.meta_entity_seed_id('surface-field:business_partner:p2_7_studio_draft:editor:' || v_field.field_key),
            NULL, v_entity_id, v_change_set_id, v_surface_id,
            CASE WHEN v_field.field_key IN ('description', 'website_url') THEN v_contact_section_id ELSE v_identity_section_id END,
            v_field.id, v_field.field_key, v_position,
            CASE WHEN v_field.field_key = 'website_url' THEN 'input.url'
                 WHEN v_field.field_key = 'description' THEN 'input.textarea'
                 ELSE 'input.text' END,
            CASE WHEN v_field.field_key IN ('display_name', 'legal_name') THEN 12 ELSE 6 END,
            '{}'::jsonb, v_actor
        );
        v_position := v_position + 1;
    END LOOP;

    INSERT INTO metadata.entity_operation (
        id, tenant_id, entity_id, change_set_id, operation_key, operation_kind,
        label, description, handler_key, permission_code, execution_mode,
        idempotency_mode, input_surface_key, requires_mfa, audit_event_code, created_by
    ) VALUES
        (pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:create'),
         NULL, v_entity_id, v_change_set_id, 'create', 'create', 'Create Business Partner',
         'Creates a Business Partner from the canonical editor surface.',
         'business_partner.create', 'neon.business_partner.create', 'synchronous', 'required',
         'editor', false, 'business.partner.created', v_actor),
        (pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:update'),
         NULL, v_entity_id, v_change_set_id, 'update', 'update', 'Update Business Partner',
         'Updates a Business Partner through optimistic mutation.',
         'business_partner.update', 'neon.business_partner.update', 'synchronous', 'required',
         'editor', false, 'business.partner.updated', v_actor);

    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM metadata.fn_validate_entity_graph(v_change_set_id);
    SET CONSTRAINTS ALL DEFERRED;
END
$phase3_business_partner$;
