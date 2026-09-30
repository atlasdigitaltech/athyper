-- Regression tests against a seeded development Neon database; all test writes roll back.
BEGIN;
SET LOCAL statement_timeout='60s';
SELECT set_config('app.database_plane','neon',true);
CREATE TEMP TABLE preference_test_context AS
SELECT t.id tenant_id,b.id partner_id,s.id supplier_id,a.id actor_id,r.id reviewer_id
FROM master.tenant t JOIN master.business_partner b ON b.tenant_id=t.id AND b.code='ATH-BP-SA'
JOIN master.supplier s ON s.tenant_id=t.id AND s.business_partner_id=b.id
JOIN master.principal a ON a.tenant_id=t.id AND a.code='athyper.admin'
JOIN master.principal r ON r.tenant_id=t.id AND r.code='athyper.owner'
WHERE t.code='athyper';

CREATE FUNCTION pg_temp.new_preference(p_from date DEFAULT '2035-01-01',p_until date DEFAULT '2036-01-01') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c record; v_id uuid:=shared.uuidv7();
BEGIN
 SELECT * INTO STRICT c FROM preference_test_context;
 INSERT INTO control.supplier_preference_designation(id,tenant_id,business_partner_id,supplier_id,effective_from,effective_until,rationale,idempotency_key,created_by)
 VALUES(v_id,c.tenant_id,c.partner_id,c.supplier_id,p_from,p_until,'Normalized scope regression','regression:'||v_id,c.actor_id);
 RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.add_scope(p_id uuid,p_country text DEFAULT NULL,p_mode text DEFAULT 'include',p_group smallint DEFAULT 1,p_from date DEFAULT '2035-01-01',p_until date DEFAULT '2036-01-01') RETURNS void LANGUAGE sql AS $$
 INSERT INTO control.business_partner_decision_scope(tenant_id,supplier_preference_id,scope_kind,country_code,scope_mode,scope_group,effective_from,effective_until,created_by)
 SELECT tenant_id,p_id,CASE WHEN p_country IS NULL THEN 'global' ELSE 'country' END,p_country,p_mode,p_group,p_from,p_until,actor_id FROM preference_test_context;
