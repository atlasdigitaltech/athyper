/** Additive, deterministic CATL read fixtures. No permissions or protected bank values are changed. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { id } from './seed-identity.mjs';
export const auditPack = 'demo.business-partner-read-audit.v1';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const fixtureId = key => id('cirrusatlantic', `read-audit:${key}`);
export function readAuditSeedSql(apply = false) {
  const blocks = ['partner', 'person-partner'].map(partner => {
    const bp = id('cirrusatlantic', partner);
    const ensure = (table, key, data, extra = '') => `PERFORM pg_temp.ensure_read_audit('${table}'::regclass,${quote(JSON.stringify({id:fixtureId(`${partner}:${key}`),...data}))}::jsonb || jsonb_build_object('tenant_id',t,'created_by',a${extra}));`;
    const rows = Array.from({length:30}, (_,i) => {
      const n = String(i+1).padStart(2,'0');
      const metadata = {_seed:auditPack};
      const created_at = `2025-02-01T00:00:${n}Z`;
      return [
        ensure('master.contact_person',`contact:${n}`,{owner_id:bp,contact_name:`Read audit contact ${n} (Demo)`,business_title:'Synthetic pagination example',is_primary:false,status:'active',metadata,created_at},",'owner_type_id',owner_type"),
        ensure('master.business_partner',`counterpart:${n}`,{code:`BP-AUDIT-${partner==='partner'?'ORG':'PERSON'}-${n}`,name:`Read audit counterpart ${n} (Demo)`,description:'Synthetic relationship pagination fixture; no role or company assignment.',status:'active',metadata,created_at}),
        ensure('master.business_partner_relationship',`relationship:${n}`,{source_business_partner_id:bp,target_business_partner_id:fixtureId(`${partner}:counterpart:${n}`),relationship_type_code:'affiliate',effective_from:'2025-01-01',notes:'Synthetic pagination example; authorization still evaluates the counterpart.',status:'active',metadata,created_at}),
        ensure('master.certification',`certificate:${n}`,{owner_type:'business_partner',owner_id:bp,custom_name:`Read audit certificate ${n} (Demo)`,certificate_number:`DEMO-READ-${partner}-${n}`,certified_by:'Synthetic issuer',effective_from:'2025-01-01',effective_until:'2099-01-01',status:'active',metadata,created_at}),
      ].join('\n');
    }).join('\n');
    const comments = Array.from({length:6},(_,depth)=>ensure('document.comment',`comment:${depth}`,{context_type:'entity',entity_type:'business_partner',entity_id:bp,comment_text:`[${auditPack}] Demo reply depth ${depth}; published binding controls further replies.`,parent_comment_id:depth?fixtureId(`${partner}:comment:${depth-1}`):null,thread_depth:depth,visibility:'internal',status:'open',created_at:`2025-02-02T00:00:0${depth}Z`},",'commenter_id',a")).join('\n');
    return `DO $fixture$ DECLARE t uuid; a uuid; owner_type uuid; code_row record; n integer:=0;
BEGIN
 SELECT tenant.id,principal.id INTO STRICT t,a FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id WHERE tenant.code='cirrusatlantic' AND principal.code='catl.admin' AND tenant.status='active' AND principal.status='active';
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true),set_config('app.current_actor_type','user',true);
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=t AND id='${bp}'::uuid AND metadata->>'_seed'='demo.business-partner-core.v1') THEN RAISE EXCEPTION 'Expected fixture-owned parent missing'; END IF;
 SELECT id INTO STRICT owner_type FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner';
 ${rows}
 FOR code_row IN SELECT id,code FROM shared.industry_code WHERE domain_code='isic' AND status='active' AND code NOT IN ('72','7210') ORDER BY code LIMIT 30 LOOP
 n:=n+1;
 PERFORM pg_temp.ensure_read_audit('master.business_partner_industry_classification'::regclass,jsonb_build_object('id',md5('${auditPack}:${partner}:'||code_row.code)::uuid,'tenant_id',t,'created_by',a,'business_partner_id','${bp}'::uuid,'industry_domain_code','isic','industry_code_id',code_row.id,'assignment_kind','declared','is_primary',false,'effective_from','2025-01-01','status','active','source_system','demo_seed','source_reference','${auditPack}','metadata',jsonb_build_object('_seed','${auditPack}'),'created_at','2025-02-01T00:01:00Z'));
 END LOOP;
 IF n<>30 THEN RAISE EXCEPTION 'Thirty industry codes required'; END IF;
 ${comments}
END $fixture$;`;
  }).join('\n');
  return `BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s';
SELECT set_config('app.database_plane','neon',true);
SELECT pg_advisory_xact_lock(hashtextextended('${auditPack}',0));
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon DEV required'; END IF; END $$;
CREATE FUNCTION pg_temp.ensure_read_audit(target regclass,payload jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE existing jsonb; columns text; projection text; valid boolean;
BEGIN
 EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE id=$1::uuid',target) INTO existing USING payload->>'id';
 IF existing IS NULL THEN
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key) INTO columns,projection FROM jsonb_object_keys(payload) key;
 EXECUTE format('INSERT INTO %s(%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r',target,columns,projection,target) USING payload;
 EXECUTE format('SELECT to_jsonb(r) FROM %s r WHERE id=$1::uuid',target) INTO existing USING payload->>'id';
 END IF;
 -- PostgreSQL normalizes timestamp strings; compare normalized records field by field.
 EXECUTE format('SELECT NOT EXISTS(SELECT 1 FROM jsonb_each($1) p WHERE (to_jsonb(r)->p.key) IS DISTINCT FROM ($2->p.key)) FROM jsonb_populate_record(NULL::%s,$1) r',target) INTO STRICT valid USING payload,existing;
 IF NOT valid THEN RAISE EXCEPTION 'Read-audit fixture collision or drift in %',target; END IF;
END $f$;
${blocks}
${apply?'COMMIT':'ROLLBACK'};`;
}
export function main(args) {
  const apply=args.includes('--apply');
  if(args.some(a=>!['--apply','--dry-run','--confirm=LOCAL-BP-READ-AUDIT'].includes(a)) || (apply && (!args.includes('--confirm=LOCAL-BP-READ-AUDIT') || args.includes('--dry-run')))) throw Error('Use --dry-run or --apply --confirm=LOCAL-BP-READ-AUDIT');
  execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:readAuditSeedSql(apply),stdio:['pipe','pipe','pipe']});
  console.log(JSON.stringify({pack:auditPack,applied:apply,tenant:'cirrusatlantic',partners:2,contacts:60,relationships:60,counterparts:60,industries:60,certificates:60,comments:12}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) { try {main(process.argv.slice(2));} catch(error) {console.error(error.stderr?.toString()||error.message);process.exitCode=1;} }
