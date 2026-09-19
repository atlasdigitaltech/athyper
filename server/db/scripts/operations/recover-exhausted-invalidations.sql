-- Requires the canonical invalidation scope constraint from common/event/05_constraints.sql.
-- Older targets require the preserved legacy-baseline-20260914 scope upgrade first.
-- Preserve exhausted deliveries as dead letters; never replay authorization work
-- implicitly. Row locks and expired-lease predicates exclude active deliveries.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
  source_table text;
  source_kind text;
  scope_column text;
  plane text := replace(current_database(), 'athyper_', '');
  recovered bigint;
BEGIN
  IF plane NOT IN ('studio', 'neon', 'mesh') THEN
    RAISE EXCEPTION 'Unexpected database: %', current_database();
  END IF;
  FOR source_table, source_kind, scope_column IN
    VALUES ('authorization_invalidation_outbox', 'authorization', 'scope_kind'),
           ('descriptor_invalidation_outbox', 'metadata', 'coalesce(entity_code,reason)')
  LOOP
    EXECUTE format($sql$
      WITH candidates AS MATERIALIZED (
        SELECT * FROM event.%I
        WHERE status = 'processing' AND attempts >= max_attempts
          AND locked_until < clock_timestamp()
        FOR UPDATE
      ), inserted AS (
        INSERT INTO event.invalidation_dead_letter
          (invalidation_id,kind,plane_key,tenant_id,scope_key,error_code,
           sanitized_payload,original_created_at,attempt_count)
        SELECT id, %L, %L, tenant_id, %s, 'RECOVERED_EXHAUSTED_LEASE',
          '{"recovery":"invalidation_scope_regex","originalErrorUnavailable":true}'::jsonb,
          created_at, attempts FROM candidates
        ON CONFLICT (invalidation_id) DO NOTHING
        RETURNING invalidation_id
      )
      UPDATE event.%I item
      SET status='dead_letter', locked_at=NULL, locked_by=NULL, locked_until=NULL,
          last_error='RECOVERED_EXHAUSTED_LEASE'
      FROM candidates c
      WHERE item.id=c.id AND (
        EXISTS (SELECT 1 FROM inserted i WHERE i.invalidation_id=c.id)
        OR EXISTS (SELECT 1 FROM event.invalidation_dead_letter d WHERE d.invalidation_id=c.id)
      )
    $sql$, source_table, source_kind, plane, scope_column, source_table);
    GET DIAGNOSTICS recovered = ROW_COUNT;
    RAISE NOTICE '%: recovered % % invalidations', current_database(), recovered, source_kind;
  END LOOP;
END $$;
COMMIT;