$$;
CREATE FUNCTION pg_temp.decide(p_id uuid,p_status text DEFAULT 'approved',p_version bigint DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c record;
BEGIN
 SELECT * INTO STRICT c FROM preference_test_context;
 PERFORM set_config('app.current_tenant_id',c.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',c.reviewer_id::text,true);
 PERFORM control.command_business_partner_decision(c.tenant_id,'supplier_preference',p_id,p_status,p_version,'Regression decision','regression:'||p_id||':'||p_status||':'||p_version,repeat('a',64),'{}'::jsonb,c.reviewer_id);
END $$;

DO $$
DECLARE c record; a uuid; b uuid; d uuid; e uuid; f uuid; g uuid; h uuid; z uuid; v_org uuid; v_created record;
BEGIN
 SELECT * INTO STRICT c FROM preference_test_context;
 -- The application creation command must also work with normalized scopes.
 SELECT id INTO STRICT v_org FROM master.operating_organization WHERE tenant_id=c.tenant_id AND code='athyper.procurement.emea';
 PERFORM set_config('app.current_tenant_id',c.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',c.actor_id::text,true);
 SELECT * INTO STRICT v_created FROM control.command_create_business_partner_decision(
   c.tenant_id,'supplier_preference',c.partner_id,'supplier',c.supplier_id,v_org,NULL,NULL,
   '{"rationale":"Command regression","effectiveFrom":"2035-01-01","effectiveUntil":"2036-01-01"}'::jsonb,
   'scope-regression-create',c.actor_id);
 IF NOT EXISTS (SELECT 1 FROM control.business_partner_decision_scope WHERE tenant_id=c.tenant_id AND supplier_preference_id=v_created.aggregate_id AND operating_organization_id=v_org) THEN RAISE EXCEPTION 'Creation command did not materialize scope'; END IF;
 SELECT * INTO STRICT v_created FROM control.command_create_business_partner_decision(
   c.tenant_id,'supplier_preference',c.partner_id,'supplier',c.supplier_id,v_org,NULL,NULL,
   '{"rationale":"Command regression","effectiveFrom":"2035-01-01","effectiveUntil":"2036-01-01"}'::jsonb,
   'scope-regression-create',c.actor_id);
 IF NOT v_created.replayed THEN RAISE EXCEPTION 'Creation replay was not idempotent'; END IF;
 a:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(a,'SA'); PERFORM pg_temp.decide(a);
 -- Same supplier and overlapping normalized scope must fail.
 b:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(b,'SA');
 BEGIN PERFORM pg_temp.decide(b); RAISE EXCEPTION 'Overlapping approval accepted'; EXCEPTION WHEN exclusion_violation THEN NULL; END;
 -- Different country is a disjoint scope and can be approved.
 d:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(d,'DE'); PERFORM pg_temp.decide(d);
 -- Adjacent half-open dates do not overlap.
 e:=pg_temp.new_preference('2036-01-01','2037-01-01'); PERFORM pg_temp.add_scope(e,'SA','include',1::smallint,'2036-01-01','2037-01-01'); PERFORM pg_temp.decide(e);
 -- A global scope overlaps a country-specific scope.
 f:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(f);
 BEGIN PERFORM pg_temp.decide(f); RAISE EXCEPTION 'Global overlap accepted'; EXCEPTION WHEN exclusion_violation THEN NULL; END;
 -- Exclusions subtract a matching country from a wildcard group.
 PERFORM pg_temp.add_scope(f,'SA','exclude'); PERFORM pg_temp.add_scope(f,'DE','exclude'); PERFORM pg_temp.decide(f);
 -- Pending decisions cannot be approved without scope.
 g:=pg_temp.new_preference();
 BEGIN PERFORM pg_temp.decide(g); RAISE EXCEPTION 'Unscoped approval accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- Date-specific exclusions must not suppress a later overlap.
 h:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(h,'SA');
 PERFORM pg_temp.add_scope(h,'SA','exclude',1::smallint,'2035-01-01','2035-06-01');
 IF NOT control.supplier_preference_scopes_overlap(c.tenant_id,a,h) THEN RAISE EXCEPTION 'Future overlap missed'; END IF;
 IF control.supplier_preference_scopes_overlap(shared.uuidv7(),a,h) THEN RAISE EXCEPTION 'Cross tenant overlap leaked'; END IF;
 -- Alternative groups must not be flattened into one conjunction.
 z:=pg_temp.new_preference(); PERFORM pg_temp.add_scope(z,'GB'); PERFORM pg_temp.add_scope(z,'SA','include',2::smallint);
 IF NOT control.supplier_preference_scopes_overlap(c.tenant_id,a,z) THEN RAISE EXCEPTION 'Alternative group overlap missed'; END IF;
 -- A raw state update still requires the governed decision command.
 z:=pg_temp.new_preference('2040-01-01','2041-01-01'); PERFORM pg_temp.add_scope(z,'SA','include',1::smallint,'2040-01-01','2041-01-01');
 BEGIN
   UPDATE control.supplier_preference_designation SET status='approved',row_version=row_version+1,updated_by=c.reviewer_id WHERE id=z;
   RAISE EXCEPTION 'Ungoverned decision accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Scope evidence cannot be edited, deleted, or added after a decision.
 BEGIN UPDATE control.business_partner_decision_scope SET country_code='GB' WHERE supplier_preference_id=a; RAISE EXCEPTION 'Scope edit accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN DELETE FROM control.business_partner_decision_scope WHERE supplier_preference_id=a; RAISE EXCEPTION 'Scope delete accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM pg_temp.add_scope(a,'GB'); RAISE EXCEPTION 'Post approval scope accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- The head still enforces creation evidence and row version.
 BEGIN UPDATE control.supplier_preference_designation SET rationale='Changed',row_version=row_version+1 WHERE id=b; RAISE EXCEPTION 'Rationale change accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE control.supplier_preference_designation SET status='rejected' WHERE id=b; RAISE EXCEPTION 'Missing version accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- Revocation releases the overlapping scope for another preference.
 PERFORM pg_temp.decide(a,'revoked',2); PERFORM pg_temp.decide(b);
 BEGIN PERFORM pg_temp.decide(a,'approved',3); RAISE EXCEPTION 'Terminal mutation accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'Supplier preference normalized scope regression passed';
END $$;
ROLLBACK;
