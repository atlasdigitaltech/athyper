-- Private cross-tenant inspection; callers receive only a boolean, never reference rows.
CREATE FUNCTION control.lookup_value_has_references(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
DECLARE v control.lookup_value; fk record; used boolean;
BEGIN
 SELECT * INTO v FROM control.lookup_value WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 FOR fk IN
  SELECT n.nspname,t.relname,a.attname FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND c.confrelid='control.lookup_value'::regclass AND cardinality(c.conkey)=1
 LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',fk.nspname,fk.relname,fk.attname) INTO used USING p_id;
  IF used THEN RETURN true; END IF;
 END LOOP;
 RETURN v.domain_code='governance.cycle_domain' AND EXISTS(
  SELECT 1 FROM control.cycle_type WHERE domain_code=v.code AND (v.tenant_id IS NULL OR tenant_id=v.tenant_id));
END $$;
REVOKE ALL ON FUNCTION control.lookup_value_has_references(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.admin_lookup_value_referenced(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control,shared AS $$
DECLARE v control.lookup_value;
BEGIN
 SELECT * INTO v FROM control.lookup_value WHERE id=p_id;
 IF NOT FOUND OR (v.tenant_id IS NOT NULL AND v.tenant_id IS DISTINCT FROM shared.current_tenant_id_soft()) THEN RETURN true; END IF;
 RETURN control.lookup_value_has_references(p_id);
END $$;

-- The domain lock excludes new references while every affected tenant is inspected.
CREATE FUNCTION control.admin_lookup_domain_change_allowed(p_code text,p_active boolean,p_extensible boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
DECLARE v record;
BEGIN
 PERFORM 1 FROM control.lookup_domain WHERE code=p_code FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 FOR v IN SELECT id FROM control.lookup_value
  WHERE domain_code=p_code AND (NOT p_active OR (NOT p_extensible AND tenant_id IS NOT NULL))
  ORDER BY id FOR UPDATE
 LOOP
  IF control.lookup_value_has_references(v.id) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION control.admin_lookup_domain_change_allowed(text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.admin_lookup_domain_change_allowed(text,boolean,boolean) TO athyper_control_writer;

CREATE FUNCTION control.trg_guard_lookup_domain_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
BEGIN
 IF ((OLD.status='active' AND NEW.status<>'active') OR (OLD.is_extensible AND NOT NEW.is_extensible))
    AND NOT control.admin_lookup_domain_change_allowed(OLD.code,NEW.status='active',NEW.is_extensible)
 THEN RAISE EXCEPTION 'Lookup domain change invalidates referenced values' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lookup_domain_reference_guard BEFORE UPDATE OF status,is_extensible ON control.lookup_domain
 FOR EACH ROW EXECUTE FUNCTION control.trg_guard_lookup_domain_references();
REVOKE ALL ON FUNCTION control.trg_guard_lookup_domain_references() FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.trg_lookup_reference_active() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
DECLARE v_code text; d control.lookup_domain; v control.lookup_value;
BEGIN
 SELECT domain_code INTO v_code FROM control.lookup_value WHERE id=NEW.value_id;
 SELECT * INTO d FROM control.lookup_domain WHERE code=v_code FOR SHARE;
 SELECT * INTO v FROM control.lookup_value WHERE id=NEW.value_id FOR SHARE;
 IF v.id IS NULL OR v.domain_code IS DISTINCT FROM d.code OR d.status<>'active' OR v.status<>'active'
    OR (v.tenant_id IS NOT NULL AND (v.tenant_id<>NEW.tenant_id OR NOT d.is_extensible))
 THEN RAISE EXCEPTION 'Lookup value is inactive or foreign' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.trg_lock_cycle_domain_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
DECLARE d control.lookup_domain;
BEGIN
 SELECT * INTO d FROM control.lookup_domain WHERE code='governance.cycle_domain' FOR SHARE;
 PERFORM 1 FROM control.lookup_value WHERE domain_code=d.code AND code=NEW.domain_code
   AND status='active' AND (tenant_id IS NULL OR (tenant_id=NEW.tenant_id AND d.is_extensible)) FOR SHARE;
 IF d.status IS DISTINCT FROM 'active' OR NOT FOUND THEN
  RAISE EXCEPTION 'Inactive or unknown cycle domain' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
