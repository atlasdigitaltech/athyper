/** Additive tenant-scoped presentation fixtures; never approves a qualification. */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {id} from './seed-identity.mjs';
export const pack='demo.business-partner-decision-views.v1';
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
export function decisionViewSeedSql(apply=false, tenant='cirrusatlantic') {
 const actor = {cirrusatlantic:'catl.admin',athyper:'athyper.admin'}[tenant];
 if (!actor) throw Error('Unsupported demo tenant');
 const blocks=['partner','person-partner'].map(partner=>{
  const bp=id(tenant,partner);
  const rows=['current','scheduled','ended'].flatMap(window=>['qualification','restriction'].map(kind=>{
   const key=`${partner}:${kind}:${window}`,ref=id(tenant,`${pack}:${key}`);
   const start=window==='scheduled'?'2090-01-01':window==='ended'?'2020-01-01':'2025-01-01';
   const end=window==='ended'?'2021-01-01':'2099-01-01';
   const payload={id:ref,business_partner_id:bp,effective_from:kind==='restriction'?start+'T00:00:00Z':start,effective_until:kind==='restriction'?end+'T00:00:00Z':end,metadata:{_seed:pack},...(kind==='qualification'?{qualification_type_code:'basic',idempotency_key:`${pack}:${key}`,decision:'pending',conditions:[{presentation:{schema:'partner-condition-summary.v1',summary:'Synthetic example: review laboratory handling requirements before use. Satisfaction has not been evaluated.'},private_note:'MUST_NOT_LEAVE_READER'}],next_review_at:'2091-01-01'}:{operation_codes:['payment'],reason_code:'data_quality',reason:'Synthetic read-view example only; no payment setup or execution.',status:'active'})};
   const table=kind==='qualification'?'control.business_partner_qualification':'control.business_partner_block';
   const scopeRows=['commercial_capacity','operating_organization','company_code','commodity_category','country'].map(dimension=>{
    const scope={id:id(tenant,`${pack}:${key}:${dimension}`),[kind==='qualification'?'qualification_id':'block_id']:ref,scope_group:1,scope_mode:'include',scope_kind:dimension,selection_mode:dimension==='country'?'selected':'all',...(dimension==='country'?{country_code:'GB',country_purpose:'delivery'}:{}),metadata:{_seed:pack}};
    return `PERFORM pg_temp.ensure_decision_fixture('control.business_partner_decision_scope'::regclass,${quote(JSON.stringify(scope))}::jsonb||jsonb_build_object('tenant_id',t,'created_by',a));`;
   }).join('\n');
   return `PERFORM pg_temp.ensure_decision_fixture('${table}'::regclass,${quote(JSON.stringify(payload))}::jsonb||jsonb_build_object('tenant_id',t,'created_by',a${kind==='restriction'?",'blocked_by',a":''}));
   ${scopeRows}
   ${kind==='restriction'?`UPDATE control.business_partner_block SET scope_sealed=true,updated_at=clock_timestamp(),updated_by=a WHERE tenant_id=t AND id='${ref}'::uuid AND NOT scope_sealed;`:''}`;
  })).join('\n');
  return `DO $fixture$ DECLARE t uuid; a uuid; BEGIN
   SELECT tenant.id,principal.id INTO STRICT t,a FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id WHERE tenant.code=${quote(tenant)} AND principal.code=${quote(actor)} AND tenant.status='active' AND principal.status='active';
   PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.current_actor_type','user',true);
   IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=t AND id='${bp}'::uuid AND metadata->>'_seed'='demo.business-partner-core.v1') THEN RAISE EXCEPTION 'Expected fixture-owned parent missing'; END IF;
   ${rows}
  END $fixture$;`;
 }).join('\n');
 return `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s';
 SELECT set_config('app.database_plane','neon',true);
 SELECT pg_advisory_xact_lock(hashtextextended('${pack}',0));
 DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon DEV required'; END IF; END $$;
 CREATE FUNCTION pg_temp.ensure_decision_fixture(target regclass,payload jsonb) RETURNS void LANGUAGE plpgsql AS $f$
 DECLARE existing jsonb; columns text; projection text; valid boolean;
 BEGIN
  EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE id=$1::uuid',target) INTO existing USING payload->>'id';
  IF existing IS NULL THEN
   SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key) INTO columns,projection FROM jsonb_object_keys(payload) key;
   EXECUTE format('INSERT INTO %s(%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r',target,columns,projection,target) USING payload;
   EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE id=$1::uuid',target) INTO existing USING payload->>'id';
  END IF;
  EXECUTE format('SELECT NOT EXISTS(SELECT 1 FROM jsonb_each($1) p WHERE (to_jsonb(r)->p.key) IS DISTINCT FROM ($2->p.key)) FROM jsonb_populate_record(NULL::%s,$1) r',target) INTO STRICT valid USING payload,existing;
  IF NOT valid THEN RAISE EXCEPTION 'Decision fixture collision or drift in %',target; END IF;
 END $f$;
 ${blocks}
 SET CONSTRAINTS ALL IMMEDIATE;
 ${apply?'COMMIT':'ROLLBACK'};`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {const apply=process.argv.includes('--apply');
 const tenantArgs=process.argv.slice(2).filter(a=>a.startsWith('--tenant='));
 if(tenantArgs.length>1)throw Error('Only one tenant allowed');
 const tenant=tenantArgs[0]?.slice(9)??'cirrusatlantic';
 if(process.argv.slice(2).some(a=>!['--apply','--dry-run','--confirm=LOCAL-BP-DECISION-VIEWS','--tenant=athyper','--tenant=cirrusatlantic'].includes(a)) || (apply&&(!process.argv.includes('--confirm=LOCAL-BP-DECISION-VIEWS')||process.argv.includes('--dry-run'))))throw Error('Use --dry-run or --apply --confirm=LOCAL-BP-DECISION-VIEWS');
 execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:decisionViewSeedSql(apply,tenant),stdio:['pipe','pipe','pipe']});
 console.log(JSON.stringify({pack,tenant,applied:apply,partners:2,qualifications:6,restrictions:6,approvalCreated:false}));
 }catch(error){console.error(error.stderr?.toString()||error.message);process.exitCode=1;}
}
