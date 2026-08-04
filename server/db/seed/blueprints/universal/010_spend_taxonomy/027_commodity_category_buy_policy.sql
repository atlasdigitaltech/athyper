-- seed-contract-version: 1
-- seed-pack: neon.blueprint.commodity-buy-policy
-- seed-pack-version: 2.0.0
-- seed-dataset: control.commodity-category-buy-policy
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 5 archived blueprint rewrite","publisher":"Athyper","source_version":"wave5-blueprints-v2","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave5-commodity-buy-policy-v2
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
-- seed-natural-key: control.commodity_category_buy_policy(tenant_id,commodity_category_id,business_intent_id,effective_from)
-- seed-expected-row-count: exact:95
DO $pack$ DECLARE v_tid uuid:=nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid; v_actor uuid:=nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid; BEGIN
 WITH seed_rows(category_code,intent_code) AS (VALUES
 ('SC-IT-HW','BI-OPEX'),
 ('SC-IT-SW','BI-OPEX'),
 ('SC-IT-CLOUD','BI-OPEX'),
 ('SC-IT-SVC','BI-OPEX'),
 ('SC-IT-SEC','BI-OPEX'),
 ('SC-TELCO-VOICE','BI-OPEX'),
 ('SC-TELCO-DATA','BI-OPEX'),
 ('SC-TELCO-MOB','BI-OPEX'),
 ('SC-OFFICE-SUP','BI-OPEX'),
 ('SC-OFFICE-FURN','BI-OPEX'),
 ('SC-OFFICE-EQUIP','BI-OPEX'),
 ('SC-OFFICE-PRINT','BI-OPEX'),
 ('SC-HR-RECRUIT','BI-OPEX'),
 ('SC-HR-TRAIN','BI-OPEX'),
 ('SC-HR-BEN','BI-OPEX'),
 ('SC-HR-PAYROLL','BI-OPEX'),
 ('SC-TRAVEL-AIR','BI-OPEX'),
 ('SC-TRAVEL-HOTEL','BI-OPEX'),
 ('SC-TRAVEL-GROUND','BI-OPEX'),
 ('SC-TRAVEL-EVENTS','BI-OPEX'),
 ('SC-PROF-LEGAL','BI-OPEX'),
 ('SC-PROF-AUDIT','BI-OPEX'),
 ('SC-PROF-CONSULT','BI-OPEX'),
 ('SC-PROF-ENG','BI-OPEX'),
 ('SC-MKTG-DIGITAL','BI-OPEX'),
 ('SC-MKTG-TRAD','BI-OPEX'),
 ('SC-MKTG-PR','BI-OPEX'),
 ('SC-MKTG-CX','BI-OPEX'),
 ('SC-FAC-RENT','BI-OPEX'),
 ('SC-FAC-MAINT','BI-OPEX'),
 ('SC-FAC-CLEAN','BI-OPEX'),
 ('SC-FAC-SECUR','BI-OPEX'),
 ('SC-UTIL-ELEC','BI-OPEX'),
 ('SC-UTIL-WATER','BI-OPEX'),
 ('SC-UTIL-GAS','BI-OPEX'),
 ('SC-UTIL-WASTE','BI-OPEX'),
 ('SC-FLEET-VEH','BI-CAPEX'),
 ('SC-FLEET-FUEL','BI-OPEX'),
 ('SC-FLEET-MAINT','BI-OPEX'),
 ('SC-INS-PROP','BI-OPEX'),
 ('SC-INS-LIAB','BI-OPEX'),
 ('SC-INS-EMP','BI-OPEX'),
 ('SC-BANK-FEE','BI-ADMIN'),
 ('SC-BANK-FX','BI-ADMIN'),
 ('SC-BANK-TREAS','BI-ADMIN'),
 ('SC-TAX-CORP','BI-REG'),
 ('SC-TAX-DUTY','BI-REG'),
 ('SC-TAX-STAT','BI-REG'),
 ('SC-SAFETY-SEC','BI-OPEX'),
 ('SC-SAFETY-HSE','BI-REG'),
 ('SC-SAFETY-COMP','BI-REG'),
 ('SC-ENV-WASTE','BI-REG'),
 ('SC-ENV-CARBON','BI-REG'),
 ('SC-ENV-REMEDN','BI-REG'),
 ('SC-OUTSRC-BPO','BI-OPEX'),
 ('SC-OUTSRC-SHARED','BI-OPEX'),
 ('SC-OUTSRC-TEMP','BI-OPEX'),
 ('SC-SUBS-LIC','BI-OPEX'),
 ('SC-SUBS-MEMB','BI-OPEX'),
 ('SC-SUBS-PUB','BI-OPEX'),
 ('SC-RAW-METAL','BI-COGS'),
 ('SC-RAW-CHEM','BI-COGS'),
 ('SC-RAW-AGRI','BI-COGS'),
 ('SC-COMP-MECH','BI-COGS'),
 ('SC-COMP-ELEC','BI-COGS'),
 ('SC-COMP-STRUCT','BI-COGS'),
 ('SC-PKG-PRIMARY','BI-COGS'),
 ('SC-PKG-SECONDARY','BI-COGS'),
 ('SC-PKG-TRANSIT','BI-COGS'),
 ('SC-CONSUM-CHEM','BI-OPEX'),
 ('SC-CONSUM-LAB','BI-OPEX'),
 ('SC-CONSUM-CLEAN','BI-OPEX'),
 ('SC-MRO-SPARE','BI-OPEX'),
 ('SC-MRO-TOOL','BI-OPEX'),
 ('SC-MRO-SUPPLY','BI-OPEX'),
 ('SC-PRODSVC-CALIB','BI-OPEX'),
 ('SC-PRODSVC-PLANT','BI-OPEX'),
 ('SC-CONTRACT-MFG','BI-COGS'),
 ('SC-CONTRACT-ASM','BI-COGS'),
 ('SC-FREIGHT-ROAD','BI-OPEX'),
 ('SC-FREIGHT-SEA','BI-OPEX'),
 ('SC-FREIGHT-AIR','BI-OPEX'),
 ('SC-FREIGHT-CUST','BI-REG'),
 ('SC-WHSE-STORE','BI-OPEX'),
 ('SC-WHSE-COLD','BI-OPEX'),
 ('SC-QC-TEST','BI-OPEX'),
 ('SC-QC-CERT','BI-OPEX'),
 ('SC-QC-INSPECT','BI-OPEX'),
 ('SC-CAPEQUIP-MACH','BI-CAPEX'),
 ('SC-CAPEQUIP-LINE','BI-CAPEX'),
 ('SC-CAPEQUIP-TOOL','BI-OPEX'),
 ('SC-TEMPWK-SCAF','BI-OPEX'),
 ('SC-TEMPWK-SITE','BI-OPEX'),
 ('SC-PROCNRG-STEAM','BI-OPEX'),
 ('SC-PROCNRG-COMP','BI-OPEX')
 ) INSERT INTO control.commodity_category_buy_policy(id,tenant_id,commodity_category_id,business_intent_id,is_default,is_selectable,effective_from,metadata,status,created_by)
 SELECT md5('wave5:commodity-buy:'||v_tid::text||':'||c.code||':'||i.code)::uuid,v_tid,c.id,i.id,true,true,DATE '2026-01-01','{"_seed":{"pack":"spend-taxonomy-business-intents","version":"2.0.0"}}','active',v_actor FROM seed_rows s JOIN master.commodity_category c ON c.tenant_id=v_tid AND c.code=s.category_code JOIN master.business_intent i ON i.tenant_id=v_tid AND i.code=s.intent_code
 ON CONFLICT(tenant_id,commodity_category_id,company_code_id,company_code_supplier_profile_id,business_intent_id,effective_from) DO UPDATE SET is_default=excluded.is_default,is_selectable=excluded.is_selectable,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=v_actor WHERE (control.commodity_category_buy_policy.is_default,control.commodity_category_buy_policy.is_selectable,control.commodity_category_buy_policy.metadata,control.commodity_category_buy_policy.status) IS DISTINCT FROM (excluded.is_default,excluded.is_selectable,excluded.metadata,'active'::control.commodity_policy_status_d);
 IF (SELECT count(*) FROM control.commodity_category_buy_policy WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='spend-taxonomy-business-intents')<>95 THEN RAISE EXCEPTION 'commodity buy policy count mismatch'; END IF; END $pack$;
