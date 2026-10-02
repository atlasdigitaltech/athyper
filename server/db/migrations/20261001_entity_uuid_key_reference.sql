-- Extend the existing strict mapping contract to UUID relationships. No grants,
-- personal data, runtime activation, or field write permissions change here.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_clause constant text := 'WHEN ''uuid'' THEN ARRAY[''kind'']';
  new_clause constant text := 'WHEN ''uuid'' THEN ARRAY[''kind'', ''keyReference'']';
BEGIN
  IF current_database() NOT LIKE '%studio' THEN
    RAISE EXCEPTION 'Studio metadata database required';
  END IF;
  SELECT pg_get_functiondef('metadata.trg_validate_entity_field_contract()'::regprocedure) INTO definition;
  IF position(new_clause IN definition)>0 THEN RETURN; END IF;
  IF position(old_clause IN definition)=0
     OR position('metadata.fn_entity_key_reference_valid' IN definition)=0
     OR length(definition)-length(replace(definition,old_clause,''))<>length(old_clause) THEN
    RAISE EXCEPTION 'Unexpected field validator; review UUID reference contract before applying';
  END IF;
  EXECUTE replace(definition,old_clause,new_clause);
END;
$migration$;
COMMIT;
