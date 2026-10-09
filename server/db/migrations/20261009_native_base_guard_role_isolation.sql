BEGIN;
DO $migration$ DECLARE body text; old_text text; new_text text;
BEGIN
 body:=pg_get_functiondef('metadata.trg_guard_entity_change_set()'::regprocedure);
 old_text:=$old$        IF NEW.tenant_id IS NULL
           AND pg_has_role(current_user,'athyper_product_command_app','MEMBER')
           AND entity_command_private.admitted_creation(NEW.id,NEW.entity_id) THEN$old$;
 new_text:=$new$        -- Keep private command-schema resolution inside the command-role branch.
        -- SQL expression evaluation order does not guarantee short-circuit access checks.
        IF NEW.tenant_id IS NULL AND pg_has_role(current_user,'athyper_product_command_app','MEMBER') THEN
            v_native_creation := entity_command_private.admitted_creation(NEW.id,NEW.entity_id);
        END IF;
        IF v_native_creation THEN$new$;
 IF strpos(body,old_text)=0 OR strpos(body,'v_native_creation')>0
 OR strpos(body,'    v_substantive_change boolean := false;')=0
 THEN RAISE EXCEPTION 'NATIVE_BASE_ROLE_GUARD_PREDECESSOR_CHANGED'; END IF;
 body:=replace(body,'    v_substantive_change boolean := false;',E'    v_substantive_change boolean := false;\n    v_native_creation boolean := false;');
 EXECUTE replace(body,old_text,new_text);
END $migration$;
COMMIT;
