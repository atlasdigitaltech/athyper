/** Additive, CATL-only enrichment of the existing synthetic 360 fixtures. */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {id,pack} from './seed-identity.mjs';
const ref=key=>`'${id('cirrusatlantic',key)}'::uuid`;
export function enrichmentSql(){
 const owned=[['tax_type','360-tax-type'],['certification_type','360-certificate-type'],['business_partner_relationship','360-relationship'],['business_partner_governance_relation','360-governance'],...['','person-'].flatMap(p=>[['contact_person_role',p+'360-general-role'],['contact_link',p+'360-general-email'],['contact_link',p+'360-branch-email'],['address_link',p+'360-provisional-address']])];
 const guards=owned.map(([table,key])=>`IF EXISTS(SELECT 1 FROM master.${table} WHERE id=${ref(key)} AND (tenant_id IS DISTINCT FROM t OR metadata->>'_seed' IS DISTINCT FROM 'demo.catl.360.v1')) THEN RAISE EXCEPTION 'Demo identity collision: ${table}'; END IF;`).join('\n');
 const perPartner=['','person-'].map(prefix=>{
 const r=key=>ref(prefix+key);
 return `
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=t AND id=${r('partner')} AND metadata->>'_seed'='${pack}') THEN RAISE EXCEPTION 'Expected CATL demo partner missing'; END IF;
 IF EXISTS(SELECT 1 FROM master.business_partner_commodity_classification WHERE id=${r('360-direct-commodity')} AND (tenant_id IS DISTINCT FROM t OR business_partner_id IS DISTINCT FROM ${r('partner')} OR source_reference IS DISTINCT FROM 'demo.catl.360.v1')) THEN RAISE EXCEPTION 'Demo commodity collision'; END IF;
 UPDATE master.business_partner_alias SET language_code=coalesce(language_code,'en'),country_code=coalesce(country_code,'GB'),source_system=coalesce(source_system,'demo_seed'),updated_at=now(),updated_by=a WHERE tenant_id=t AND business_partner_id=${r('partner')} AND metadata->>'_seed'='${pack}' AND (language_code IS NULL OR country_code IS NULL OR source_system IS NULL);
 UPDATE master.business_partner_identifier SET effective_until=coalesce(effective_until,'2032-04-16'),updated_at=now(),updated_by=a WHERE tenant_id=t AND business_partner_id=${r('partner')} AND metadata->>'_seed'='${pack}' AND effective_until IS NULL;
 UPDATE master.business_partner_tax_registration SET tax_type_id=coalesce(tax_type_id,${ref('360-tax-type')}),effective_until=coalesce(effective_until,'2030-12-31'),updated_at=now(),updated_by=a WHERE tenant_id=t AND business_partner_id=${r('partner')} AND metadata->>'_seed'='${pack}' AND (tax_type_id IS NULL OR effective_until IS NULL);
 INSERT INTO master.business_partner_commodity_classification(id,tenant_id,business_partner_id,commodity_code_id,assignment_kind,effective_from,source_system,source_reference,notes,status,created_by)
 SELECT ${r('360-direct-commodity')},t,${r('partner')},id,'declared','2025-01-01','demo_seed','demo.catl.360.v1','Synthetic laboratory commodity declaration; no supplier approval implied.','active',a FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41101502' AND is_active
 ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO master.contact_person_role(id,tenant_id,contact_person_id,role_code,effective_from,is_primary,metadata,created_by)
 VALUES(${r('360-general-role')},t,${r('contact')},'general','2025-01-01',false,m,a) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,purpose,is_primary,is_verified,effective_from,metadata,status,created_by)
 VALUES(${r('360-general-email')},t,bp_owner,${r('partner')},'email','${prefix?'maya':'aster'}.enquiries@example.invalid','default',true,false,'2025-01-01',m,'active',a),
 (${r('360-branch-email')},t,address_owner,${r('address-link-lab')},'email','${prefix?'maya':'aster'}.laboratory@example.invalid','business',true,false,'2025-01-01',m,'active',a)
 ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO master.contact_email(tenant_id,contact_link_id) VALUES(t,${r('360-general-email')}),(t,${r('360-branch-email')}) ON CONFLICT DO NOTHING;
 UPDATE master.address_link SET attention_line=coalesce(attention_line,'Alex Example — Research coordination'),updated_at=now(),updated_by=a WHERE tenant_id=t AND owner_id=${r('partner')} AND metadata->>'_seed'='${pack}' AND attention_line IS NULL;
 UPDATE master.certification SET certification_type_id=${ref('360-certificate-type')},custom_name=NULL,updated_at=now(),updated_by=a WHERE tenant_id=t AND id=${r('certificate')} AND metadata->>'_seed'='${pack}' AND certification_type_id IS NULL;
 UPDATE master.bank_provisional_reference SET submitted_branch_name=coalesce(submitted_branch_name,'Example Research Branch (synthetic)') WHERE tenant_id=t AND id=${r('provisional')} AND submitted_name LIKE '%Demo Bank%' AND submitted_branch_name IS NULL;
 INSERT INTO master.address_link(id,tenant_id,owner_type_id,owner_id,address_id,purpose,attention_line,is_primary,effective_from,metadata,created_by)
 VALUES(${r('360-provisional-address')},t,provisional_owner,${r('provisional')},${ref('address-lab')},'default','Synthetic submitted bank address — unverified',true,'2025-01-01',m,a) ON CONFLICT(tenant_id,id) DO NOTHING;
 `;}).join('\n');
 return `BEGIN;
 SET LOCAL lock_timeout='3s';
 DO $demo$
 DECLARE t uuid; a uuid; bp_owner uuid; address_owner uuid; provisional_owner uuid; business_type uuid;
 m jsonb:='{"_seed":"demo.catl.360.v1","synthetic":true}';
 BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON DEV only'; END IF;
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND id='44444444-4444-4444-8444-444444444444';
 SELECT id INTO STRICT a FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.database_plane','neon',true);
 PERFORM pg_advisory_xact_lock(hashtextextended('demo.catl.360.v1',0));
 ${guards}
 IF NOT EXISTS(SELECT 1 FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41101502' AND is_active) THEN RAISE EXCEPTION 'Required UNSPSC reference missing'; END IF;
 SELECT id INTO STRICT bp_owner FROM control.owner_type WHERE code='business_partner' AND tenant_id IS NULL;
 SELECT id INTO STRICT address_owner FROM control.owner_type WHERE code='address_link' AND tenant_id IS NULL;
 SELECT id INTO STRICT provisional_owner FROM control.owner_type WHERE code='bank_provisional_reference' AND tenant_id IS NULL;
 SELECT id INTO STRICT business_type FROM control.lookup_value WHERE domain_code='master.business_type' AND code='professional_services' AND tenant_id IS NULL AND status='active';
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=t AND id=${ref('partner')} AND metadata->>'_seed'='${pack}') THEN RAISE EXCEPTION 'Expected organization demo missing'; END IF;
 PERFORM master.update_business_partner_organization_identity(t,${ref('partner')},jsonb_build_object('businessTypeValueId',coalesce(o.business_type_value_id,business_type),'foundedYear',coalesce(o.founded_year,2012),'employeeCount',coalesce(o.employee_count,48),'employeeCountAsOf',coalesce(o.employee_count_as_of,'2026-01-01'::date),'employeeCountScope',coalesce(o.employee_count_scope,'organization')),a) FROM master.business_partner_organization_identity o WHERE o.tenant_id=t AND o.business_partner_id=${ref('partner')};
 INSERT INTO master.tax_type(id,tenant_id,code,name,description,tax_class,status,metadata,created_by)
 VALUES(${ref('360-tax-type')},t,'DEMO_RESEARCH_TAX','Research tax (Demo)','Synthetic registration reference; not for tax calculation or filing.','other','active',m,a) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO master.certification_type(id,tenant_id,code,name,issuing_body,category,description,is_custom,metadata,status,created_by)
 VALUES(${ref('360-certificate-type')},t,'demo_research_quality','Research quality certificate (Demo)','Synthetic demonstration issuer','quality','Synthetic demonstration only; no accreditation claimed.',true,m,'active',a) ON CONFLICT(id) DO NOTHING;
 ${perPartner}
 UPDATE master.person SET preferred_name=coalesce(preferred_name,'Maya'),display_name=coalesce(display_name,'Maya Example (Demo)'),country_code=coalesce(country_code,'GB'),updated_at=now(),updated_by=a WHERE tenant_id=t AND id=${ref('person-identity')} AND metadata->>'_seed'='${pack}' AND (preferred_name IS NULL OR display_name IS NULL OR country_code IS NULL);
 INSERT INTO master.business_partner_relationship(id,tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,country_code,effective_from,notes,metadata,status,created_by)
 VALUES(${ref('360-relationship')},t,${ref('partner')},${ref('person-partner')},'agent','GB','2025-01-01','Synthetic research representation only; not payment authority.',m,'active',a) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO master.business_partner_governance_relation(id,tenant_id,business_partner_id,relation_type_code,member_name,member_type,member_business_partner_id,member_country_code,business_title,appointed_date,notes,metadata,status,created_by)
 VALUES(${ref('360-governance')},t,${ref('partner')},'director','Maya Example (Demo)','individual',${ref('person-partner')},'GB','Research Director (Demo)','2025-01-01','Synthetic governance demonstration; no verified ownership claim.',m,'active',a) ON CONFLICT(tenant_id,id) DO NOTHING;
 END $demo$;
 COMMIT;`;
}
export function apply(){
 const info=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
 if(info.Config.Labels['com.docker.compose.project']!=='athyper-dev')throw Error('Existing DEV required');
 execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:enrichmentSql(),stdio:['pipe','inherit','inherit']});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--apply'))apply();else console.log(enrichmentSql());
}
