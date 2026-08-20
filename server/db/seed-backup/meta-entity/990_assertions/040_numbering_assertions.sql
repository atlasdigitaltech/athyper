DO $$
DECLARE v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
BEGIN
    IF (SELECT count(*) FROM metadata.entity_numbering_binding WHERE change_set_id = v_change_set_id) <> 1 THEN
        RAISE EXCEPTION '[meta-entity P5-B] expected one Business Partner numbering binding';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM metadata.entity_numbering_binding AS binding
          JOIN metadata.entity_field AS field ON field.id = binding.entity_field_id
          JOIN metadata.entity_operation AS operation ON operation.id = binding.entity_operation_id
         WHERE binding.change_set_id = v_change_set_id
           AND binding.binding_key = 'primary_code'
           AND binding.target_plane = 'neon'
           AND binding.policy_code = 'business_partner.primary_number'
           AND binding.policy_revision = 1
           AND field.field_key = 'code'
           AND operation.operation_key = 'create'
    ) THEN
        RAISE EXCEPTION '[meta-entity P5-B] Business Partner numbering coordinate is incomplete';
    END IF;
END $$;
