/** Additive companion to the core fixture; existing shared reference catalogs remain unchanged. */
import { tenants, id, pack } from "./seed-identity.mjs";
export function classificationSeedSql() {
  return tenants
    .map(
      ([tenant, actor]) => `
DO $classification_demo$
DECLARE t uuid; a uuid; code_id uuid; category_id uuid:='${id(tenant, "commodity-category")}'; fact_id uuid:='${id(tenant, "commodity-classification")}';
BEGIN
 SELECT tenant.id,principal.id INTO STRICT t,a FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id
  WHERE tenant.code='${tenant}' AND principal.code='${actor}' AND tenant.status='active' AND principal.status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.current_actor_type','user',true);
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=t AND id='${id(tenant, "partner")}' AND code='BP-DEMO-CORE-001' AND status='active')
 THEN RAISE EXCEPTION 'Install core demo first'; END IF;
 SELECT id INTO STRICT code_id FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41100000' AND is_active;
 INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by)
 VALUES(category_id,t,'DEMO_LAB_RESEARCH','Laboratory and scientific equipment (Demo)','active',a) ON CONFLICT(tenant_id,id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.commodity_category WHERE tenant_id=t AND id=category_id AND code='DEMO_LAB_RESEARCH' AND name='Laboratory and scientific equipment (Demo)' AND status='active')
 THEN RAISE EXCEPTION 'Demo category drift'; END IF;
 INSERT INTO master.commodity_code_assignment(id,tenant_id,commodity_category_id,commodity_domain_code,commodity_code_id,mapping_type,provenance,description,status,created_by)
 VALUES('${id(tenant, "commodity-code-assignment")}',t,category_id,'unspsc',code_id,'exact','manual','Synthetic demo category assignment; shared crosswalks are reference evidence, not commercial approval.','active',a)
 ON CONFLICT(tenant_id,id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.commodity_code_assignment WHERE tenant_id=t AND id='${id(tenant, "commodity-code-assignment")}' AND commodity_category_id=category_id AND commodity_domain_code='unspsc' AND commodity_code_id=code_id AND mapping_type='exact' AND provenance='manual' AND status='active')
 THEN RAISE EXCEPTION 'Demo code assignment drift'; END IF;
 INSERT INTO master.business_partner_commodity_classification(id,tenant_id,business_partner_id,commodity_category_id,effective_from,source_system,source_reference,notes,status,created_by)
 VALUES(fact_id,t,'${id(tenant, "partner")}',category_id,'2025-01-01','demo_seed','${pack}:commodity','Synthetic declaration only; no qualification, verification or company usage is implied.','active',a)
 ON CONFLICT(tenant_id,id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM master.business_partner_commodity_classification WHERE tenant_id=t AND id=fact_id AND business_partner_id='${id(tenant, "partner")}' AND commodity_category_id=category_id AND source_system='demo_seed' AND source_reference='${pack}:commodity' AND status='active' AND assignment_kind='declared' AND effective_from='2025-01-01' AND effective_until IS NULL)
 THEN RAISE EXCEPTION 'Demo classification drift'; END IF;
 IF EXISTS(SELECT 1 FROM master.supplier WHERE tenant_id=t AND business_partner_id='${id(tenant, "partner")}')
 OR EXISTS(SELECT 1 FROM master.customer WHERE tenant_id=t AND business_partner_id='${id(tenant, "partner")}')
 OR EXISTS(SELECT 1 FROM control.business_partner_qualification WHERE tenant_id=t AND business_partner_id='${id(tenant, "partner")}')
 THEN RAISE EXCEPTION 'Demo has acquired commercial roles or approvals'; END IF;
END $classification_demo$;`,
    )
    .join("\n");
}
