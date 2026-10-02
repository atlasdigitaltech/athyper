-- Read-only contract checks; no reference data, grants or publications change.
BEGIN;
SET TRANSACTION READ ONLY;
DO $$
DECLARE
    v_reference jsonb := '{"targetEntity":"region","labelField":"name","fields":[{"source":"country_code","target":"country_code"},{"source":"parent_code","target":"code"}]}';
BEGIN
    IF NOT metadata.fn_entity_key_reference_valid(v_reference, 'parent_code') THEN
        RAISE EXCEPTION 'Valid composite mapping rejected';
    END IF;
    IF metadata.fn_entity_key_reference_valid(v_reference, 'missing')
       OR metadata.fn_entity_key_reference_valid(v_reference || '{"sql":"SELECT 1"}', 'parent_code')
       OR metadata.fn_entity_key_reference_valid(v_reference || '{"targetEntity":true}', 'parent_code')
       OR metadata.fn_entity_key_reference_valid(v_reference || '{"fields":[]}', 'parent_code')
       OR metadata.fn_entity_key_reference_valid(v_reference || '{"fields":[{"source":"parent_code","target":"code"},{"source":"parent_code","target":"name"}]}', 'parent_code')
       OR metadata.fn_entity_key_reference_valid(v_reference || '{"fields":[{"source":"parent_code","target":"code","sql":"injected"}]}', 'parent_code') THEN
        RAISE EXCEPTION 'Invalid key mapping admitted';
    END IF;
END $$;
ROLLBACK;
