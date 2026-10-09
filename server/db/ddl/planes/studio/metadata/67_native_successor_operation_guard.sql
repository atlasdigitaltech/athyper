-- Preserve the exact stored predecessor control under admitted native creation.
-- Specific owner approval covers predecessor preservation, not new defaults.
DO $$ DECLARE body text;
BEGIN
 body:=pg_get_functiondef('entity_command_private.guard_native_operation_initialization()'::regprocedure);
 IF strpos(body,'DECLARE approved boolean;')=0
 OR strpos(body,' SELECT true INTO approved FROM entity_command_private.operation_bootstrap_source b')=0
 OR strpos(body,'NATIVE_SUCCESSOR_OPERATION_SOURCE_CHANGED')>0
 THEN RAISE EXCEPTION 'NATIVE_SUCCESSOR_OPERATION_GUARD_PREDECESSOR_CHANGED'; END IF;
 body:=replace(body,'DECLARE approved boolean;','DECLARE approved boolean; target metadata.entity_change_set; predecessor record;');
 body:=replace(body,' SELECT true INTO approved FROM entity_command_private.operation_bootstrap_source b',
 $branch$ -- Owner-approved successor preservation: no source-free defaults or new keys.
 SELECT c.* INTO target FROM metadata.entity_change_set c
 WHERE c.id=NEW.change_set_id AND c.entity_id=NEW.entity_id AND c.tenant_id IS NULL
 AND c.source_kind='product' AND c.native_core_layout_version=2
 AND c.status='draft' AND c.lock_version=1 AND c.base_release_id IS NOT NULL
 AND NEW.tenant_id IS NULL AND NEW.operation_kind='read' AND NEW.authorization_effect='read'
 AND entity_command_private.admitted_creation(c.id,c.entity_id) FOR SHARE;
 IF FOUND THEN
  SELECT * INTO STRICT predecessor FROM entity_command_private.read_native_successor_source(
   target.id,target.entity_id,target.base_release_id,4194304);
  SELECT true INTO approved FROM metadata.entity_operation o
  WHERE o.change_set_id=predecessor.source_change_set_id AND o.entity_id=NEW.entity_id
  AND o.tenant_id IS NULL AND o.operation_key=NEW.operation_key AND o.id<>NEW.id
  AND o.operation_kind='read' AND o.authorization_effect='read'
  AND o.requires_mfa IS NOT DISTINCT FROM NEW.requires_mfa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SUCCESSOR_OPERATION_SOURCE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 SELECT true INTO approved FROM entity_command_private.operation_bootstrap_source b$branch$);
 EXECUTE body;
END $$;
