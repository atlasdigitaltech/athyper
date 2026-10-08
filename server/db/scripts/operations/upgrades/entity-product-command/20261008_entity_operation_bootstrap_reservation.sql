BEGIN;
SET LOCAL lock_timeout='5s';
-- Permit privately installed evidence to reserve an exact future draft UUID.
-- This is not root creation, operation initialization or publication authority.
-- Source FKs stay intact; the reader still requires a real matching native root.
DO $$ DECLARE target_fk text; BEGIN
 SELECT c.conname INTO STRICT target_fk FROM pg_constraint c
 WHERE c.conrelid='entity_command_private.operation_bootstrap_source'::regclass
 AND c.contype='f' AND c.confrelid='metadata.entity_change_set'::regclass
 AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='target_change_set_id')]::smallint[];
 EXECUTE format('ALTER TABLE entity_command_private.operation_bootstrap_source DROP CONSTRAINT %I',target_fk);
END $$;
CREATE FUNCTION entity_command_private.check_reserved_bootstrap_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; binding record; root record;
BEGIN
 IF TG_TABLE_SCHEMA='metadata' THEN target:=NEW.id; ELSE target:=NEW.target_change_set_id; END IF;
 FOR binding IN SELECT * FROM entity_command_private.operation_bootstrap_source WHERE target_change_set_id=target FOR SHARE LOOP
  SELECT id,entity_id,tenant_id,source_kind,native_core_layout_version INTO root
   FROM metadata.entity_change_set WHERE id=target FOR SHARE;
  IF FOUND AND (root.entity_id IS DISTINCT FROM binding.entity_id OR root.tenant_id IS NOT NULL
    OR root.source_kind IS DISTINCT FROM 'product' OR root.native_core_layout_version IS DISTINCT FROM 2) THEN
   RAISE EXCEPTION 'OPERATION_BOOTSTRAP_TARGET_MISMATCH' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.check_reserved_bootstrap_target() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER operation_bootstrap_reservation_guard
 AFTER INSERT OR UPDATE ON entity_command_private.operation_bootstrap_source
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION entity_command_private.check_reserved_bootstrap_target();
CREATE CONSTRAINT TRIGGER operation_bootstrap_target_guard
 AFTER INSERT OR UPDATE ON metadata.entity_change_set
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION entity_command_private.check_reserved_bootstrap_target();
-- Reject deletion of an installed target while its approval evidence still pins it.
CREATE FUNCTION entity_command_private.retain_bootstrap_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM entity_command_private.operation_bootstrap_source WHERE target_change_set_id=OLD.id) THEN
  RAISE EXCEPTION 'OPERATION_BOOTSTRAP_TARGET_REFERENCED' USING ERRCODE='23503';
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.retain_bootstrap_target() FROM PUBLIC;
CREATE TRIGGER operation_bootstrap_target_retain BEFORE DELETE ON metadata.entity_change_set
 FOR EACH ROW EXECUTE FUNCTION entity_command_private.retain_bootstrap_target();
COMMIT;
