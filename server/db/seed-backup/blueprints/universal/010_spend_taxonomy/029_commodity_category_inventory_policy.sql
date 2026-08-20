-- seed-contract-version: 1
-- seed-pack: neon.blueprint.commodity-inventory-policy
-- seed-pack-version: 2.0.0
-- seed-dataset: control.commodity-category-inventory-policy
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 5 archived blueprint rewrite","publisher":"Athyper","source_version":"wave5-blueprints-v2","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave5-commodity-inventory-policy-v2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- seed-natural-key: control.commodity_category_inventory_policy(tenant_id,commodity_category_id,effective_from)
-- seed-expected-row-count: exact:24
DO $pack$ DECLARE v_tid uuid:=nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid; v_actor uuid:=nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid; BEGIN
 WITH seed_rows(category_code,valuation_method,lot_required,serial_required,reorder_method,warehouse_class) AS (VALUES
 ('SC-IT-HW','weighted_average',false,true,'MANUAL','ELECTRONICS'),
 ('SC-OFFICE-SUP','weighted_average',false,false,'MIN_MAX','GENERAL'),
 ('SC-OFFICE-FURN','weighted_average',false,false,'MANUAL','GENERAL'),
 ('SC-OFFICE-EQUIP','weighted_average',false,false,'MANUAL','ELECTRONICS'),
 ('SC-FLEET-VEH','specific_identification',false,true,'MANUAL','FLEET'),
 ('SC-FLEET-FUEL','weighted_average',false,false,'MIN_MAX','BULK_LIQUID'),
 ('SC-RAW-METAL','weighted_average',false,false,'MIN_MAX','RAW_MATERIAL'),
 ('SC-RAW-CHEM','fifo',true,false,'MIN_MAX','HAZMAT'),
 ('SC-RAW-AGRI','fifo',true,false,'MIN_MAX','PERISHABLE'),
 ('SC-COMP-MECH','weighted_average',false,false,'MIN_MAX','COMPONENTS'),
 ('SC-COMP-ELEC','weighted_average',false,false,'MIN_MAX','ELECTRONICS'),
 ('SC-COMP-STRUCT','weighted_average',false,false,'MIN_MAX','BULK'),
 ('SC-PKG-PRIMARY','weighted_average',false,false,'MIN_MAX','PACKAGING'),
 ('SC-PKG-SECONDARY','weighted_average',false,false,'MIN_MAX','PACKAGING'),
 ('SC-PKG-TRANSIT','weighted_average',false,false,'MIN_MAX','PACKAGING'),
 ('SC-CONSUM-CHEM','fifo',true,false,'MIN_MAX','HAZMAT'),
 ('SC-CONSUM-LAB','fifo',true,false,'MIN_MAX','LAB'),
 ('SC-CONSUM-CLEAN','weighted_average',false,false,'MIN_MAX','GENERAL'),
 ('SC-MRO-SPARE','weighted_average',false,false,'MIN_MAX','MRO'),
 ('SC-MRO-TOOL','weighted_average',false,false,'MANUAL','MRO'),
 ('SC-MRO-SUPPLY','weighted_average',false,false,'MIN_MAX','MRO'),
 ('SC-CAPEQUIP-MACH','specific_identification',false,true,'MANUAL','HEAVY_EQUIPMENT'),
 ('SC-CAPEQUIP-LINE','specific_identification',false,true,'MANUAL','HEAVY_EQUIPMENT'),
 ('SC-CAPEQUIP-TOOL','weighted_average',false,false,'MANUAL','TOOLING')
 ) INSERT INTO control.commodity_category_inventory_policy(id,tenant_id,commodity_category_id,stocking_status,valuation_method,lot_tracking_required,serial_tracking_required,effective_from,metadata,status,created_by)
 SELECT md5('wave5:commodity-inventory:'||v_tid::text||':'||c.code)::uuid,v_tid,c.id,'stocked',s.valuation_method::control.valuation_method_d,s.lot_required,s.serial_required,DATE '2026-01-01',jsonb_build_object('_seed',jsonb_build_object('pack','spend-taxonomy-business-intents','version','2.0.0'),'reorder_method',s.reorder_method,'warehouse_class',s.warehouse_class),'active',v_actor FROM seed_rows s JOIN master.commodity_category c ON c.tenant_id=v_tid AND c.code=s.category_code
 ON CONFLICT(tenant_id,commodity_category_id,company_code_id,effective_from) DO UPDATE SET stocking_status=excluded.stocking_status,valuation_method=excluded.valuation_method,lot_tracking_required=excluded.lot_tracking_required,serial_tracking_required=excluded.serial_tracking_required,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_actor WHERE (control.commodity_category_inventory_policy.stocking_status,control.commodity_category_inventory_policy.valuation_method,control.commodity_category_inventory_policy.lot_tracking_required,control.commodity_category_inventory_policy.serial_tracking_required,control.commodity_category_inventory_policy.metadata,control.commodity_category_inventory_policy.status) IS DISTINCT FROM (excluded.stocking_status,excluded.valuation_method,excluded.lot_tracking_required,excluded.serial_tracking_required,excluded.metadata,'active'::control.commodity_policy_status_d);
 IF (SELECT count(*) FROM control.commodity_category_inventory_policy WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='spend-taxonomy-business-intents')<>24 THEN RAISE EXCEPTION 'commodity inventory policy count mismatch'; END IF; END $pack$;
