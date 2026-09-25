/** Explicit local fixture pack, never part of production reference seeds. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tenants,pack,id} from './seed-identity.mjs';
import {classificationSeedSql} from './classification-seed.mjs';
export {tenants,pack,id};
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
export function rowsFor(tenant){
 const ref=key=>id(tenant,key),meta={_seed:pack},bp=ref('partner');
 const rows=[];
 const add=(table,key,data,extras={})=>rows.push({table,key,data:{id:ref(key),...data},extras:{tenant_id:'t',...extras}});
 const owned=(table,key,data)=>add(table,key,{metadata:meta,...data},{created_by:'a'});
 owned('business_partner','partner',{code:'BP-DEMO-CORE-001',name:'Aster Research Services (Demo)',website_url:'https://aster.example',description:'Synthetic reusable partner-level demonstration. No customer/supplier role, company assignment or payment authorization.',status:'active' });
 rows[0].extras.category_locked_by='a';
 for(const [key,kind,name] of [['alias-trading','trading','Aster Research'],['alias-search','search','Aster Demo']])owned('business_partner_alias',key,{business_partner_id:bp,alias_kind:kind,alias_name:name,effective_from:'2025-01-01',status:'active'});
 owned('address','address',{address_type:'registered',address_kind:'street',line1:'10 Example Research Way',city:'London',region:'Greater London',postal_code:'SW1A 1AA',country_code:'GB',normalized_hash:createHash('sha256').update(`${pack}:${tenant}:address`).digest('hex'),formatted_address:'10 Example Research Way, London SW1A 1AA, United Kingdom (synthetic)',status:'active'});
 owned('address_link','address-link',{owner_id:bp,address_id:ref('address'),purpose:'default',is_primary:true,effective_from:'2025-01-01'});rows.at(-1).extras.owner_type_id='bp_owner';
 owned('address','address-lab',{address_type:'registered',address_kind:'street',line1:'20 Example Innovation Way',city:'Cambridge',region:'Cambridgeshire',postal_code:'CB2 1TN',country_code:'GB',normalized_hash:createHash('sha256').update(`${pack}:${tenant}:address-lab`).digest('hex'),formatted_address:'20 Example Innovation Way, Cambridge CB2 1TN, United Kingdom (synthetic)',status:'active'});
 owned('address_link','address-link-lab',{owner_id:bp,address_id:ref('address-lab'),purpose:'default',is_primary:false,effective_from:'2025-01-01'});rows.at(-1).extras.owner_type_id='bp_owner';
 owned('contact_person','contact',{owner_id:bp,contact_name:'Alex Example',business_title:'Research Coordinator',department_name:'General Enquiries',is_primary:true,status:'active'});rows.at(-1).extras.owner_type_id='bp_owner';
 for(const [key,address] of [['billing-headquarters','address-link'],['billing-lab','address-link-lab']])owned('contact_person_role',key,{contact_person_id:ref('contact'),address_link_id:ref(address),role_code:'billing',effective_from:'2025-01-01',is_primary:false});
 for(const [key,channel,value] of [['email','email',`enquiries.${tenant}@aster.example`],['phone','phone','+442079460123'],['website','website','https://aster.example/contact'],['sms','sms','+447700900123'],['fax','fax','+442079460124']]){
  owned('contact_link',key,{owner_id:ref('contact'),channel_type:channel,value,purpose:'business',is_primary:true,is_verified:false,status:'active'});rows.at(-1).extras.owner_type_id='contact_owner';
 }
 for(const [key,table,data] of [['email-detail','contact_email',{}],['phone-detail','contact_phone',{line_type:'landline'}]]){
  rows.push({table,key,data:{contact_link_id:ref(key==='email-detail'?'email':'phone'),metadata:meta,...data},extras:{tenant_id:'t',created_by:'a'}});
 }
 owned('business_partner_identifier','identifier',{business_partner_id:bp,scheme_code:'business_registration',identifier_value:`DEMO-${tenant.toUpperCase()}-REG-1001`,issuing_authority:'Synthetic demonstration registry',issuing_country_code:'GB',issued_at:'2012-04-16',is_primary:true,status:'active',metadata:{...meta,maskedValue:'••••1001',protected:false}});
 owned('tax_jurisdiction','jurisdiction',{code:'DEMO_CORE_GB',name:'UK demonstration jurisdiction (not for tax filing)',jurisdiction_type:'country',country_code:'GB',authority_name:'Synthetic tax authority',status:'active'});
 owned('business_partner_tax_registration','tax',{business_partner_id:bp,jurisdiction_id:ref('jurisdiction'),registration_type_code:'taxpayer_id',registration_number:`DEMO-${tenant.toUpperCase()}-TAX-2001`,effective_from:'2025-01-01',is_primary:true,status:'active',metadata:{...meta,maskedValue:'••••2001',protected:false}});
 add('bank_provisional_reference','provisional',{submitted_name:'Aster Demo Bank — not for payment',submitted_country:'GB',status:'unresolved'});
 owned('payment_instrument','bank',{instrument_type_code:'bank_account',status:'inactive'});
 owned('bank_account','bank',{account_holder_name:'Aster Research Services (Demo)',account_id_type:'local',account_id_value:`DEMO${tenant.toUpperCase()}00003001`,account_last4:'3001',currency_code:'GBP',provisional_bank_reference_id:ref('provisional')});
 owned('payment_instrument_link','bank-link',{owner_type:'business_partner',owner_id:bp,relationship_role:'beneficiary',payment_instrument_id:ref('bank'),company_code_id:null,purpose:'default',is_primary:true,effective_from:'2025-01-01'});rows.at(-1).extras.owner_type_id='bp_owner';
 owned('business_partner_industry_classification','industry',{business_partner_id:bp,industry_domain_code:'isic',assignment_kind:'declared',is_primary:true,effective_from:'2025-01-01',source_system:'demo_seed',source_reference:pack,status:'active'});rows.at(-1).extras.industry_code_id='industry';
 owned('business_partner_industry_classification','industry-parent',{business_partner_id:bp,industry_domain_code:'isic',assignment_kind:'declared',is_primary:false,effective_from:'2025-01-01',source_system:'demo_seed',source_reference:pack,status:'active'});rows.at(-1).extras.industry_code_id='industry_parent';
 for(const [key,name,start,end] of [['certificate','Demonstration quality-management certificate','2025-01-01','2099-01-01'],['certificate-expired','Expired demonstration certificate','2020-01-01','2021-01-01']])owned('certification',key,{owner_type:'business_partner',owner_id:bp,custom_name:name,certificate_number:`DEMO-${key.toUpperCase()}-001`,certified_by:'Synthetic demonstration issuer',certified_location:'London',additional_info:'Sample record only; no accreditation or uploaded evidence is claimed.',effective_from:start,effective_until:end,status:'active',company_code_id:null,site_id:null,document_attachment_id:null});
 return rows;
}
/** Same shared collections, distinct tenant-local identities; no copied organization subtype. */
export function personRowsFor(tenant){
 const rows=rowsFor(tenant);
 const replacements=new Map(rows.filter(row=>!['address','tax_jurisdiction'].includes(row.table)).map(row=>[id(tenant,row.key),id(tenant,`person-${row.key}`)]));
 const rewrite=value=>typeof value==='string'?(replacements.get(value)??value.replaceAll('Aster Research Services (Demo)','Maya Example (Demo)').replaceAll('Aster Research','Maya Consulting').replaceAll('Aster Demo','Maya Demo')):
  Array.isArray(value)?value.map(rewrite):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)])):value;
 const result=rows.map(rewrite);
 const partner=result[0];
 partner.data.code='BP-DEMO-PERSON-001';partner.data.partner_category='person';
 partner.data.person_id=id(tenant,'person-identity');partner.data.legal_classification='sole_proprietor';
 result.find(row=>row.table==='business_partner_identifier').data.identifier_value=`DEMO-${tenant.toUpperCase()}-PERSON-1001`;
 result.find(row=>row.table==='business_partner_tax_registration').data.registration_number=`DEMO-${tenant.toUpperCase()}-PERSON-2001`;
 result.find(row=>row.table==='bank_account').data.account_id_value=`DEMOPERSON${tenant.toUpperCase()}00003001`;
 return [
  {table:'person',key:'person-identity',data:{id:id(tenant,'person-identity'),code:'PERSON-DEMO-001',name:'Maya Example (Demo)',first_name:'Maya',last_name:'Example',metadata:{_seed:pack}},extras:{tenant_id:'t',created_by:'a'}},
  {table:'person',key:'registration-person',data:{id:id(tenant,'registration-person'),code:'PERSON-DEMO-REG-001',name:'Rowan Example (Registration Demo)',first_name:'Rowan',last_name:'Example',metadata:{_seed:pack}},extras:{tenant_id:'t',created_by:'a'}},
  ...result];
}
export function buildSql(apply=false,{includeClassifications=false}={}){
 const blocks=tenants.flatMap(([tenant,actor])=>['organization','person'].map(category=>{
 const person=category==='person',partnerId=id(tenant,person?'person-partner':'partner');
 const rows=person?personRowsFor(tenant):rowsFor(tenant);
 const inserts=rows.map(row=>`PERFORM pg_temp.ensure_fixture('master.${row.table}'::regclass,${literal(JSON.stringify(row.data))}::jsonb||jsonb_build_object(${Object.entries(row.extras).map(([key,value])=>`${literal(key)},${value}`).join(',')}),${literal(row.data.id?'id':'contact_link_id')});`).join('\n');
 return `DO $seed$
DECLARE t uuid; a uuid; bp_owner uuid; contact_owner uuid; industry uuid; industry_parent uuid; pass integer;
BEGIN
 SELECT tenant.id,principal.id INTO STRICT t,a FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id WHERE tenant.code=${literal(tenant)} AND principal.code=${literal(actor)} AND tenant.status='active' AND principal.status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.current_actor_type','user',true);
 SELECT id INTO STRICT bp_owner FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner';
 SELECT id INTO STRICT contact_owner FROM control.owner_type WHERE tenant_id IS NULL AND code='contact_person';
 SELECT id INTO STRICT industry FROM shared.industry_code WHERE domain_code='isic' AND code='7210' AND status='active';
 SELECT id INTO STRICT industry_parent FROM shared.industry_code WHERE domain_code='isic' AND code='72' AND status='active';
 -- Populate only an uninitialized fixture-owned subtype; reject drift on repeat.
 FOR pass IN 1..2 LOOP
 ${inserts}
 ${person?'':`IF EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE tenant_id=t AND id=${literal(partnerId)}::uuid
   AND (legal_form IS NOT NULL OR registration_country_code IS NOT NULL OR incorporation_date IS NOT NULL)
   AND NOT (legal_form IS NOT DISTINCT FROM 'private_limited' AND registration_country_code IS NOT DISTINCT FROM 'GB' AND incorporation_date IS NOT DISTINCT FROM '2012-04-16'::date))
 THEN RAISE EXCEPTION 'Fixture organization identity drift; refusing overwrite'; END IF;
 PERFORM master.update_business_partner_organization_identity(t,${literal(partnerId)}::uuid,'{"legalForm":"private_limited","registrationCountryCode":"GB","incorporationDate":"2012-04-16"}'::jsonb,a);`}
 END LOOP;
 IF EXISTS(SELECT 1 FROM master.supplier WHERE tenant_id=t AND business_partner_id=${literal(id(tenant,'partner'))}::uuid)
 OR EXISTS(SELECT 1 FROM master.customer WHERE tenant_id=t AND business_partner_id=${literal(id(tenant,'partner'))}::uuid)
 OR EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment WHERE tenant_id=t AND business_partner_id=${literal(id(tenant,'partner'))}::uuid)
 OR EXISTS(SELECT 1 FROM control.business_partner_qualification WHERE tenant_id=t AND business_partner_id=${literal(id(tenant,'partner'))}::uuid
   AND NOT (metadata->>'_seed' IS NOT DISTINCT FROM 'demo.business-partner-decision-views.v1' AND decision='pending'))
 THEN RAISE EXCEPTION 'Fixture has acquired an out-of-scope role/assignment; refusing seed'; END IF;
 RAISE NOTICE 'Validated %: ${person?'BP-DEMO-PERSON-001':'BP-DEMO-CORE-001'}, ${rows.length} rows',${literal(tenant)};
END $seed$;`;
 })).join('\n');
 return `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s';
SELECT set_config('app.database_plane','neon',true);
SELECT pg_advisory_xact_lock(hashtextextended('${pack}',0));
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon database required'; END IF; END $$;
CREATE FUNCTION pg_temp.ensure_fixture(target regclass,payload jsonb,key_column text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE columns text; projection text; existing jsonb;
BEGIN
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key) INTO columns,projection FROM jsonb_object_keys(payload) key;
 EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE %I=$1::uuid',target,key_column) INTO existing USING payload->>key_column;
 IF existing IS NULL THEN
  EXECUTE format('INSERT INTO %s(%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r',target,columns,projection,target) USING payload;
  EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE %I=$1::uuid',target,key_column) INTO existing USING payload->>key_column;
 END IF;
 IF NOT existing @> payload THEN RAISE EXCEPTION 'Fixture collision or drift in %; no existing records are overwritten',target; END IF;
END $fn$;
${blocks}
${includeClassifications?classificationSeedSql()+'\n'+classificationSeedSql():''}
${apply?'COMMIT':'ROLLBACK'};`;
}
export function main(args){
 const apply=args.includes('--apply');
 const allowed=['--apply','--dry-run','--confirm=LOCAL-BP-CORE-SEED','--disposable'];
 if(args.some(a=>!allowed.includes(a))||(apply&&args.includes('--dry-run'))||(apply&&!args.includes('--confirm=LOCAL-BP-CORE-SEED')))throw Error('Use --dry-run [--disposable], or --apply --confirm=LOCAL-BP-CORE-SEED');
 const container=args.includes('--disposable')?'athyper-bp2-acceptance-20260923':'athyper-dev-db-1';
 if(args.includes('--disposable')){
  const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
  if(info.Config.Labels?.['athyper.environment']!=='disposable_local'||info.Config.Labels?.['athyper.purpose']!=='bp2-acceptance')throw Error('Disposable label mismatch');
  if(apply)throw Error('Disposable acceptance must roll back');
 }
 const includeClassifications=execFileSync('docker',['exec',container,'psql','-X','-U','postgres','-d','athyper_neon','-Atc',"SELECT to_regclass('master.business_partner_commodity_classification') IS NOT NULL"],{encoding:'utf8'}).trim()==='t';
 execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:buildSql(apply,{includeClassifications}),stdio:['pipe','pipe','pipe']});
 console.log(JSON.stringify({pack,applied:apply,twicePerTenant:true,includeClassifications,tenants:tenants.map(([tenant])=>({tenant,partners:[{code:'BP-DEMO-CORE-001',id:id(tenant,'partner'),rows:rowsFor(tenant).length+(includeClassifications?3:0)},{code:'BP-DEMO-PERSON-001',id:id(tenant,'person-partner'),rows:personRowsFor(tenant).length}]}))},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main(process.argv.slice(2));}catch(error){console.error(error.stderr?.toString()||error.message);process.exitCode=1;}}
