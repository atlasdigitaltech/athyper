-- Run after the scope-regex migration with psql -X -v ON_ERROR_STOP=1.
-- Exercises the real constraint and leaves no test records behind.
BEGIN;
DO $$
DECLARE
  scope text;
  kind text;
BEGIN
  FOREACH kind IN ARRAY ARRAY['authorization','metadata'] LOOP
    FOREACH scope IN ARRAY ARRAY['a',repeat('a',255),repeat('a',256),'A_z.0:-'] LOOP
      INSERT INTO event.invalidation_dead_letter
        (invalidation_id,kind,plane_key,scope_key,error_code,original_created_at,attempt_count)
      VALUES (gen_random_uuid(),kind,'neon',scope,'CONSTRAINT_TEST',clock_timestamp(),1);
    END LOOP;
    FOREACH scope IN ARRAY ARRAY['',repeat('a',257),'bad scope','bad/scope'] LOOP
      BEGIN
        INSERT INTO event.invalidation_dead_letter
          (invalidation_id,kind,plane_key,scope_key,error_code,original_created_at,attempt_count)
        VALUES (gen_random_uuid(),kind,'neon',scope,'CONSTRAINT_TEST',clock_timestamp(),1);
        RAISE EXCEPTION 'Invalid scope unexpectedly accepted';
      EXCEPTION WHEN check_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
