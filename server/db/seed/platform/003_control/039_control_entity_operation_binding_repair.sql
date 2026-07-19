-- Re-establish the v1 operation binding before legacy platform seeds run.
--
-- The v2 promotion seed (101) intentionally replaces this constraint after
-- all platform operation rows have entity_version_id. Metadata rebuilds force
-- rerun 003_control seeds, however, so 044 can be executed again after 101.
-- Keeping this small repair before 044 makes that rerun idempotent while 101
-- remains the owner of the final v2 constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.entity_operation'::regclass
           AND conname = 'eo_binding_uq'
    ) THEN
        ALTER TABLE control.entity_operation
            ADD CONSTRAINT eo_binding_uq UNIQUE NULLS NOT DISTINCT (
                tenant_id, entity_name, permission_code
            );
    END IF;
END $$;

