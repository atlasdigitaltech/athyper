DO $phase5_lifecycle_assertions$
DECLARE v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
BEGIN
  IF (SELECT count(*) FROM metadata.entity_lifecycle_binding WHERE change_set_id=v_change_set_id) <> 1
    OR (SELECT count(*) FROM metadata.entity_lifecycle_operation_binding WHERE change_set_id=v_change_set_id) <> 2
  THEN RAISE EXCEPTION '[meta-entity P5-A] lifecycle fixture is incomplete'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='metadata' AND table_name='entity_operation' AND column_name='lifecycle_transition_code')
  THEN RAISE EXCEPTION '[meta-entity P5-A] transition ownership remains duplicated on entity_operation'; END IF;
END $phase5_lifecycle_assertions$;
