BEGIN;
ALTER TABLE event.invalidation_dead_letter DROP CONSTRAINT invalidation_dead_letter_scope_chk;
ALTER TABLE event.invalidation_dead_letter ADD CONSTRAINT invalidation_dead_letter_scope_chk CHECK (length(scope_key) BETWEEN 1 AND 256 AND scope_key ~ '^[A-Za-z0-9_.:-]+$');
COMMIT;
