import { id } from "./seed-identity.mjs";
/** Explicit CATL-only demo. Existing shared reference codes are never created or changed. */
export function catlDirectCommoditySql() {
  return `DO $demo$
DECLARE t uuid; a uuid; mapped uuid; unmapped uuid; category uuid:='${id("cirrusatlantic", "direct-lab-category")}';
BEGIN
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT a FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.current_actor_type','user',true);
 SELECT id INTO STRICT mapped FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41101502' AND is_active;
 SELECT id INTO STRICT unmapped FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41101503' AND is_active;
 INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by) VALUES
 (category,t,'DEMO_SAMPLE_PREPARATION','Sample preparation (Demo)','active',a),
 ('${id("cirrusatlantic", "direct-unmapped-category")}',t,'DEMO_SPECIALIST_SERVICES','Specialist services — no UNSPSC mapping (Demo)','active',a)
 ON CONFLICT(tenant_id,id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.commodity_category WHERE tenant_id=t AND id=category AND code='DEMO_SAMPLE_PREPARATION' AND status='active')
 OR NOT EXISTS(SELECT 1 FROM master.commodity_category WHERE tenant_id=t AND id='${id("cirrusatlantic", "direct-unmapped-category")}' AND code='DEMO_SPECIALIST_SERVICES' AND status='active') THEN RAISE EXCEPTION 'CATL category drift'; END IF;
 INSERT INTO master.commodity_code_assignment(id,tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,mapping_type,provenance,status,created_by)
 VALUES('${id("cirrusatlantic", "direct-code-mapping")}',t,category,'unspsc',mapped,'exact','manual','active',a)
 ON CONFLICT(tenant_id,id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.commodity_code_assignment WHERE tenant_id=t AND id='${id("cirrusatlantic", "direct-code-mapping")}' AND commodity_category_id=category AND commodity_code_id=mapped AND commodity_domain_code='unspsc' AND mapping_type='exact' AND status='active') THEN RAISE EXCEPTION 'CATL mapping drift'; END IF;
 IF EXISTS(SELECT 1 FROM master.commodity_code_assignment WHERE tenant_id=t AND is_active AND (commodity_code_id=unmapped OR commodity_category_id='${id("cirrusatlantic", "direct-unmapped-category")}')) THEN RAISE EXCEPTION 'Unmapped demo has acquired a mapping; inspect instead of overwriting'; END IF;
END $demo$;`;
}
