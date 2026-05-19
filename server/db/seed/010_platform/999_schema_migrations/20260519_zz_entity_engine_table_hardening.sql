-- 20260519_zz_entity_engine_table_hardening.sql
-- Purpose: apply entity-engine DDL hardening that CREATE TABLE IF NOT EXISTS
--          cannot retrofit onto existing databases.

ALTER TABLE control.entity_numbering_counter
  ALTER COLUMN last_value TYPE bigint;

DROP INDEX IF EXISTS control.ef_default_per_ctx_uq;

DO $$ BEGIN
  ALTER TABLE control.entity_flow_section ADD CONSTRAINT efsec_step_fk
    FOREIGN KEY (flow_step_id) REFERENCES control.entity_flow_step (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE control.entity_flow_step DROP CONSTRAINT IF EXISTS efs_flow_order_uq;
ALTER TABLE control.entity_flow_step ADD CONSTRAINT efs_flow_order_uq
  UNIQUE (flow_id, sort_order) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE control.entity_flow_section DROP CONSTRAINT IF EXISTS efsec_step_order_uq;
ALTER TABLE control.entity_flow_section ADD CONSTRAINT efsec_step_order_uq
  UNIQUE (flow_step_id, sort_order) DEFERRABLE INITIALLY DEFERRED;
