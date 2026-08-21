-- seed-pack-version: p5-a-v1
DO $phase5_business_partner_lifecycle$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:business_partner');
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
    v_state_field_id uuid;
    v_binding_id uuid := pg_temp.meta_entity_seed_id('lifecycle-binding:business_partner:neon');
    v_activate_id uuid := pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:activate');
    v_deactivate_id uuid := pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:deactivate');
    v_lock_version bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM metadata.entity_lifecycle_binding WHERE id=v_binding_id) THEN RETURN; END IF;
    SELECT lock_version INTO v_lock_version FROM metadata.entity_change_set WHERE id=v_change_set_id AND status='draft';
    SELECT id INTO v_state_field_id FROM metadata.entity_field WHERE change_set_id=v_change_set_id AND field_key='status';
    IF v_lock_version IS NULL OR v_state_field_id IS NULL THEN RAISE EXCEPTION '[meta-entity P5-A] Business Partner draft or status field is missing'; END IF;
    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id,v_lock_version,v_actor);
    SET CONSTRAINTS ALL DEFERRED;
    INSERT INTO metadata.entity_operation (id,tenant_id,entity_id,change_set_id,operation_key,operation_kind,label,
      description,handler_key,permission_code,execution_mode,idempotency_mode,requires_mfa,audit_event_code,created_by)
    VALUES
      (v_activate_id,NULL,v_entity_id,v_change_set_id,'activate','transition','Activate Business Partner',
       'Requests the canonical active transition.','business_partner.activate','neon.business_partner.activate',
       'synchronous','required',false,'business.partner.activated',v_actor),
      (v_deactivate_id,NULL,v_entity_id,v_change_set_id,'deactivate','transition','Deactivate Business Partner',
       'Requests the canonical inactive transition.','business_partner.deactivate','neon.business_partner.deactivate',
       'synchronous','required',false,'business.partner.deactivated',v_actor);
    INSERT INTO metadata.entity_lifecycle_binding (id,tenant_id,entity_id,change_set_id,entity_field_id,binding_key,
      target_plane,lifecycle_code,lifecycle_revision,required,created_by)
    VALUES (v_binding_id,NULL,v_entity_id,v_change_set_id,v_state_field_id,'primary','neon','business_partner.standard',1,true,v_actor);
    INSERT INTO metadata.entity_lifecycle_operation_binding (id,tenant_id,entity_id,change_set_id,
      entity_lifecycle_binding_id,entity_operation_id,mapping_key,transition_code,created_by)
    VALUES
      (pg_temp.meta_entity_seed_id('lifecycle-operation:business_partner:activate'),NULL,v_entity_id,v_change_set_id,v_binding_id,v_activate_id,'activate','activate',v_actor),
      (pg_temp.meta_entity_seed_id('lifecycle-operation:business_partner:deactivate'),NULL,v_entity_id,v_change_set_id,v_binding_id,v_deactivate_id,'deactivate','deactivate',v_actor);
    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM metadata.fn_validate_entity_graph(v_change_set_id);
    SET CONSTRAINTS ALL DEFERRED;
END $phase5_business_partner_lifecycle$;
