-- seed-pack-version: p5-b-v1
DO $phase5_business_partner_numbering$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:business_partner');
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
    v_field_id uuid;
    v_operation_id uuid := pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:create');
    v_binding_id uuid := pg_temp.meta_entity_seed_id('numbering-binding:business_partner:code:neon');
    v_lock_version bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM metadata.entity_numbering_binding WHERE id = v_binding_id) THEN RETURN; END IF;
    SELECT lock_version INTO v_lock_version FROM metadata.entity_change_set
     WHERE id = v_change_set_id AND status = 'draft';
    SELECT id INTO v_field_id FROM metadata.entity_field
     WHERE change_set_id = v_change_set_id AND field_key = 'code';
    IF v_lock_version IS NULL OR v_field_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM metadata.entity_operation WHERE id = v_operation_id) THEN
        RAISE EXCEPTION '[meta-entity P5-B] Business Partner draft, code field, or create operation is missing';
    END IF;

    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id, v_lock_version, v_actor);
    SET CONSTRAINTS ALL DEFERRED;
    INSERT INTO metadata.entity_numbering_binding (
      id,tenant_id,entity_id,change_set_id,entity_field_id,entity_operation_id,binding_key,
      target_plane,policy_code,policy_revision,assignment_mode,required,created_by
    ) VALUES (
      v_binding_id,NULL,v_entity_id,v_change_set_id,v_field_id,v_operation_id,'primary_code',
      'neon','business_partner.primary_number',1,'automatic',true,v_actor
    );
    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM metadata.fn_validate_entity_graph(v_change_set_id);
    SET CONSTRAINTS ALL DEFERRED;
END $phase5_business_partner_numbering$;
