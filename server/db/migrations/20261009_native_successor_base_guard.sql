BEGIN;
DO $$ DECLARE body text; old_text text; new_text text; start_at integer; end_at integer;
BEGIN
 body:=pg_get_functiondef('metadata.trg_guard_entity_change_set()'::regprocedure);
 start_at:=strpos(body,'    IF NEW.base_release_id IS NOT NULL THEN');
 end_at:=strpos(body, $marker$    IF TG_OP = 'INSERT' THEN$marker$);
 IF start_at=0 OR end_at<=start_at OR strpos(body,'read_native_successor_source')>0
 THEN RAISE EXCEPTION 'NATIVE_BASE_GUARD_PREDECESSOR_CHANGED'; END IF;
 old_text:=substring(body FROM start_at FOR end_at-start_at);
 IF strpos(old_text,'        SELECT * INTO v_base')=0 OR strpos(old_text, 'Base release must belong to the same scoped Entity')=0
 THEN RAISE EXCEPTION 'NATIVE_BASE_GUARD_PREDECESSOR_CHANGED'; END IF;
 new_text:=replace(old_text,'        SELECT * INTO v_base',$branch$        IF NEW.tenant_id IS NULL
           AND pg_has_role(current_user,'athyper_product_command_app','MEMBER')
           AND entity_command_private.admitted_creation(NEW.id,NEW.entity_id) THEN
            -- Resolve the exact published predecessor through the admitted reader.
            -- Do not require cross-draft SELECT or change the trigger's owner.
            PERFORM 1 FROM entity_command_private.read_native_successor_source(
                NEW.id,NEW.entity_id,NEW.base_release_id,4194304);
        ELSE
        SELECT * INTO v_base$branch$);
 new_text:=regexp_replace(new_text,E'    END IF;\n\n$',E'        END IF;\n    END IF;\n\n');
 IF new_text=old_text THEN RAISE EXCEPTION 'NATIVE_BASE_GUARD_PATCH_FAILED'; END IF;
 EXECUTE replace(body,old_text,new_text);
END $$;
COMMIT;
