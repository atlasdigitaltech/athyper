BEGIN;
CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 IF execution IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution e WHERE e.id=execution AND e.tenant_id=tenant AND e.command_code IN('entity.case.draft.write','entity.case.validation','entity.case.lifecycle','entity.case.materialize.internal_business_partner','entity.case.materialize.business_partner_role','entity.case.materialize.business_partner_company','entity.case.materialize.business_partner_change','entity.case.backfill.business_partner_request') AND e.status='processing' AND e.actor_principal_id=master.current_principal_id_soft()) THEN RAISE EXCEPTION 'Entity case mutations require the governed command' USING ERRCODE='insufficient_privilege';END IF;RETURN COALESCE(NEW,OLD);
END $$;
COMMIT;
